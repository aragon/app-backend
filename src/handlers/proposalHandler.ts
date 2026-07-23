import { Models } from '@dbModels'
import { assert } from '@errors'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import DecodeActions from '@helpers/decodeAction'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import LockToVoteHelper from '@helpers/lockToVoteHelper'
import MetadataRefetchHelper from '@helpers/metadataRefetch'
import MultisigHelper from '@helpers/multisig'
import ProposalHelper from '@helpers/proposal'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import type Plugin from '@models/schema/plugin'
import type Proposal from '@models/schema/proposal'
import type Vote from '@models/schema/vote'
import DbOperations from '@models/utils/dbOperations'
import DbTx from '@modules/dbTx'
import IPFSModule from '@modules/ipfs'
import { ProxyToken } from '@modules/proxyToken'
import { MemberGovernanceFactory } from '@src/governance'
import {
  EnumQueueName,
  type ILogInfo,
  IPluginInterfaceType,
  type IProposalMetadata,
  type IProposalSPPOnChain,
  type IRawAction,
  KnownActionSignature,
  MetadataEntityType,
  type NetworksEnum,
} from '@types'
import { type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'handlers:ProposalHandler' })
export const ProposalHandler = {
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
        // Self-heal: an objection proposal indexed while the tally read failed (or before the
        // feature existed) is missing its stage-1 starting tallies — backfill on replay
        if (relatedPlugin.isObjection && !existingLog.initialTally) {
          const initialTally = await Web3Helper.getTokenVotingProposal(
            pluginAddress,
            proposalIndex,
            info.network,
            info.blockNumber,
          )
          if (initialTally) {
            const updatedProposal = await DbOperations.updateDocument(
              existingLog,
              { initialTally },
              info,
              'Backfill objection initial tally',
              llo,
            )
            if (updatedProposal) {
              await RabbitMQHelper.sendMessage(EnumQueueName.proposalTokenVotingMetrics, {
                id: `${proposalIndex}-${pluginAddress}`,
                params: { proposalIndex, pluginAddress, network: info.network },
              })
            }
          }
        }
        return { newProposal: undefined, relatedPlugin: undefined }
      }

      let settings = await Models.Setting.findLastSettingByBlockNumber(pluginAddress, info.blockNumber)

      if (relatedPlugin.isObjection) {
        settings = (await PluginSettingHandler.syncObjectionSetting(relatedPlugin, info)) || settings
      }
      const proposalMetadata = await ProposalHandler.fetchProposalMetadata(metadataUri, proposalIndex, info.network)

      let rawSettings: any = null

      if (settings) {
        rawSettings = {
          id: settings.id,
          transactionHash: settings.transactionHash,
          blockNumber: settings.blockNumber,
          blockTimestamp: settings.blockTimestamp,
          network: settings.network,
          daoAddress: settings.daoAddress,
          pluginAddress: settings.pluginAddress,
          pluginSubdomain: settings.pluginSubdomain,
          tokenAddress: settings?.tokenAddress, // token address is optional
          onlyListed: settings?.onlyListed,
          minApprovals: settings?.minApprovals,
          isObjection: relatedPlugin.isObjection,
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
      }

      document.decoding = !!document.rawActions?.length

      // Objection sub-proposals start from the first stage's yes/no/abstain results
      // rather than zero — read them through the plugin's TokenVoting link at creation
      if (relatedPlugin.isObjection) {
        const initialTally = await Web3Helper.getTokenVotingProposal(
          pluginAddress,
          proposalIndex,
          info.network,
          info.blockNumber,
        )
        if (initialTally) {
          document.initialTally = initialTally
        } else {
          logger.warn('Objection proposal created without initial tally', llo({ ...info, proposalIndex }))
        }
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
          clockMode: token?.clockMode!,
          blockTimestamp,
        })

        document.snapshot = {
          totalSupply,
        }

        if (document.snapshot.totalSupply === '0') {
          logger.error(
            'Error ProposalHandler.proposalCreated - totalSupply is 0',
            llo({
              ...info,
              parsedEvent,
              pluginAddress,
            }),
          )
        }
      } else if (
        relatedPlugin.interfaceType === IPluginInterfaceType.multisig ||
        relatedPlugin.interfaceType === IPluginInterfaceType.admin
      ) {
        const members = await Models.PluginMember.findAllMembersOfPlugin({
          pluginAddress: relatedPlugin.address,
          network: relatedPlugin.network,
        })
        document.snapshot = {
          membersCount: members.length,
        }
      } else if (relatedPlugin.interfaceType === IPluginInterfaceType.lockToVote) {
        document.snapshot = {
          totalSupply: await LockToVoteHelper.getCurrentTotalSupply(
            relatedPlugin.network,
            relatedPlugin.address,
            info.blockNumber,
          ),
        }

        if (document.snapshot.totalSupply === '0') {
          logger.error(
            'Error ProposalHandler.proposalCreated - totalSupply is 0',
            llo({
              ...info,
              parsedEvent: parsedEvent.args,
              pluginAddress,
            }),
          )
        }
      }

      if (relatedPlugin.interfaceType === IPluginInterfaceType.tokenVoting && !document?.settings?.tokenAddress) {
        logger.warn(
          'Error ProposalHandler.proposalCreated - tokenAddress is missing',
          llo({
            ...info,
            parsedEvent: parsedEvent.args,
            pluginAddress,
          }),
        )
        document.snapshot = {
          totalSupply: '0',
        }
      }

      document.incrementalId = await Models.Proposal.getNextIncrementalId(pluginAddress, info.network)

      const newProposal = await Models.Proposal.create(document)

      logger.verbose('New Proposal', llo({ ...info, logId: newProposal.id }))

      await ProposalHandler.pairSppProposals(newProposal, relatedPlugin, info)

      // Create base member first
      await MemberGovernanceFactory.createBaseMember(newProposal.creatorAddress, info.blockNumber)

      // Spp have no members don't need to update plugin metrics
      if (relatedPlugin.interfaceType !== IPluginInterfaceType.spp) {
        // Create governance instance based on plugin type
        const governance = MemberGovernanceFactory.createFromPlugin(relatedPlugin)

        // Update plugin metrics and increment proposal count
        await governance.updatePluginMetrics({
          memberAddress: newProposal.creatorAddress,
          pluginAddress,
          network: info.network,
          daoAddress: newProposal.daoAddress,
          lastActivity: newProposal.blockNumber,
        })

        await governance.updateDaoMetrics()
      }

      const allMessages: Promise<any>[] = []

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

      try {
        const outOfOrderEvents =
          relatedPlugin.interfaceType !== IPluginInterfaceType.spp
            ? await ProposalHelper.findOutOfOrderProposalEvents(info, pluginAddress, proposalIndex)
            : []
        for (const event of outOfOrderEvents) {
          if (event.kind === 'proposalExecuted') await ProposalHandler.proposalExecuted(event.parsed, event.info)
          else if (event.kind === 'approved') await ProposalHandler.approved(event.parsed, event.info)
          else if (event.kind === 'voteCast') await ProposalHandler.voteCast(event.parsed, event.info)
        }
      } catch (error) {
        logger.error(
          'Error catching up out-of-order proposal events',
          llo({ ...info, error, pluginAddress, proposalIndex }),
        )
      }
    } catch (error) {
      logger.error('Error Create proposal', llo({ ...info, error, parsedEvent: parsedEvent.args }))
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

      await MultisigHelper.processApproval(parsedEvent, info, proposal, plugin)
    } catch (error) {
      logger.error('Error Approved Proposal', llo({ ...info, error, parsedEvent }))
    }
  },

  /**
   * Handles `ObjectionCast` (objection plugins): emitted right after the accompanying `VoteCast`
   * in the same transaction, carrying the TokenVoting option the objected voting power moved away
   * from. The vote row is created by the `VoteCast` handler; this only records the source option
   * so metrics can debit the objected power from its original yes/abstain bucket.
   */
  objectionCast: async (parsedEvent: LogDescription, info: ILogInfo) => {
    try {
      const proposalIndex = parsedEvent.args.proposalId.toString()
      const voterAddress = parsedEvent.args.voter

      const existingMemberVote = await Models.Vote.findVoteOnPlugin({
        network: info.network,
        pluginAddress: info.address,
        memberAddress: voterAddress,
        proposalIndex,
      })

      if (!existingMemberVote) {
        logger.warn('ObjectionCast - vote not found', llo({ ...info, voterAddress, proposalIndex }))
        return
      }

      const updatedVote = await DbOperations.updateDocument(
        existingMemberVote,
        { objectionFromVoteOption: Number(parsedEvent.args.fromVoteOption) },
        info,
        'Objection source option recorded',
        llo,
      )
      if (!updatedVote) return

      await RabbitMQHelper.sendMessage(EnumQueueName.proposalTokenVotingMetrics, {
        id: `${proposalIndex}-${info.address}`,
        params: { proposalIndex, pluginAddress: info.address, network: info.network },
      })
    } catch (error) {
      logger.error('Error ObjectionCast', llo({ ...info, error, parsedEvent }))
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
        tokenAddress: proposal?.settings?.tokenAddress,
        proposalIndex: parsedEvent.args.proposalId.toString(),
        voteOption: Number(parsedEvent.args.voteOption),
        votingPower: parsedEvent.args.votingPower.toString(),
      }

      // lockToVote gov doesn't have any token in setting
      if (proposal?.settings?.tokenAddress) {
        await ProxyToken.saveAndGetToken(proposal.settings.tokenAddress, proposal.network)
      }

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
        await DbTx.safeCommit(session)
        const logName = existingMemberVote ? 'Replace Vote - VoteCast' : 'New Vote - VoteCast'
        logger.verbose(`Created new document - ${logName}`, llo({ ...info, documentId: logId.id }))
      })

      // always update activity
      await MemberGovernanceFactory.createBaseMember(document.memberAddress!, info.blockNumber)

      // always update plugin metrics
      const relatedPlugin = await Models.Plugin.findByAddress(info.address, info.network)
      if (relatedPlugin) {
        const governance = MemberGovernanceFactory.createFromPlugin(relatedPlugin)

        await governance.updatePluginMetrics({
          memberAddress: document.memberAddress!,
          pluginAddress: info.address,
          network: info.network,
          daoAddress: proposal.daoAddress,
          lastActivity: info?.blockNumber,
        })
        await governance.updateDaoMetrics()
      }

      // ObjectionCast immediately follows VoteCast and carries the source option needed for an
      // accurate tally. Let that handler enqueue metrics after it persists the source option.
      if (!plugin.isObjection) {
        await RabbitMQHelper.sendMessage(EnumQueueName.proposalTokenVotingMetrics, {
          id: `${proposalIndex}-${info.address}`,
          params: { proposalIndex, pluginAddress: info.address, network: proposal.network },
        })
      }
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
        await DbTx.safeCommit(session)
        logger.verbose('Updated proposal executed', llo({ logDb: logDb.id, info }))
        return logDb
      })

      if (!proposal) return

      try {
        const orphanTx = await Models.Transaction.findUnlinkedExecution({
          transactionHash: info.transactionHash,
          network: info.network,
          daoAddress: proposal.daoAddress,
          pluginAddress: info.address,
        })
        if (orphanTx) {
          await orphanTx.update({ pluginAddress: info.address, proposalIndex: parsedParams.proposalIndex })
          logger.verbose('Linked orphan execution to proposal', llo({ ...info, executionId: orphanTx.id }))
        }
      } catch (error) {
        logger.error('Error self-healing execution link', llo({ ...info, error }))
      }

      const hashDaoUpgradeAction = proposal.rawActions?.find((action: IRawAction) => {
        const methodHash = Web3Utils.getFunctionSelector(KnownActionSignature.UpgradeToAndCall)
        return action.data?.startsWith(methodHash)
      })

      if (hashDaoUpgradeAction && hashDaoUpgradeAction.to === proposal.daoAddress) {
        await DaoRegistryHandler.handleVersionUpgrade(proposal.daoAddress, info)
      }

      await RabbitMQHelper.sendMessage(EnumQueueName.daoTransactions, {
        id: proposal.daoAddress,
        params: { daoAddress: proposal.daoAddress, network: info.network },
      })

      // Dao metrics
      await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
        id: proposal.daoAddress,
        params: { address: proposal.daoAddress, network: proposal.network },
      })
    } catch (error) {
      logger.error('Error ProposalExecuted', llo({ ...info, error, parsedEvent }))
    }
  },

  fetchProposalMetadata: async (
    metadataUri: string,
    entityId?: string,
    network?: NetworksEnum,
  ): Promise<IProposalMetadata | null> => {
    try {
      const ipfsMetadata = await IPFSModule.fetchMetadata(metadataUri, {
        retries: 2,
        onFetchFailed:
          entityId && network
            ? MetadataRefetchHelper.createFailedCallback(MetadataEntityType.Proposal, entityId, network)
            : undefined,
      })
      return Web3Utils.parseProposalMetadata(ipfsMetadata!)
    } catch (_error) {
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
        await DbTx.safeCommit(session)
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
        await DbTx.safeCommit(session)
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
        const proposalMetadata = await ProposalHandler.fetchProposalMetadata(
          metadataUri,
          parsedEvent.args.proposalId.toString(),
          info.network,
        )

        const rawUpdate: Partial<Proposal> = {
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

        if (proposalMetadata) {
          rawUpdate.title = proposalMetadata.title!
          rawUpdate.description = proposalMetadata.description!
          rawUpdate.summary = proposalMetadata.summary!
          rawUpdate.resources = proposalMetadata.resources as any
          rawUpdate.media = proposalMetadata.media as any
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
        await DbTx.safeCommit(session)
        logger.verbose('Update proposalEdited', llo({ logId: dbLog.id }))
      })
    } catch (error) {
      logger.error('Error proposalEdited', llo({ ...info, error, parsedEvent }))
    }
  },

  voteCleared: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const proposalIndex = parsedEvent.args.proposalId.toString()
    const voterAddress = parsedEvent.args.voter
    try {
      const existingLog = await Models.Vote.exists({
        network: info.network,
        pluginAddress: info.address,
        proposalIndex,
        memberAddress: voterAddress,
        voteCleared: {
          status: true,
          transactionHash: info.transactionHash,
          blockNumber: info.blockNumber,
        },
      })

      if (existingLog) return

      const plugin = await Models.Plugin.findByAddress(info.address, info.network)
      if (!plugin) {
        logger.warn('VoteCleared - Plugin not found', llo(info))
        return
      }

      const proposal = await Models.Proposal.findByProposalIndex(proposalIndex, info.address, info.network)
      if (!proposal) {
        logger.warn('VoteCleared - Proposal not found', llo(info))
        return
      }

      const existingVote = await Models.Vote.findVoteOnPlugin({
        network: info.network,
        pluginAddress: info.address,
        memberAddress: voterAddress,
        proposalIndex,
      })

      if (!existingVote) {
        logger.warn('VoteCleared - Vote not found', llo({ ...info, voterAddress, proposalIndex }))
        return
      }

      const blockTimestamp = await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)

      const voteClearedInfo = {
        status: true,
        transactionHash: info.transactionHash,
        blockNumber: info.blockNumber,
        blockTimestamp: blockTimestamp || 0,
      }

      await DbOperations.updateDocument(existingVote, { voteCleared: voteClearedInfo }, info, 'Vote Cleared', llo)

      await Promise.allSettled([
        RabbitMQHelper.sendMessage(EnumQueueName.proposalTokenVotingMetrics, {
          id: `${proposalIndex}-${info.address}`,
          params: { proposalIndex, pluginAddress: info.address, network: proposal.network },
        }),
        RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
          id: proposal.daoAddress,
          params: { address: proposal.daoAddress, network: proposal.network },
        }),
      ])

      logger.verbose('Vote cleared successfully', llo({ ...info, voteId: existingVote.id, voterAddress }))
    } catch (error) {
      logger.error('Error VoteCleared', llo({ ...info, error, parsedEvent }))
    }
  },
}
