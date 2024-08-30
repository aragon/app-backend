import logger from '@logger'
import { type ILogInfo, IMetricAction, type IProposalMetadata, type IRawAction } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import IPFSModule from '@modules/ipfs'
import type Vote from '@models/schema/vote'
import Web3Helper from '@helpers/web3'
import { ProxyMember } from '@modules/proxyMember'
import { ProxyToken } from '@modules/proxyToken'
import { AggregatorProposalMetrics } from '@indexer/aggregator/proposalMetrics'
import type Proposal from '@models/schema/proposal'
import DecodeActions from '@helpers/decodeAction'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import DbOperations from '@models/utils/dbOperations'
import { AggregatorDaoMetrics } from '@indexer/aggregator/daoMetrics'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:ProposalHandler' })

export const ProposalHandler = {
  proposalCreated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const pluginAddress = info.address
    const relatedPlugin = await Models.Plugin.findByAddress(pluginAddress, info.network)

    if (!relatedPlugin) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    const metadataUri = Web3Helper.extractMetadataUri(parsedEvent?.args.metadata)!
    const proposalIndex = Number(parsedEvent.args.proposalId)
    const existingLog = await Models.Proposal.findExistingLog({
      transactionHash: info.transactionHash,
      pluginAddress,
      proposalIndex,
    })
    if (existingLog) return

    const settings = await Models.Setting.findLastSettingByBlockNumber(pluginAddress, info.blockNumber)
    const proposalMetadata = await ProposalHandler.fetchProposalMetadata(metadataUri)

    const document: Partial<Proposal> = {
      network: info.network,
      blockNumber: info.blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
      transactionHash: info.transactionHash,
      title: proposalMetadata.title!,
      description: proposalMetadata.description!,
      summary: proposalMetadata.summary!,
      resources: proposalMetadata.resources as any,
      media: proposalMetadata.media as any,
      daoAddress: relatedPlugin.daoAddress,
      pluginAddress,
      pluginSubdomain: relatedPlugin.subdomain,
      creatorAddress: parsedEvent.args.creator,
      proposalIndex,
      startDate: Number(parsedEvent.args.startDate),
      endDate: Number(parsedEvent.args.endDate),
      allowFailureMap: Number(parsedEvent.args.allowFailureMap),
      metadataUri,

      // setting needs to be static as they will never change during the proposal lifecycle
      settings: {
        id: settings?.id,
        transactionHash: settings.transactionHash,
        blockNumber: settings.blockNumber,
        blockTimestamp: settings.blockTimestamp,
        network: settings.network,
        daoAddress: settings.daoAddress,
        pluginAddress: settings.pluginAddress,
        pluginSubdomain: settings.pluginSubdomain,
        tokenAddress: settings.tokenAddress,
        onlyListed: settings?.onlyListed,
        minApprovals: settings?.minApprovals,
        votingMode: settings?.votingMode,
        supportThreshold: settings?.supportThreshold,
        minParticipation: settings?.minParticipation,
        minDuration: settings?.minDuration,
        minProposerVotingPower: settings?.minProposerVotingPower,
      },
      rawActions: parsedEvent.args?.actions.map((w: IRawAction) => ({
        to: w.to,
        value: w.value,
        data: w.data,
      })),
    }

    if (relatedPlugin.tokenAddress) {
      document.snapshot = {
        totalSupply:
          (await GovernanceErc20Helper.getPastTotalSupply(
            info.blockNumber,
            relatedPlugin.tokenAddress,
            relatedPlugin.network,
          )) || '0',
      }
    } else {
      const members = await Models.DaoMemberMapping.findAllMembersOfPlugin({
        pluginAddress: relatedPlugin.address,
        network: relatedPlugin.network,
      })
      document.snapshot = {
        membersCount: members.length,
      }
    }

    const newProposal = await DbOperations.createDocument(Models.Proposal, document, info, 'New Log Proposal', llo)

    await Promise.all([
      ProposalHandler.parseActions(newProposal),
      ProxyMember.memberActivity(newProposal.creatorAddress, newProposal.blockNumber, newProposal.network),
      ProxyMember.updateMemberMetrics(IMetricAction.increaseProposalCount, {
        memberAddress: newProposal.creatorAddress,
        pluginAddress,
        network: info.network,
      }),
      AggregatorDaoMetrics.start({
        daoAddress: newProposal?.daoAddress,
        network: newProposal?.network,
      }),
    ])
  },

  approved: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const proposalIndex = Number(parsedEvent.args.proposalId)
    const proposal = await Models.Proposal.findByProposalIndex(proposalIndex, info.address, info.network)

    if (!proposal) {
      logger.warn('Approved - Proposal not found', llo(info))
      return
    }

    const existingLog = await Models.Vote.findExistingLog({
      network: info.network,
      transactionHash: info.transactionHash,
      pluginAddress: info.address,
      proposalIndex,
    })
    if (existingLog) return

    const document: Partial<Vote> = {
      network: info.network,
      transactionHash: info.transactionHash,
      blockNumber: info.blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
      daoAddress: proposal?.daoAddress,
      pluginAddress: info.address,
      memberAddress: parsedEvent.args.approver,
      proposalIndex: Number(parsedEvent.args.proposalId),
    }

    await DbOperations.createDocument(Models.Vote, document, info, 'New Vote - Approved', llo)

    // NOTE: improve scalability, use queue messages
    await Promise.all([
      ProxyMember.memberActivity(document.memberAddress!, info.blockNumber, info.network),
      ProxyMember.updateMemberMetrics(IMetricAction.increaseVoteCount, {
        memberAddress: document.memberAddress!,
        pluginAddress: info.address,
        network: info.network,
      }),
      AggregatorProposalMetrics.proposalMultisigMetrics({
        proposalIndex,
        pluginAddress: info.address,
        network: info.network,
      }),
      AggregatorDaoMetrics.start({
        daoAddress: proposal?.daoAddress,
        network: proposal?.network,
      }),
    ])
  },

  voteCast: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const proposalIndex = Number(parsedEvent.args.proposalId)
    const proposal = await Models.Proposal.findByProposalIndex(proposalIndex, info.address, info.network)

    if (!proposal) {
      logger.warn('VoteCast - Proposal not found', llo(info))
      return
    }

    const existingLog = await Models.Vote.findExistingLog({
      network: info.network,
      transactionHash: info.transactionHash,
      pluginAddress: info.address,
      proposalIndex,
    })
    if (existingLog) return

    const document: Partial<Vote> = {
      network: info.network,
      transactionHash: info.transactionHash,
      blockNumber: info.blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
      daoAddress: proposal.daoAddress,
      pluginAddress: info.address,
      memberAddress: parsedEvent.args.voter,
      tokenAddress: proposal.settings.tokenAddress,
      proposalIndex: Number(parsedEvent.args.proposalId),
      voteOption: Number(parsedEvent.args.voteOption),
      votingPower: parsedEvent.args.votingPower.toString(),
    }

    if (proposal.settings.tokenAddress) {
      await ProxyToken.saveAndGetToken(proposal.settings.tokenAddress, proposal.network)
    }

    await DbOperations.createDocument(Models.Vote, document, info, 'New Vote - VoteCast', llo)

    // update all metrics
    await Promise.all([
      ProxyMember.memberActivity(document.memberAddress!, info.blockNumber, info.network),
      ProxyMember.updateMemberMetrics(IMetricAction.increaseVoteCount, {
        memberAddress: document.memberAddress!,
        pluginAddress: info.address,
        network: info.network,
      }),
      AggregatorProposalMetrics.proposalTokenVotingMetrics({
        proposalIndex,
        pluginAddress: info.address,
        network: info.network,
      }),
      AggregatorDaoMetrics.start({
        daoAddress: proposal?.daoAddress,
        network: proposal?.network,
      }),
    ])
  },

  proposalExecuted: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const parsedParams = {
      proposalIndex: Number(parsedEvent.args.proposalId),
    }
    const proposal = await Models.Proposal.findByProposalIndex(parsedParams.proposalIndex, info.address, info.network)
    if (!proposal) {
      logger.warn('proposal not found', llo({ ...info, parsedEvent }))
      return
    }

    if (proposal?.executed?.status) return

    const rawUpdate = {
      executed: {
        status: true,
        blockNumber: info.blockNumber,
        blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
      },
    }

    await DbOperations.updateDocument(proposal, rawUpdate, { logId: proposal.id }, 'Update proposalExecuted', llo)

    await AggregatorDaoMetrics.start({
      daoAddress: proposal?.daoAddress,
      network: proposal?.network,
    })
  },

  fetchProposalMetadata: async (metadataUri: string): Promise<IProposalMetadata> => {
    const ipfsMetadata = await IPFSModule.fetchMetadata(metadataUri, { retries: 1 })
    const proposalMetadata = Web3Helper.parseProposalMetadata(ipfsMetadata!)
    return proposalMetadata
  },

  parseActions: async (proposal: Proposal) => {
    if (!(proposal.rawActions?.length > 0)) {
      return []
    }

    try {
      const decodeActions = new DecodeActions()
      const parsedActions = proposal.rawActions
      const rawActions = await Promise.all(
        parsedActions.map(async (action: any) => {
          let decodeData: any

          if (action.data?.length >= 10) {
            decodeData = await decodeActions.decodeData(action, proposal)
          } else {
            decodeData = await decodeActions.decodeTransfer(action, proposal)
          }

          if (decodeData) {
            return decodeData
          }

          return []
        }),
      )

      return await DbOperations.updateDocument(
        proposal,
        { actions: rawActions },
        { logId: proposal.id },
        'Update proposalAction',
        llo,
      )
    } catch (error) {
      logger.error('Error parseActions', llo({ error, proposalId: proposal.id }))
    }
  },
}
