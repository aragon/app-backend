import logger from '@logger'
import { type HexAddress, IEventLogMember, type ILogInfo } from '@types'
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

    await Promise.all(
      parsedEvent.args.members.map(async (member: HexAddress) => {
        const existingLog = await Models.LogMember.findExistingLog({
          network: info.network,
          transactionHash: info.transactionHash,
          event: parsedEvent.name,
          address: member,
          pluginAddress: info.address,
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
            }

            const daoMember = await Models.LogMember.create(rawMember, { session } as any)
            await session.commitTransaction()
            await session.endSession()

            logger.verbose('New LogMembers Added', llo({ ...info, logId: daoMember.id }))
          })
        }
      }),
    )
  },

  membersRemoved: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const pluginExisted = await Models.LogPluginSetupProcessor.findByPluginAddress(info.address, info.network)

    if (!pluginExisted) {
      logger.warn('Plugin not found', llo(info))
      return
    }

    await Promise.all(
      parsedEvent.args.members.map(async (member: HexAddress) => {
        const existingLog = await Models.LogMember.findExistingLog({
          network: info.network,
          transactionHash: info.transactionHash,
          event: parsedEvent.name,
          address: member,
          pluginAddress: info.address,
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
            }

            const daoMember = await Models.LogMember.create(rawMember, { session } as any)
            await session.commitTransaction()
            await session.endSession()

            logger.verbose('New LogMembers Removed', llo({ ...info, logId: daoMember.id }))
          })
        }
      }),
    )
  },

  delegateChanged: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, info.network)

    if (txReceipt) {
      const relatedPlugin = await Models.LogPluginSetupProcessor.findByPluginAddress(info.address, info.network)

      if (!relatedPlugin) {
        logger.warn('Plugin not found', llo(info))
        return
      }

      const delegationVotesChangedLogs = Web3Helper.findLogsByName(
        txReceipt,
        IEventLogMember.DelegateVotesChanged,
        GovernanceERC20.abi,
      )

      await Promise.all(
        delegationVotesChangedLogs.map(async (delegationVoteLog: any) => {
          const memberAddress = Web3Helper.formatAddress(delegationVoteLog.txLog.topics[1])

          const existingLog = await Models.LogMember.findExistingLog({
            transactionHash: info.transactionHash,
            event: parsedEvent.name,
            address: memberAddress,
            network: info.network,
            pluginAddress: relatedPlugin.pluginAddress,
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
        }),
      )
    }
  },
}
