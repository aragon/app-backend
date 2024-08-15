import logger from '@logger'
import { IEventLogMember, type ILogInfo } from '@types'
import { type LogDescription } from 'ethers'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import Web3Helper from '@helpers/web3'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'

const llo = logger.logMeta.bind(null, { service: 'service:indexer:MemberHandler' })

export const MemberHandler = {
  membersAdded: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const pluginExisted = await Models.LogPluginSetupProcessor.findByPluginAddress(info.address, info.network)

    if (!pluginExisted) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    const members = parsedEvent.args.members
    for (let index = 0; index < members.length; index++) {
      const member = members[index]
      const existingLog = await Models.LogMember.findExistingLog({
        network: info.network,
        transactionHash: info.transactionHash,
        event: parsedEvent.name,
        address: member,
        pluginAddress: info.address,
        txIndex: index,
      })

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const rawMember = {
            address: member,
            blockNumber: info.blockNumber,
            transactionHash: info.transactionHash,
            event: parsedEvent.name as any,
            pluginAddress: info.address,
            network: info.network,
            txIndex: index,
          }

          const daoMember = await Models.LogMember.create(rawMember, { session } as any)
          await session.commitTransaction()
          await session.endSession()

          logger.verbose('New LogMembers Added', llo({ ...info, logId: daoMember.id }))
        })
      }
    }
  },

  membersRemoved: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const pluginExisted = await Models.LogPluginSetupProcessor.findByPluginAddress(info.address, info.network)

    if (!pluginExisted) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    const members = parsedEvent.args.members
    for (let index = 0; index < members.length; index++) {
      const member = members[index]
      const existingLog = await Models.LogMember.findExistingLog({
        network: info.network,
        transactionHash: info.transactionHash,
        event: parsedEvent.name,
        address: member,
        pluginAddress: info.address,
        txIndex: index,
      })

      if (!existingLog) {
        await DbTx.executeTxFn(async ({ session }) => {
          const rawMember = {
            address: member,
            blockNumber: info.blockNumber,
            transactionHash: info.transactionHash,
            event: parsedEvent.name,
            pluginAddress: info.address,
            network: info.network,
            txIndex: index,
          }

          const daoMember = await Models.LogMember.create(rawMember, { session } as any)
          await session.commitTransaction()
          await session.endSession()

          logger.verbose('New LogMembers Removed', llo({ ...info, logId: daoMember.id }))
        })
      }
    }
  },

  transfer: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, info.network)
    console.log(txReceipt)
    console.log(parsedEvent)
  },

  delegateChanged: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, info.network)

    if (txReceipt) {
      const relatedPlugin = await Models.LogPluginSetupProcessor.findPluginByTokenAddress(info.address, info.network)

      if (!relatedPlugin) {
        logger.warn('Plugin not found', llo(info))
        return
      }

      const delegationVotesChangedLogs = Web3Helper.findLogsByName(
        txReceipt,
        IEventLogMember.DelegateVotesChanged,
        GovernanceERC20.abi,
      )

      for (let index = 0; index < delegationVotesChangedLogs.length; index++) {
        const delegationVoteLog = delegationVotesChangedLogs[index]
        const memberAddress = Web3Helper.formatAddress(delegationVoteLog.txLog.topics[1])

        const existingLog = await Models.LogMember.findExistingLog({
          transactionHash: info.transactionHash,
          event: parsedEvent.name,
          address: memberAddress,
          network: info.network,
          pluginAddress: relatedPlugin.pluginAddress,
          txIndex: index,
        })

        if (!existingLog) {
          await DbTx.executeTxFn(async ({ session }) => {
            const rawDaoMember = {
              transactionHash: info.transactionHash,
              blockNumber: info.blockNumber,
              network: info.network,
              address: memberAddress,
              event: parsedEvent.name,
              tokenAddress: info.address,
              fromDelegate: parsedEvent.args.fromDelegate,
              toDelegate: parsedEvent.args.toDelegate,
              delegatingMember: parsedEvent.args.delegator,
              previousVotingPower: delegationVoteLog?.parsed!.args.previousBalance.toString(),
              newVotingPower: delegationVoteLog?.parsed!.args.newBalance.toString(),
              pluginAddress: relatedPlugin.pluginAddress,
              txIndex: index,
            }

            const daoMember = await Models.LogMember.create(rawDaoMember, { session } as any)
            await session.commitTransaction()
            await session.endSession()

            logger.verbose(
              'New LogMembers Delegation Changed',
              llo({
                ...info,
                logId: daoMember.id,
              }),
            )
          })
        }
      }
    }
  },
}
