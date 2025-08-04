import logger from '@logger'
import { type LogDescription, type Log, Interface } from 'ethers'
import {
  EnumQueueName,
  type HexAddress,
  type ILogInfo,
  ITransferSide,
  ITransferType,
  type NetworksEnum,
  IGovernanceErc20Logs,
} from '@types'
import utils from '@helpers/utils'
import { ProxyMember } from '@modules/proxyMember'
import type Plugin from '@models/schema/plugin'
import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import { ProxyToken } from '@modules/proxyToken'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Utils from '@helpers/web3Utils'
import config from '@config'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'

const llo = logger.logMeta.bind(null, { service: 'handlers:GovernanceErc20Handler' })

interface ParsedDelegateEvent {
  name: string
  args: {
    delegate?: HexAddress
    newBalance?: bigint
    previousBalance?: bigint
    [key: string]: any
  }
}

interface ProcessedDelegateTransaction {
  log: Log
  parsedEvent: ParsedDelegateEvent
  blockNumber: number
  transactionHash: string
  transactionIndex: number
  logIndex: number
  memberAddress: HexAddress
  newBalance: bigint
  previousBalance: bigint
  side: ITransferSide
}

export const GovernanceErc20Handler = {
  // Batch processing function for delegateVotesChanged events
  processBatchDelegateVotesChanged: async (
    tokenAddress: HexAddress,
    network: NetworksEnum,
    logs: Log[],
  ): Promise<void> => {
    if (logs.length === 0) return

    const plugins = await Models.Plugin.findAllByTokenAddress(tokenAddress, network)
    if (!plugins || plugins.length === 0) return

    logger.info(
      'Processing batch delegate votes changed',
      llo({
        tokenAddress,
        network,
        totalLogs: logs.length,
        pluginCount: plugins.length,
      }),
    )

    try {
      const govTokenInterface = new Interface(GovernanceERC20.abi)
      const processedEvents = await GovernanceErc20Handler.parseAndValidateLogs(logs, govTokenInterface, network)

      if (processedEvents.length === 0) {
        logger.info('No valid events to process', llo({ tokenAddress, network }))
        return
      }

      const userGroups = GovernanceErc20Handler.groupEventsByUser(processedEvents)
      const userAddresses = Object.keys(userGroups)

      await GovernanceErc20Handler.executeBulkDatabaseOperations(
        userGroups,
        userAddresses,
        tokenAddress,
        network,
        plugins,
      )
    } catch (error) {
      logger.error('Error in batch delegate votes changed processing', llo({ error, tokenAddress, network }))
    }
  },

  parseAndValidateLogs: async (
    logs: Log[],
    govTokenInterface: Interface,
    network: NetworksEnum,
  ): Promise<ProcessedDelegateTransaction[]> => {
    const processedEvents: ProcessedDelegateTransaction[] = []
    const existingLogChecks: Promise<any>[] = []

    // Parse all logs and prepare existence checks
    for (const log of logs) {
      try {
        const parsed = govTokenInterface.parseLog({
          topics: log.topics,
          data: log.data,
        }) as ParsedDelegateEvent

        if (!parsed || parsed.name !== 'DelegateVotesChanged') continue

        const memberAddress = parsed.args.delegate
        if (!memberAddress || memberAddress === utils.zeroAddress) continue

        const logInfo = Web3Utils.parseInfoLog(log, IGovernanceErc20Logs.DelegateVotesChanged, network)

        // Check if the log already exists
        existingLogChecks.push(
          Models.MemberTransaction.findExistingLog({
            network,
            transactionHash: logInfo.transactionHash,
            transactionIndex: logInfo.transactionIndex,
            logIndex: logInfo.logIndex,
            address: memberAddress,
          }),
        )

        const newBalance = BigInt(parsed.args.newBalance || 0)
        const previousBalance = BigInt(parsed.args.previousBalance || 0)
        const side = newBalance > previousBalance ? ITransferSide.incoming : ITransferSide.outgoing

        processedEvents.push({
          log,
          parsedEvent: parsed,
          blockNumber: logInfo.blockNumber,
          transactionHash: logInfo.transactionHash,
          transactionIndex: logInfo.transactionIndex,
          logIndex: logInfo.logIndex,
          memberAddress,
          newBalance,
          previousBalance,
          side,
        })
      } catch (error) {
        logger.warn('Failed to parse log', llo({ error, log }))
      }
    }

    // Wait for all existence checks
    const existingLogs = await Promise.all(existingLogChecks)

    // Filter out existing logs
    const validEvents = processedEvents.filter((_, index) => !existingLogs[index])

    logger.info(
      'Filtered existing logs',
      llo({
        totalParsed: processedEvents.length,
        existing: processedEvents.length - validEvents.length,
        valid: validEvents.length,
      }),
    )

    return validEvents
  },

  groupEventsByUser: (
    events: ProcessedDelegateTransaction[],
  ): Record<
    HexAddress,
    {
      transactions: ProcessedDelegateTransaction[]
      finalBalance: string
      finalTransactionHash: string
      lastActivity?: number
    }
  > => {
    // Sort events by block, transaction, and log index
    const sortedEvents = events.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber
      if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex
      return a.logIndex - b.logIndex
    })

    const userGroups: Record<
      HexAddress,
      {
        transactions: ProcessedDelegateTransaction[]
        finalBalance: string
        finalTransactionHash: string
        lastActivity?: number
      }
    > = {}

    for (const event of sortedEvents) {
      const { memberAddress } = event

      if (!userGroups[memberAddress]) {
        userGroups[memberAddress] = {
          transactions: [],
          finalBalance: '0',
          finalTransactionHash: '',
        }
      }

      userGroups[memberAddress].transactions.push(event)
      userGroups[memberAddress].finalBalance = event.newBalance.toString()
      userGroups[memberAddress].finalTransactionHash = event.transactionHash

      // Set lastActivity for outgoing transactions
      if (event.side === ITransferSide.outgoing) {
        userGroups[memberAddress].lastActivity = event.blockNumber
      }
    }

    return userGroups
  },

  calculateTimestamp: (
    blockNumber: number,
    firstBlockNumber: number,
    firstBlockTimestamp: number,
    network: NetworksEnum,
  ): number => {
    const blockDiff = blockNumber - firstBlockNumber
    const intervalTime = config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME
    return firstBlockTimestamp + blockDiff * intervalTime
  },

  executeBulkDatabaseOperations: async (
    userGroups: Record<
      HexAddress,
      {
        transactions: ProcessedDelegateTransaction[]
        finalBalance: string
        finalTransactionHash: string
        lastActivity?: number
      }
    >,
    userAddresses: HexAddress[],
    tokenAddress: HexAddress,
    network: NetworksEnum,
    plugins: Plugin[],
  ): Promise<void> => {
    const token = await ProxyToken.saveAndGetToken(tokenAddress, network)
    if (!token) {
      logger.error('Token not found', llo({ tokenAddress, network }))
      return
    }

    await Promise.all([
      GovernanceErc20Handler.bulkCreateMembers(userGroups, userAddresses),
      GovernanceErc20Handler.bulkInsertTransactions(userGroups, tokenAddress, network),
      GovernanceErc20Handler.bulkUpsertVotingPower(userGroups, tokenAddress, network),
      GovernanceErc20Handler.bulkUpdateDelegationMetrics(userGroups, tokenAddress, network),
      GovernanceErc20Handler.bulkUpdatePluginMetrics(userGroups, plugins, network),
    ])

    // Send DAO metrics messages
    const uniqueDaoList = utils.getUniqueValuesByKey(plugins, 'daoAddress')
    await Promise.all(
      uniqueDaoList.map(async (daoAddress: string) => {
        await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
          id: daoAddress,
          params: { address: daoAddress, network },
        })
      }),
    )

    logger.info('Completed bulk database operations', llo({ userCount: userAddresses.length, tokenAddress, network }))
  },

  bulkCreateMembers: async (userGroups: Record<HexAddress, any>, userAddresses: HexAddress[]): Promise<void> => {
    const memberOps: any = []

    for (const memberAddress of userAddresses) {
      const group = userGroups[memberAddress]
      const lastActivity = group.lastActivity

      memberOps.push({
        updateOne: {
          filter: { address: memberAddress },
          update: {
            $setOnInsert: {
              address: memberAddress,
              ens: null,
              avatar: null,
              firstActivity: lastActivity,
              lastActivity,
              createdAt: new Date(),
              updatedAt: new Date(),
              __v: 0,
            },
            $set: lastActivity ? { lastActivity } : {},
          },
          upsert: true,
        },
      })
    }

    try {
      await Models.Member.bulkWrite(memberOps, { ordered: false })
      logger.info('Bulk created/updated members', llo({ count: memberOps.length }))
    } catch (error) {
      logger.warn('Some member operations had issues', llo({ error }))
    }
  },

  bulkInsertTransactions: async (
    userGroups: Record<HexAddress, any>,
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<void> => {
    const transactions: any = []

    for (const [memberAddress, group] of Object.entries(userGroups)) {
      for (const tx of group.transactions) {
        transactions.push({
          id: Models.MemberTransaction.getEntityId({
            network,
            transactionHash: tx.transactionHash,
            transactionIndex: tx.transactionIndex,
            logIndex: tx.logIndex,
            address: memberAddress,
          }),
          network,
          transactionHash: tx.transactionHash,
          transactionIndex: tx.transactionIndex,
          logIndex: tx.logIndex,
          blockNumber: tx.blockNumber,
          address: memberAddress,
          type: ITransferType.delegate,
          side: tx.side,
          tokenAddress,
          memberVotingPower: tx.newBalance.toString(),
          from: tx.side === ITransferSide.outgoing ? memberAddress : null,
          to: tx.side === ITransferSide.incoming ? memberAddress : null,
          createdAt: new Date(),
          updatedAt: new Date(),
          __v: 0,
        })
      }
    }

    try {
      const result = await Models.MemberTransaction.insertMany(transactions, { ordered: false, lean: true })
      logger.info('Bulk inserted transactions', llo({ count: transactions.length, saved: result.length }))
    } catch (error: any) {
      logger.warn('Some transactions already existed', llo({ duplicates: error.writeErrors?.length || 0 }))
    }
  },

  bulkUpsertVotingPower: async (
    userGroups: Record<HexAddress, any>,
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<void> => {
    const vpOps: any = []

    for (const [memberAddress, group] of Object.entries(userGroups)) {
      const lastTx = group.transactions[group.transactions.length - 1]

      vpOps.push({
        updateOne: {
          filter: {
            memberAddress,
            tokenAddress,
            network,
          },
          update: {
            $set: {
              votingPower: group.finalBalance,
              lastVPBlockNumber: lastTx.blockNumber,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              memberAddress,
              tokenAddress,
              network,
              tokenIds: [],
              createdAt: new Date(),
              updatedAt: new Date(),
              __v: 0,
            },
          },
          upsert: true,
        },
      })
    }

    await Models.VpMember.bulkWrite(vpOps, { ordered: false })
    logger.info('Bulk upserted voting power', llo({ count: vpOps.length }))
  },

  bulkUpdateDelegationMetrics: async (
    userGroups: Record<HexAddress, any>,
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<void> => {
    const delegationOps: any = []

    for (const [memberAddress, group] of Object.entries(userGroups)) {
      // Only update for incoming delegations
      const hasIncomingDelegation = group.transactions.some(
        (tx: ProcessedDelegateTransaction) => tx.side === ITransferSide.incoming,
      )

      if (hasIncomingDelegation) {
        const delegateReceivedCount = await Models.MemberTransaction.getReceiveDelegationCount(
          memberAddress,
          tokenAddress,
          network,
        )

        delegationOps.push({
          updateOne: {
            filter: {
              memberAddress,
              tokenAddress,
              network,
            },
            update: {
              $set: {
                delegateReceivedCount,
                updatedAt: new Date(),
                createdAt: new Date(),
                __v: 0,
              },
            },
          },
        })
      }
    }

    if (delegationOps.length > 0) {
      await Models.VpMember.bulkWrite(delegationOps, { ordered: false })
      logger.info('Bulk updated delegation metrics', llo({ count: delegationOps.length }))
    }
  },

  bulkUpdatePluginMetrics: async (
    userGroups: Record<HexAddress, any>,
    plugins: Plugin[],
    network: NetworksEnum,
  ): Promise<void> => {
    const pluginMetricsOps: any = []

    for (const [memberAddress, group] of Object.entries(userGroups)) {
      // Only update for outgoing transactions (lastActivity)
      if (group.lastActivity) {
        for (const plugin of plugins) {
          pluginMetricsOps.push({
            updateOne: {
              filter: {
                memberAddress,
                pluginAddress: plugin.address,
                network,
              },
              update: {
                $set: {
                  lastActivity: group.lastActivity,
                  updatedAt: new Date(),
                },
                $setOnInsert: {
                  memberAddress,
                  pluginAddress: plugin.address,
                  daoAddress: plugin.daoAddress,
                  network,
                  voteCount: 0,
                  proposalCount: 0,
                  firstActivity: group.lastActivity,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                  __v: 0,
                },
              },
              upsert: true,
            },
          })
        }
      }
    }

    if (pluginMetricsOps.length > 0) {
      await Models.PluginMetrics.bulkWrite(pluginMetricsOps, { ordered: false })
      logger.info('Bulk updated plugin metrics', llo({ count: pluginMetricsOps.length }))
    }
  },

  // it triggers for each user the previous and new votingPower
  delegateVotesChanged: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const plugins = await Models.Plugin.findAllByTokenAddress(info.address, info.network)
    if (!plugins || plugins.length === 0) return

    try {
      const memberAddress = parsedEvent.args.delegate
      const tokenAddress = info.address
      const network = info.network

      if (memberAddress === utils.zeroAddress) return

      const existingLog = await Models.MemberTransaction.findExistingLog({
        network,
        transactionHash: info.transactionHash,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
        address: memberAddress,
      })
      if (existingLog) return

      const token = await ProxyToken.saveAndGetToken(info.address, info.network)
      if (!token) {
        logger.error('handleTransfer token not found', llo({ info }))
        return
      }

      const newBalance = BigInt(parsedEvent?.args?.newBalance || 0)
      const previousBalance = BigInt(parsedEvent?.args?.previousBalance || 0)

      let side: ITransferSide
      let from: HexAddress | null = null
      let to: HexAddress | null = null
      let lastActivity: undefined | number
      if (newBalance > previousBalance) {
        side = ITransferSide.incoming
        to = memberAddress
      } else {
        side = ITransferSide.outgoing
        from = memberAddress
        lastActivity = info.blockNumber
      }

      await ProxyMember.createMember(memberAddress, lastActivity)

      await DbTx.executeTxFn(async ({ session }) => {
        const logDb = await Models.MemberTransaction.create(
          {
            network,
            transactionHash: info.transactionHash,
            transactionIndex: info.transactionIndex,
            logIndex: info.logIndex,
            blockNumber: info.blockNumber,
            address: memberAddress,
            type: ITransferType.delegate,
            side,
            amount: BigInt(parsedEvent?.args?.value || 0).toString(),
            tokenAddress,
            memberVotingPower: newBalance.toString(),
            from,
            to,
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('Transfer outgoing - MemberTransaction', llo({ logId: logDb?.id, info }))
        return logDb
      })

      await ProxyMember.updateVotingPower({
        memberAddress,
        tokenAddress: info.address,
        votingPower: newBalance.toString(),
        network: info.network,
        lastVPBlockNumber: info.blockNumber,
      })

      // only when incoming delegation, we update the delegation metrics
      if (side === ITransferSide.incoming) {
        await ProxyMember.updateDelegationMetrics({
          memberAddress,
          tokenAddress,
          network,
        })
      } else {
        // update lastActivity metrics for all plugins
        const plugins = await Models.Plugin.findAllByTokenAddress(tokenAddress, network)
        await Promise.all(
          plugins.map(async (plugin: Plugin) => {
            await ProxyMember.updatePluginMetrics({
              memberAddress,
              pluginAddress: plugin.address,
              network,
              lastActivity: info.blockNumber,
            })
          }),
        )
      }

      const uniqueDaoList = utils.getUniqueValuesByKey(plugins, 'daoAddress')
      await Promise.all(
        uniqueDaoList.map(async (daoAddress: string) => {
          await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
            id: daoAddress,
            params: { address: daoAddress, network: info.network },
          })
        }),
      )
    } catch (error) {
      logger.error('DelegateVotesChanged - error', llo({ error, parsedEvent, info }))
    }
  },
}
