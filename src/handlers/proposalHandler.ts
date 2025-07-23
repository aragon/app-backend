import logger from '@logger'
import {
  EnumQueueName,
  type ILogInfo,
  IMetricAction,
  IPluginInterfaceType,
  type IProposalMetadata,
  type IProposalSPPOnChain,
  type IRawAction,
  ITokenVotingLogs,
} from '@types'
import { Interface, type LogDescription } from 'ethers'
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
import RabbitMQHelper from '@helpers/rabbitMQ'
import DbTx from '@modules/dbTx'
import ProposalHelper from '@helpers/proposal'
import { TokenVoting } from '@src/aragonContracts'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { assert } from '@errors'
import Web3Utils from '@helpers/web3Utils'

const llo = logger.logMeta.bind(null, { service: 'handlers:ProposalHandler' })

export const ProposalHandler = {
  findIncrementalId: async (proposal: Partial<Proposal>): Promise<number | null> => {
    try {
      assert(!!proposal.pluginAddress, 'pluginAddress is required')
      assert(!!proposal.network, 'network is required')
      assert(!!proposal.proposalIndex, 'proposalIndex is required')
      assert(!!proposal.blockNumber, 'blockNumber is required')

      const plugin = await Models.Plugin.findByAddress(proposal.pluginAddress, proposal.network)
      assert(!!plugin, 'plugin not found')

      if (proposal.proposalIndex?.length! < 10) {
        return Number(proposal.proposalIndex)
      }

      const lastSavedProposal = await Models.Proposal.findLastSavedProposal(
        proposal.pluginAddress!,
        proposal.network!,
        proposal.blockNumber,
      )

      const crawler = new BlockchainLogCrawler({
        skipLogProcessing: true,
        fromBlock: lastSavedProposal ? lastSavedProposal.blockNumber : plugin.blockNumber,
        toBlock: proposal.blockNumber,
        logService: null,
        network: proposal.network!,
        address: proposal.pluginAddress,
        stopOnError: false,
        onError: async (error: any) => logger.error('Error findIncrementalId', llo({ error, proposal })),
        events: [
          {
            event: ITokenVotingLogs.ProposalCreated,
            topic: new Interface(TokenVoting.abi).getEvent(ITokenVotingLogs.ProposalCreated)?.topicHash!,
            enableHistorical: false,
            config: [
              {
                abi: TokenVoting.abi,
                handler: async (_parsedEvent: LogDescription, _info: ILogInfo) => {},
              },
            ],
          },
        ],
      })

      const logs = await crawler.crawl()

      if (!logs || logs.length === 0) {
        logger.error('Error findIncrementalId - no logs found', llo({ proposal }))
        return null
      }

      const sortedLogs = logs.sort((a, b) => {
        if (a.info.blockNumber !== b.info.blockNumber) {
          return a.info.blockNumber - b.info.blockNumber
        }
        return a.info.logIndex - b.info.logIndex
      })

      const proposalIds = sortedLogs?.map((log: any) => log.event.args.proposalId.toString())
      const proposalIndex = proposalIds?.findIndex((id: string) => id === proposal.proposalIndex)

      if (proposalIndex === -1) {
        logger.error('Error findIncrementalId not found', llo({ proposal }))
        return null
      }

      if (lastSavedProposal) {
        const calculatedIncrementalId = Number(lastSavedProposal.incrementalId) + proposalIndex
        const existingProposal = await Models.Proposal.findOne({
          incrementalId: calculatedIncrementalId,
          pluginAddress: proposal.pluginAddress,
          network: proposal.network,
        })

        if (existingProposal) {
          logger.error('Error findIncrementalId - incrementalId already used', llo({ existingProposal }))
          return null
        }

        return lastSavedProposal.incrementalId + proposalIndex
      }

      return proposalIndex
    } catch (error) {
      logger.error('Error findIncrementalId', llo({ error, proposal }))
      return null
    }
  },

  proposalCreated: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const pluginAddress = info.address

      const relatedPlugin = await Models.Plugin.findByAddress(pluginAddress, info.network)

      if (!relatedPlugin) {
        logger.warn('Plugin not found', llo(info))
        return { newProposal: undefined, relatedPlugin: undefined }
      }

      info.interfaceType = relatedPlugin.interfaceType
      const metadataUri = Web3Utils.extractMetadataUri(parsedEvent?.args.metadata)!
      const proposalIndex = parsedEvent.args?.proposalId?.toString()
      const existingLog = await Models.Proposal.findExistingLog({
        transactionHash: info.transactionHash,
        pluginAddress,
        proposalIndex,
      })
      if (existingLog) {
        return { newProposal: undefined, relatedPlugin: undefined }
      }

      const settings = await Models.Setting.findLastSettingByBlockNumber(pluginAddress, info.blockNumber)
      const proposalMetadata = await ProposalHandler.fetchProposalMetadata(metadataUri)

      let rawSettings: any = null

      if (settings) {
        rawSettings = {
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
          stages: settings?.stages?.toObject(), // spp settings
        }
      }

      const blockTimestamp = await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)

      const document: Partial<Proposal> = {
        network: info.network,
        blockNumber: info.blockNumber,
        blockTimestamp,
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
        settings: rawSettings,
        rawActions: parsedEvent.args?.actions?.map((w: IRawAction) => ({
          to: w.to,
          value: w.value,
          data: w.data,
        })),
        decoding: parsedEvent.args?.actions?.length > 0,
      }

      // in case startDate is 0 we need to fetch it from the contract
      if (document.startDate === 0) {
        const { startDate, endDate } = await ProposalHandler.handleStartEndDate(document as Proposal, relatedPlugin)
        document.startDate = startDate
        document.endDate = endDate
      }

      if (document?.settings?.tokenAddress && relatedPlugin.interfaceType === IPluginInterfaceType.tokenVoting) {
        const token = await ProxyToken.saveAndGetToken(document.settings.tokenAddress, info.network)

        const totalSupply = await GovernanceErc20Helper.getPastTotalSupply({
          blockNumber: info.blockNumber,
          tokenAddress: document.settings.tokenAddress,
          network: info.network,
          hasClockMode: token?.hasClockMode!,
          blockTimestamp,
        })

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

      if (relatedPlugin.interfaceType === IPluginInterfaceType.tokenVoting && !document?.settings?.tokenAddress) {
        logger.error('Error ProposalHandler.proposalCreated - tokenAddress is missing', llo({ ...info, parsedEvent }))
        document.snapshot = {
          totalSupply: '0',
        }
      }

      const incrementalId = await ProposalHandler.findIncrementalId({
        pluginAddress,
        network: info.network,
        proposalIndex,
        blockNumber: info.blockNumber,
      })

      if (incrementalId === null) {
        logger.error('Error findIncrementalId - incrementalId is null', llo({ ...info, parsedEvent }))
        return { newProposal: undefined, relatedPlugin: undefined }
      }

      document.incrementalId = incrementalId

      const newProposal = await Models.Proposal.create(document)

      logger.verbose('New Proposal', llo({ ...info, logId: newProposal.id }))

      await ProposalHandler.pairSppProposals(newProposal, relatedPlugin, info)
      await ProxyMember.updateActivity({
        memberAddress: newProposal.creatorAddress,
        pluginAddress: relatedPlugin.address,
        network: newProposal.network,
        blockNumber: newProposal.blockNumber,
      })

      await ProxyMember.updateMetricsByAction(IMetricAction.increaseProposalCount, {
        memberAddress: newProposal.creatorAddress,
        pluginAddress,
        network: info.network,
      })

      const allMessages: Promise<any>[] = [
        RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
          id: newProposal.daoAddress,
          params: { address: newProposal.daoAddress, network: newProposal.network },
        }),
      ]

      if (parsedEvent.args?.actions?.length > 0) {
        allMessages.push(
          RabbitMQHelper.sendMessage(EnumQueueName.proposalActions, {
            id: newProposal.id,
            params: { id: newProposal.id, network: newProposal.network },
          }),
        )
      }

      if (relatedPlugin.interfaceType === IPluginInterfaceType.tokenVoting) {
        allMessages.push(
          RabbitMQHelper.sendMessage(EnumQueueName.proposalTokenVotingMetrics, {
            id: `${newProposal.proposalIndex}-${info.address}`,
            params: {
              proposalIndex: newProposal.proposalIndex,
              pluginAddress: info.address,
              network: newProposal.network,
            },
          }),
        )
      } else if (relatedPlugin.interfaceType === IPluginInterfaceType.multisig) {
        allMessages.push(
          RabbitMQHelper.sendMessage(EnumQueueName.proposalMultisigMetrics, {
            id: `${newProposal.proposalIndex}-${info.address}`,
            params: {
              proposalIndex: newProposal.proposalIndex,
              pluginAddress: info.address,
              network: newProposal.network,
            },
          }),
        )
      }

      await Promise.allSettled(allMessages)
    } catch (error) {
      logger.error('Error Create proposal', llo({ ...info, error, parsedEvent }))
      return undefined
    }
  },

  approved: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const proposalIndex = parsedEvent.args.proposalId.toString()

      const plugin = await Models.Plugin.findByAddress(info.address, info.network)
      if (!plugin) {
        logger.warn('Approved - Plugin not found', llo(info))
        return
      }

      if (!plugin.isSupported) {
        logger.warn('Approved - Plugin not supported', llo(info))
        return
      }

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

      await Promise.allSettled([
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
    } catch (error) {
      logger.error('Error Approved Proposal', llo({ ...info, error, parsedEvent }))
    }
  },

  voteCast: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const proposalIndex = parsedEvent.args.proposalId.toString()

      const plugin = await Models.Plugin.findByAddress(info.address, info.network)
      if (!plugin) {
        logger.warn('VoteCast - Plugin not found', llo(info))
        return
      }

      if (!plugin.isSupported && !plugin.tokenAddress) {
        logger.warn('VoteCast - plugin not supported', llo(info))
        return
      }

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

      await Promise.allSettled([
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
    } catch (error) {
      logger.error('Error VoteCast Proposal', llo({ ...info, error, parsedEvent }))
    }
  },

  proposalExecuted: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const parsedParams = {
        proposalIndex: parsedEvent.args.proposalId.toString(),
      }

      const proposal = await DbTx.executeTxFn(async ({ session }) => {
        const proposal = await Models.Proposal.findByProposalIndex(
          parsedParams.proposalIndex,
          info.address,
          info.network,
          { session },
        )
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

        const logDb = await proposal.update(rawUpdate, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Updated proposal executed', llo({ logDb: logDb.id, info }))
        return logDb
      })

      if (!proposal) return

      await Promise.allSettled([
        RabbitMQHelper.sendMessage(EnumQueueName.daoTransactions, {
          id: proposal.daoAddress,
          params: { address: proposal.daoAddress, network: info.network, proposalId: proposal.id },
        }),
        RabbitMQHelper.sendMessage(EnumQueueName.daoAssets, {
          id: proposal.daoAddress,
          params: { address: proposal.daoAddress, network: info.network },
        }),
      ])

      // Dao metrics
      await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: proposal.daoAddress,
        params: { address: proposal.daoAddress, network: proposal.network },
      })
    } catch (error) {
      logger.error('Error ProposalExecuted', llo({ ...info, error, parsedEvent }))
    }
  },

  fetchProposalMetadata: async (metadataUri: string): Promise<IProposalMetadata | null> => {
    try {
      const ipfsMetadata = await IPFSModule.fetchMetadata(metadataUri, { retries: 4 })
      return Web3Utils.parseProposalMetadata(ipfsMetadata!)
    } catch (error) {
      return null
    }
  },

  proposalResultReport: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const proposalIndex = parsedEvent.args.proposalId
      const stage = Number(parsedEvent.args.stageId)
      const pluginAddress = info.address
      const subPluginAddress = parsedEvent.args.body
      const network = info.network

      const proposal = await Models.Proposal.findByProposalIndex(parsedEvent.args.proposalId, pluginAddress, network)

      if (!proposal) {
        logger.warn('Proposal not found', llo(info))
        return
      }

      const sppPlugin = await Models.Plugin.findByAddress(pluginAddress, network)
      assert(sppPlugin?.interfaceType === IPluginInterfaceType.spp, 'Plugin is not SPP')

      const resultType = await ProposalHelper.getBodyResult(
        proposalIndex,
        stage,
        pluginAddress,
        subPluginAddress,
        network,
      )

      if (typeof resultType !== 'number' || isNaN(resultType)) return

      const existingResult = proposal.results.find(
        (result: any) =>
          result.pluginAddress === subPluginAddress &&
          result.resultType === resultType &&
          result.stage === stage &&
          result.transactionHash === info.transactionHash &&
          result.blockNumber === info.blockNumber,
      )

      if (existingResult) {
        logger.verbose('Proposal result already exists, skipping update', llo({ logDb: proposal.id, info }))
        return
      }

      await DbTx.executeTxFn(async ({ session }) => {
        await Models.Proposal.updateOne(
          { _id: proposal._id },
          {
            $push: {
              results: {
                pluginAddress: subPluginAddress,
                resultType,
                stage,
                transactionHash: info.transactionHash,
                blockNumber: info.blockNumber,
              },
            },
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
      })
      logger.verbose('Updated proposal - result report', llo({ logDb: proposal.id, info }))
    } catch (error) {
      logger.error('Error reportProposalResult', llo({ ...info, error, parsedEvent }))
    }
  },

  proposalAdvanced: async (parsedEvent: LogDescription, info: ILogInfo): Promise<void> => {
    try {
      const proposal = await Models.Proposal.findByProposalIndex(
        parsedEvent.args.proposalId,
        info.address,
        info.network,
      )

      if (!proposal) {
        logger.warn('Proposal not found', llo(info))
        return
      }

      const plugin = await Models.Plugin.findByAddress(proposal.pluginAddress, info.network)
      const newStage = Number(parsedEvent.args.stageId)
      const subPlugins = plugin.subPlugins.find((subPlugin: { stageIndex: any }) => subPlugin.stageIndex === newStage)

      const timestamp = (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || undefined
      const previousStageSubProposals = proposal.subProposals.filter(
        (subProposal: any) => subProposal.stageIndex === newStage - 1,
      )

      /**
       * We need to mark as executed all the sub proposals of the previous stage
       */
      await Promise.all(
        previousStageSubProposals.map(async (subProposal: any) => {
          const subProposalDb = await Models.Proposal.findByProposalIndex(
            subProposal.proposalIndex,
            subProposal.pluginAddress,
            info.network,
          )
          if (!subProposalDb) {
            logger.warn('Sub proposal not found', llo({ subProposal, plugin }))
            return
          }

          if (subProposalDb.executed.status) return

          const executed = {
            status: true,
            blockNumber: info.blockNumber,
            transactionHash: info.transactionHash,
            blockTimestamp: timestamp,
          }

          return await DbOperations.updateDocument(
            subProposalDb,
            { executed },
            { logId: proposal.id },
            'Proposal Executed - Sub Proposal',
            llo,
          )
        }),
      )

      const subProposals: any = proposal.subProposals.map((subProposal: any) => {
        return {
          proposalIndex: subProposal.proposalIndex,
          stageIndex: subProposal.stageIndex,
          pluginAddress: subProposal.pluginAddress,
          transactionHash: subProposal.transactionHash,
          blockNumber: subProposal.blockNumber,
        }
      })

      for (const address of subPlugins.addresses) {
        const proposalIndex = await ProposalHelper.getSppSubPluginProposals(
          proposal.proposalIndex,
          newStage,
          address,
          plugin.address,
          proposal.network,
        )

        if (!proposalIndex || proposalIndex === 0) {
          logger.error('Error SPP Proposal index not found', llo({ proposalIndex, address, plugin }))
          continue
        }

        const isAlreadyAdded = subProposals.some(
          (subProposal: any) =>
            subProposal.proposalIndex?.toString() === proposalIndex?.toString() &&
            subProposal.stageIndex?.toString() === newStage?.toString() &&
            subProposal.transactionHash === info.transactionHash &&
            subProposal.blockNumber === info.blockNumber &&
            subProposal.pluginAddress === address,
        )

        if (isAlreadyAdded) {
          logger.warn('Sub-proposal already exists in the array', llo({ proposalIndex, address }))
          continue
        }

        subProposals.push({
          proposalIndex,
          stageIndex: newStage,
          pluginAddress: address,
          transactionHash: info.transactionHash,
          blockNumber: info.blockNumber,
        })

        const subProposalDb = await Models.Proposal.findByProposalIndex(
          proposalIndex.toString(),
          address,
          plugin.network,
        )

        if (!subProposalDb) {
          logger.error('Error Sub Proposal not not found', llo({ proposalIndex, address, plugin }))
          continue
        }

        await DbOperations.updateDocument(
          subProposalDb,
          {
            parentProposal: {
              pluginAddress: proposal.pluginAddress,
              proposalIndex: proposal.proposalIndex,
              stageIndex: newStage,
              transactionHash: info.transactionHash,
              blockNumber: info.blockNumber,
            },
          },
          { logId: proposal.id },
          'Update subProposal with length: ' + subProposals.length,
          llo,
        )
      }

      const proposalInfo = (await ProposalHelper.getProposal({
        plugin,
        proposalIndex: proposal.proposalIndex,
        network: proposal.network,
      })) as IProposalSPPOnChain

      if (!proposalInfo) {
        logger.error(
          'Error ProposalAdvanced - proposalInfo not found missing lastStageTransition',
          llo({ ...info, proposalId: proposal.id }),
        )
      }

      proposal.stageExecutions = proposal.stageExecutions || []

      const stageExecutions = proposal.stageExecutions.map((exec: any) => ({
        stageIndex: exec.stageIndex,
        transactionHash: exec.transactionHash,
        blockNumber: exec.blockNumber,
        blockTimestamp: exec.blockTimestamp,
        status: exec.status,
      }))

      const isStageExecutionAlreadyAdded = stageExecutions.some(
        (exec: any) =>
          exec.stageIndex === newStage - 1 &&
          exec.transactionHash === info.transactionHash &&
          exec.blockNumber === info.blockNumber &&
          exec.blockTimestamp === timestamp &&
          exec.status === true,
      )

      if (isStageExecutionAlreadyAdded) {
        logger.warn('Stage execution already exists in the array', llo({ stageIndex: newStage - 1 }))
        return
      }

      stageExecutions.push({
        stageIndex: newStage - 1,
        transactionHash: info.transactionHash,
        blockNumber: info.blockNumber,
        blockTimestamp: timestamp,
        status: true,
      })

      await DbOperations.updateDocument(
        proposal,
        {
          lastStageTransition: Number(proposalInfo.lastStageTransition),
          stageIndex: newStage,
          subProposals,
          stageExecutions,
        },
        { logId: proposal.id },
        'Proposal Updated - lastStageTransition',
        llo,
      )
    } catch (error) {
      logger.error('Error ProposalAdvanced', llo({ ...info, error, parsedEvent }))
    }
  },

  handleStartEndDate: async (proposal: Proposal, plugin: Plugin): Promise<{ startDate: number; endDate: number }> => {
    const response = await ProposalHelper.getProposal({
      plugin,
      proposalIndex: proposal.proposalIndex,
      network: proposal.network,
    })

    return {
      startDate: Number(response?.parameters?.startDate || 0),
      endDate: Number(response?.parameters?.endDate || 0),
    }
  },

  parseActions: async (proposal: Proposal) => {
    if (!(proposal?.rawActions?.length > 0)) {
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
        { actions: rawActions, decoding: false },
        { logId: proposal.id },
        'Update proposalAction',
        llo,
      )
    } catch (error) {
      logger.error('Error parseActions', llo({ error, proposalId: proposal.id }))
    }
  },

  pairSppProposals: async (proposal: Proposal, plugin: Plugin, info: ILogInfo) => {
    if (!plugin.isSubPlugin && plugin.interfaceType !== IPluginInterfaceType.spp) {
      return
    }

    if (plugin.isSubPlugin) {
      await DbOperations.updateDocument(
        proposal,
        {
          isSubProposal: true,
          stageIndex: plugin.stageIndex,
        },
        info,
        'Update proposal - Sub Proposal',
        llo,
      )
      return
    }

    const proposalInfo = (await ProposalHelper.getProposal({
      plugin,
      proposalIndex: proposal.proposalIndex,
      network: proposal.network,
    })) as IProposalSPPOnChain

    if (!proposalInfo) {
      logger.error('Error ProposalAdvanced - proposalInfo not found...')
      return
    }
    const lastStageTransition = Number(proposalInfo.lastStageTransition)
    const currentStage = Math.max(Number(proposalInfo.currentStage) - 1, 0)

    const subPlugins = plugin.subPlugins?.find(sp => sp.stageIndex === currentStage)
    const subPluginData = await Promise.all(
      subPlugins?.addresses?.map(async address => {
        const proposalIndex = await ProposalHelper.getSppSubPluginProposals(
          proposal.proposalIndex,
          currentStage,
          address,
          plugin.address,
          proposal.network,
        )
        return { address, proposalIndex }
      }) || [],
    )

    try {
      await DbTx.executeTxFn(async ({ session }) => {
        proposal = await proposal.reload({ session })

        proposal.stageIndex = currentStage
        proposal.lastStageTransition = lastStageTransition
        proposal.isSubProposal = false
        proposal.totalStages = plugin.totalStages
        proposal.subProposals = []

        await Promise.all(
          subPluginData.map(async ({ address, proposalIndex }) => {
            if (proposalIndex !== false) {
              proposal.subProposals.push({
                proposalIndex: proposalIndex.toString(),
                stageIndex: proposal.stageIndex,
                pluginAddress: address,
                transactionHash: info.transactionHash,
                blockNumber: info.blockNumber,
              })
            }

            const subProposalDb = await Models.Proposal.findByProposalIndex(
              proposalIndex.toString(),
              address,
              plugin.network,
              { session },
            )

            if (subProposalDb) {
              await subProposalDb.update(
                {
                  parentProposal: {
                    pluginAddress: proposal.pluginAddress,
                    proposalIndex: proposal.proposalIndex,
                    stageIndex: proposal.stageIndex,
                    transactionHash: info.transactionHash,
                    blockNumber: info.blockNumber,
                  },
                },
                { session },
              )
            }
          }),
        )

        await proposal.save({ session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Update proposal - pairSppProposals', llo({ logId: proposal.id, info }))
      })
    } catch (error) {
      logger.error('Error pairSppProposals', llo({ error, network: proposal.network, proposalId: proposal.id }))
    }
  },

  proposalCanceled: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const proposal = await Models.Proposal.findByProposalIndex(
        parsedEvent.args.proposalId.toString(),
        info.address,
        info.network,
      )

      if (!proposal) {
        logger.warn('Proposal not found', llo(info))
        return
      }

      const rawUpdate: Partial<Proposal> = {
        cancelTxInfo: {
          blockNumber: info.blockNumber,
          transactionHash: info.transactionHash,
          blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || null,
        },
      }

      await DbOperations.updateDocument(
        proposal,
        rawUpdate,
        { logId: proposal.id, info },
        'Update proposalCanceled',
        llo,
      )
    } catch (error) {
      logger.error('Error proposalCanceled', llo({ ...info, error, parsedEvent }))
    }
  },

  proposalEdited: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      await DbTx.executeTxFn(async ({ session }) => {
        const proposal = await Models.Proposal.findByProposalIndex(
          parsedEvent.args.proposalId.toString(),
          info.address,
          info.network,
          { session },
        )

        if (!proposal) {
          logger.warn('Proposal not found', llo(info))
          return
        }

        const metadataUri = Web3Utils.extractMetadataUri(parsedEvent?.args.metadata)!
        const proposalMetadata = await ProposalHandler.fetchProposalMetadata(metadataUri)

        const rawUpdate: Partial<Proposal> = {
          title: proposalMetadata?.title!,
          description: proposalMetadata?.description!,
          summary: proposalMetadata?.summary!,
          resources: proposalMetadata?.resources as any,
          media: proposalMetadata?.media as any,
          rawActions: parsedEvent.args?.actions?.map((w: IRawAction) => ({
            to: w.to,
            value: w.value,
            data: w.data,
          })),
          editedTxInfo: {
            blockNumber: info.blockNumber,
            transactionHash: info.transactionHash,
            blockTimestamp: (await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)) || null,
          },
        }

        const decodeActions = new DecodeActions()

        rawUpdate.actions = await Promise.all(
          rawUpdate.rawActions!.map(async (action: any) => {
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

        const dbLog = await proposal.update(rawUpdate, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Update proposalEdited', llo({ logId: dbLog.id }))
      })
    } catch (error) {
      logger.error('Error proposalEdited', llo({ ...info, error, parsedEvent }))
    }
  },
}
