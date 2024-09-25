import logger from '@logger'
import {
  EnumQueueName,
  type ILogInfo,
  IMetricAction,
  type IProposalMetadata,
  IProposalType,
  type IRawAction,
} from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import IPFSModule from '@modules/ipfs'
import type Vote from '@models/schema/vote'
import Web3Helper from '@helpers/web3'
import { ProxyMember } from '@modules/proxyMember'
import { ProxyToken } from '@modules/proxyToken'
import type Proposal from '@models/schema/proposal'
import DecodeActions from '@helpers/decodeAction'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import DbOperations from '@models/utils/dbOperations'
import { RabbitMQHelper } from '@helpers/redditMQ'
import DbTx from '@modules/dbTx'
import ProposalHelper from '@helpers/proposal'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:handlers:ProposalHandler' })

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

    // in case startDate is 0 we need to fetch it from the contract
    if (document.startDate === 0) {
      const { startDate, endDate } = await ProposalHandler.handleStartEndDate(document as Proposal)
      document.startDate = startDate
      document.endDate = endDate
    }

    if (relatedPlugin.tokenAddress) {
      const totalSupply = await GovernanceErc20Helper.getPastTotalSupply(
        info.blockNumber,
        relatedPlugin.tokenAddress,
        relatedPlugin.network,
      )

      document.snapshot = {
        totalSupply: totalSupply?.toString() ?? '0',
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

    await ProxyMember.updateActivity({
      memberAddress: newProposal.creatorAddress,
      pluginAddress: relatedPlugin.address,
      network: newProposal.network,
      blockNumber: newProposal.blockNumber,
    })

    await Promise.all([
      ProposalHandler.parseActions(newProposal),
      ProxyMember.updateMetricsByAction(IMetricAction.increaseProposalCount, {
        memberAddress: newProposal.creatorAddress,
        pluginAddress,
        network: info.network,
      }),
      // Dao metrics
      RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: newProposal.daoAddress,
        params: { address: newProposal.daoAddress, network: newProposal.network },
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
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
    })
    if (existingLog) return

    const document: Partial<Vote> = {
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      blockNumber: info.blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
      daoAddress: proposal?.daoAddress,
      pluginAddress: info.address,
      memberAddress: parsedEvent.args.approver,
      proposalIndex: Number(parsedEvent.args.proposalId),
    }

    await DbOperations.createDocument(Models.Vote, document, info, 'New Vote - Approved', llo)

    await ProxyMember.updateActivity({
      memberAddress: document.memberAddress!,
      pluginAddress: info.address,
      network: info.network,
      blockNumber: info.blockNumber,
    })

    await Promise.all([
      ProxyMember.updateMetricsByAction(IMetricAction.increaseVoteCount, {
        memberAddress: document.memberAddress!,
        pluginAddress: info.address,
        network: info.network,
      }),
      // Proposal metrics
      RabbitMQHelper.sendMessage(EnumQueueName.proposalMultisigMetrics, {
        id: `${proposalIndex}-${info.address}`,
        params: { proposalIndex, pluginAddress: info.address, network: proposal.network },
      }),
      // Dao metrics
      RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: proposal.daoAddress,
        params: { address: proposal.daoAddress, network: proposal.network },
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
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
    })
    if (existingLog) return

    const document: Partial<Vote> = {
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
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

    // find existing voting
    const existingMemberVote = await Models.Vote.findVoteOnPlugin({
      network: info.network,
      pluginAddress: info.address,
      memberAddress: parsedEvent.args.voter,
      proposalIndex: Number(parsedEvent.args.proposalId),
    })
    const isExistingVote = !!existingMemberVote

    // handle replace vote and persist the previous vote by transactionHash
    if (isExistingVote) {
      document.replacedTransactionHash = existingMemberVote.transactionHash
    }

    await DbTx.executeTxFn(async ({ session }) => {
      const logId = await Models.Vote.create(document, { session })

      if (isExistingVote) {
        await existingMemberVote.deleteOne({ session })
      }

      await session.commitTransaction()
      await session.endSession()

      const logName = existingMemberVote ? 'Replace Vote - VoteCast' : 'New Vote - VoteCast'
      logger.verbose(`Created new document - ${logName}`, llo({ ...info, documentId: logId.id }))
    })

    if (!isExistingVote) {
      // only increase vote count if it's a new vote
      await ProxyMember.updateMetricsByAction(IMetricAction.increaseVoteCount, {
        memberAddress: document.memberAddress!,
        pluginAddress: info.address,
        network: info.network,
      })
    }

    // always update updateActivity
    await ProxyMember.updateActivity({
      memberAddress: document.memberAddress!,
      pluginAddress: info.address,
      network: info.network,
      blockNumber: info.blockNumber,
    })

    await Promise.all([
      // Proposal metrics
      RabbitMQHelper.sendMessage(EnumQueueName.proposalTokenVotingMetrics, {
        id: `${proposalIndex}-${info.address}`,
        params: { proposalIndex, pluginAddress: info.address, network: proposal.network },
      }),
      // Dao metrics
      RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: proposal.daoAddress,
        params: { address: proposal.daoAddress, network: proposal.network },
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
        transactionHash: info.transactionHash,
        blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
      },
    }

    await DbOperations.updateDocument(proposal, rawUpdate, { logId: proposal.id, info }, 'Update proposalExecuted', llo)

    // Dao metrics
    await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
      id: proposal.daoAddress,
      params: { address: proposal.daoAddress, network: proposal.network },
    })
  },

  fetchProposalMetadata: async (metadataUri: string): Promise<IProposalMetadata> => {
    const ipfsMetadata = await IPFSModule.fetchMetadata(metadataUri, { retries: 1 })
    const proposalMetadata = Web3Helper.parseProposalMetadata(ipfsMetadata!)
    return proposalMetadata
  },

  handleStartEndDate: async (proposal: Proposal): Promise<{ startDate: number; endDate: number }> => {
    const response = await ProposalHelper.getProposal({
      proposalType: proposal.settings?.tokenAddress ? IProposalType.tokenVoting : IProposalType.multisig,
      proposalIndex: proposal.proposalIndex,
      pluginAddress: proposal.pluginSubdomain,
      network: proposal.network,
    })

    return {
      startDate: Number(response?.parameters?.startDate || 0),
      endDate: Number(response?.parameters?.endDate || 0),
    }
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
