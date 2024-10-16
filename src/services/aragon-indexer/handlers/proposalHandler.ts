import logger from '@logger'
import {
  EnumQueueName,
  type HexAddress,
  type ILogInfo,
  IMetricAction,
  IPluginInterfaceType,
  type IProposalMetadata,
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
import type Plugin from '@models/schema/plugin'
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

    if (relatedPlugin.interfaceType === IPluginInterfaceType.admin) {
      logger.warn('Proposal from admin plugin not supported', llo(info))
      return
    }

    const metadataUri = Web3Helper.extractMetadataUri(parsedEvent?.args.metadata)!
    const proposalIndex = parsedEvent.args.proposalId.toString()
    const existingLog = await Models.Proposal.findExistingLog({
      transactionHash: info.transactionHash,
      pluginAddress,
      proposalIndex,
    })
    if (existingLog) return

    const settings = await Models.Setting.findLastSettingByBlockNumber(pluginAddress, info.blockNumber)
    const proposalMetadata = await ProposalHandler.fetchProposalMetadata(metadataUri)

    if (!settings) {
      logger.error('Plugin setting not found - cannot create proposal without setting', llo(info, pluginAddress))
      return
    }

    const document: Partial<Proposal> = {
      network: info.network,
      blockNumber: info.blockNumber,
      blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined,
      transactionHash: info.transactionHash,
      title: proposalMetadata?.title!,
      description: proposalMetadata?.description!,
      summary: proposalMetadata?.summary!,
      resources: proposalMetadata?.resources as any,
      media: proposalMetadata?.media as any,
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
        stages: settings?.stages, // spp settings
      },
      rawActions: parsedEvent.args?.actions.map((w: IRawAction) => ({
        to: w.to,
        value: w.value,
        data: w.data,
      })),
    }

    // in case startDate is 0 we need to fetch it from the contract
    if (document.startDate === 0) {
      const { startDate, endDate } = await ProposalHandler.handleStartEndDate(document as Proposal, relatedPlugin)
      document.startDate = startDate
      document.endDate = endDate
    }

    if (document?.settings?.tokenAddress && relatedPlugin.interfaceType === IPluginInterfaceType.tokenVoting) {
      const totalSupply = await GovernanceErc20Helper.getPastTotalSupply(
        document.blockNumber!,
        document?.settings.tokenAddress,
        document.network!,
      )

      document.snapshot = {
        totalSupply: totalSupply?.toString() ?? '0',
      }
    } else if (
      relatedPlugin.interfaceType === IPluginInterfaceType.multisig ||
      relatedPlugin.interfaceType === IPluginInterfaceType.admin
    ) {
      const members = await Models.DaoMemberMapping.findAllMembersOfPlugin({
        pluginAddress: relatedPlugin.address,
        network: relatedPlugin.network,
      })
      document.snapshot = {
        membersCount: members.length,
      }
    }

    const newProposal = await DbOperations.createDocument(Models.Proposal, document, info, 'New Log Proposal', llo)

    await ProposalHandler.pairSppProposals(newProposal, relatedPlugin, info)
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
    const proposalIndex = parsedEvent.args.proposalId.toString()
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
      proposalIndex: parsedEvent.args.proposalId.toString(),
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
    const proposalIndex = parsedEvent.args.proposalId.toString()
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
      proposalIndex: parsedEvent.args.proposalId.toString(),
      voteOption: Number(parsedEvent.args.voteOption),
      votingPower: parsedEvent.args.votingPower.toString(),
    }

    await ProxyToken.saveAndGetToken(proposal.settings.tokenAddress, proposal.network)

    // find existing voting
    const existingMemberVote = await Models.Vote.findVoteOnPlugin({
      network: info.network,
      pluginAddress: info.address,
      memberAddress: parsedEvent.args.voter,
      proposalIndex: parsedEvent.args.proposalId.toString(),
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
      proposalIndex: parsedEvent.args.proposalId.toString(),
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

  fetchProposalMetadata: async (metadataUri: string): Promise<IProposalMetadata | null> => {
    try {
      const ipfsMetadata = await IPFSModule.fetchMetadata(metadataUri, { retries: 1 })
      return Web3Helper.parseProposalMetadata(ipfsMetadata!)
    } catch (error) {
      return null
    }
  },

  proposalAdvanced: async (parsedEvent: LogDescription, info: ILogInfo): Promise<void> => {
    // TODO: it should have parsedEvent.args.proposalId, parsedEvent.args.newStage
    const proposal = await Models.Proposal.findByProposalIndex(parsedEvent.args.proposalId, info.address, info.network)

    if (!proposal) {
      logger.warn('Proposal not found', llo(info))
    }

    const newStage = parsedEvent.args.stageId
    await proposal.update({ stageIndex: newStage })
    const plugin = await Models.Plugin.findByAddress(proposal.pluginAddress, info.network)

    const subPlugins = plugin.subPlugins.find(
      async (subPlugin: { stageIndex: any }) => subPlugin.stageIndex === newStage,
    )

    subPlugins?.addresses?.map(async (address: HexAddress) => {
      const proposalIndex = await Web3Helper.getSppSubPluginProposals(
        proposal.proposalIndex,
        newStage,
        address,
        plugin.address,
        proposal.network,
      )
      if (proposalIndex !== false) {
        proposal.subProposals.push({ proposalIndex, stageIndex: newStage, pluginAddress: address })
      }

      const subProposalDb = await Models.Proposal.findByProposalIndex(proposalIndex, address, plugin.network)
      subProposalDb.update({
        parentProposal: {
          pluginAddress: proposal.pluginAddress,
          proposalIndex: proposal.proposalIndex,
          stageIndex: newStage,
        },
      })
    })
  },

  handleStartEndDate: async (proposal: Proposal, plugin: Plugin): Promise<{ startDate: number; endDate: number }> => {
    const response = await ProposalHelper.getProposal({
      proposalType: plugin.interfaceType,
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

  pairSppProposals: async (proposal: Proposal, plugin: Plugin, info: ILogInfo) => {
    logger.verbose('pair spp proposals', llo({ proposal, plugin, info }))

    // proposal of a spp plugin
    if (plugin.interfaceType === IPluginInterfaceType.spp) {
      proposal.isSubProposal = false
      proposal.totalStages = plugin.totalStages
      proposal.subProposals = []

      const proposalInfo = await Web3Helper.getSppProposal(proposal.proposalIndex, plugin.address, proposal.network)
      if (proposalInfo) {
        proposal.stageIndex = proposalInfo.currentStage
      }

      const subPlugins = plugin.subPlugins.find(async subPlugin => subPlugin.stageIndex === proposal.stageIndex)
      subPlugins?.addresses?.map(async (address: HexAddress) => {
        const proposalIndex = await Web3Helper.getSppSubPluginProposals(
          proposal.proposalIndex,
          proposal.stageIndex!,
          address,
          plugin.address,
          proposal.network,
        )
        if (proposalIndex !== false) {
          proposal.subProposals.push({
            proposalIndex: proposalIndex.toString(),
            stageIndex: proposal.stageIndex,
            pluginAddress: address,
          })
        }

        const subProposalDb = await Models.Proposal.findByProposalIndex(
          proposalIndex.toString(),
          address,
          plugin.network,
        )
        subProposalDb.update({
          parentProposal: {
            pluginAddress: proposal.pluginAddress,
            proposalIndex: proposal.proposalIndex,
            stageIndex: proposal.stageIndex,
          },
        })
      })
    }

    // proposal of a sub plugin
    if (plugin.isSubPlugin) {
      proposal.isSubProposal = true
      proposal.stageIndex = plugin.stageIndex
    }
  },
}
