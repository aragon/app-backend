import logger from '@logger'
import { IEventLogMember, type NetworksEnum } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'

import DbTx from '@modules/dbTx'
import Web3Helper from '@helpers/web3'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:MemberHandler' })

export const MemberHandler = {
  membersAdded: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo = {
      transactionHash: txLog.transactionHash,
      network,
    }

    const existingLog = await Models.LogMember.findByTxHash(logInfo.transactionHash)

    if (!existingLog) {
      const pluginExisted = await Models.LogPluginSetupProcessor.findByPluginAddress(txLog.address, network)

      if (!pluginExisted) {
        logger.warn('Plugin not found', llo({ logInfo }))
        return
      }

      await DbTx.executeTxFn(async ({ session }) => {
        const daoMembersIds: any = []

        for (const member of parsedEvent.args.members) {
          const rawMember = {
            address: member,
            blockNumber: txLog.blockNumber,
            transactionHash: logInfo.transactionHash,
            event: parsedEvent.name,
            pluginAddress: txLog.address,
            network,
            entityId: null,
          }

          rawMember.entityId = Models.LogMember.getEntityId(logInfo.transactionHash, parsedEvent.name + '_' + member)
          const daoMember = await Models.LogMember.create(rawMember, { session })
          daoMembersIds.push(daoMember.id)
        }

        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'New LogMembers: Added',
          llo({
            logInfo,
            logId: daoMembersIds,
          }),
        )
      })
    }
  },

  membersRemoved: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const logInfo = {
      transactionHash: txLog.transactionHash,
      network,
    }

    const existingLog = await Models.LogMember.findByTxHash(logInfo.transactionHash)

    if (!existingLog) {
      const pluginExisted = await Models.LogPluginSetupProcessor.findByPluginAddress(txLog.address, network)

      if (!pluginExisted) {
        logger.warn('Plugin not found', llo({ logInfo }))
        return
      }

      await DbTx.executeTxFn(async ({ session }) => {
        const daoMembersIds: any = []
        for (const member of parsedEvent.args.members) {
          const rawMember = {
            address: member,
            blockNumber: txLog.blockNumber,
            transactionHash: logInfo.transactionHash,
            event: parsedEvent.name,
            pluginAddress: txLog.address,
            network,
            entityId: null,
          }

          rawMember.entityId = Models.LogMember.getEntityId(logInfo.transactionHash, parsedEvent.name + '_' + member)

          const daoMember = await Models.LogMember.create(rawMember, { session })
          daoMembersIds.push(daoMember.id)
        }

        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'New LogMembers: Removed',
          llo({
            logId: daoMembersIds,
            logInfo,
          }),
        )
      })
    }
  },

  delegateChanged: async (parsedEvent: LogDescription, txLog: any, network: NetworksEnum) => {
    const transactionHash = txLog.transactionHash || txLog.hash
    const logInfo = {
      transactionHash,
      network,
    }

    const txReceipt = await Web3Helper.getTransactionReceipt(transactionHash, network)

    const existingLog = await Models.LogMember.findExistingLog(transactionHash, parsedEvent.name)

    if (!existingLog && txReceipt) {
      const relatedPlugin = await Models.LogPluginSetupProcessor.findPluginByTokenAddress(txLog.address, network)

      if (!relatedPlugin) {
        logger.warn('Plugin not found', llo({ logInfo }))
        return
      }

      const delegationVotesChangedLogs = Web3Helper.findLogsByName(
        txReceipt,
        IEventLogMember.DelegateVotesChanged,
        GovernanceERC20.abi,
      )

      const delegationVote = delegationVotesChangedLogs.find(
        (log: any) => Web3Helper.formatAddress(log.txLog.topics[1]) === parsedEvent.args.toDelegate,
      )

      if (!delegationVote) {
        logger.warn('DelegateVotesChanged not found. Invalid log', llo({ txLog }))
        return
      }

      await DbTx.executeTxFn(async ({ session }) => {
        const rawDaoMember = {
          transactionHash,
          blockNumber: txLog.blockNumber,
          network,
          address: parsedEvent.args.toDelegate,
          event: parsedEvent.name,
          tokenAddress: txLog.address,
          fromDelegate: parsedEvent.args.fromDelegate,
          toDelegate: parsedEvent.args.toDelegate,
          delegatingMember: parsedEvent.args.delegator,
          previousVotingPower: delegationVote?.parsed!.args.previousBalance.toString(),
          newVotingPower: delegationVote?.parsed!.args.newBalance.toString(),
          pluginAddress: relatedPlugin.pluginAddress,
        }

        const daoMember = await Models.LogMember.create(rawDaoMember, { session })
        await session.commitTransaction()
        await session.endSession()

        logger.verbose(
          'New LogMembers: Delegation Changed',
          llo({
            logId: daoMember.id,
            logInfo,
          }),
        )
      })
    }
  },
}
