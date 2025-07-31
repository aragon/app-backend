import { type NetworksEnum, type HexAddress, ITransferType, IGovernanceErc20Logs } from '@types'
import { type Log, Interface } from 'ethers'
import logger from '@logger'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import utils from '@helpers/utils'
import config from '@config'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import Web3Utils from '@helpers/web3Utils'

const llo = logger.logMeta.bind(null, { service: 'handlers:GovernanceBatchHandler' })

interface ParsedEvent {
  name: string
  args: {
    delegate?: HexAddress
    newBalance?: bigint
    [key: string]: any
  }
}

interface ProcessedTransaction {
  log: Log
  parsedEvent: ParsedEvent
  blockNumber: number
  transactionHash: string
  transactionIndex: number
  logIndex: number
}

class GovernanceBatchHandler {
  public readonly network: NetworksEnum
  public readonly tokenAddress: HexAddress
  public readonly govTokenInterface: Interface

  constructor(network: NetworksEnum, tokenAddress: HexAddress) {
    this.network = network
    this.tokenAddress = tokenAddress
    this.govTokenInterface = new Interface(GovernanceERC20.abi)
  }

  async processBatchDelegations(events: Log[]): Promise<void> {
    if (events.length === 0) return

    const userGroups = this.groupEventsByUser(events)
    const userAddresses = Object.keys(userGroups)

    logger.info(
      'Processed delegation events by user',
      llo({
        originalEvents: events.length,
        uniqueUsers: userAddresses.length,
        avgEventsPerUser: Math.round(events.length / userAddresses.length),
      }),
    )

    await this.executeBulkDatabaseOperations(userGroups, userAddresses)
  }

  parseRawLog(log: Log): ParsedEvent | null {
    try {
      const parsed = this.govTokenInterface.parseLog({
        topics: log.topics,
        data: log.data,
      })
      return parsed as ParsedEvent
    } catch (error) {
      return null
    }
  }

  groupEventsByUser(events: Log[]): Record<
    HexAddress,
    {
      transactions: ProcessedTransaction[]
      finalBalance: string
      finalTransactionHash: string
    }
  > {
    const processedEvents: ProcessedTransaction[] = []

    for (const log of events) {
      const parsedEvent = this.parseRawLog(log)
      if (!parsedEvent || parsedEvent.name !== 'DelegateVotesChanged') continue

      const logInfo = Web3Utils.parseInfoLog(log, IGovernanceErc20Logs.DelegateVotesChanged, this.network)

      processedEvents.push({
        log,
        parsedEvent,
        blockNumber: logInfo.blockNumber,
        transactionHash: logInfo.transactionHash,
        transactionIndex: logInfo.transactionIndex,
        logIndex: logInfo.logIndex,
      })
    }

    const sortedEvents = processedEvents.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber
      if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex
      return a.logIndex - b.logIndex
    })

    const userGroups: Record<
      HexAddress,
      {
        transactions: ProcessedTransaction[]
        finalBalance: string
        finalTransactionHash: string
      }
    > = {}

    for (const event of sortedEvents) {
      const delegate = event.parsedEvent.args.delegate
      if (!delegate || delegate === utils.zeroAddress) continue

      if (!userGroups[delegate]) {
        userGroups[delegate] = {
          transactions: [],
          finalBalance: '0',
          finalTransactionHash: '',
        }
      }

      userGroups[delegate].transactions.push(event)

      userGroups[delegate].finalBalance = event.parsedEvent.args.newBalance?.toString() || '0'
      userGroups[delegate].finalTransactionHash = event.transactionHash
    }

    return userGroups
  }

  calculateTimestamp(blockNumber: number, firstBlockNumber: number, firstBlockTimestamp: number): number {
    const blockDiff = blockNumber - firstBlockNumber
    const intervalTime = config.NODES[utils.networkToAragon(this.network)].INTERVAL_BLOCK_TIME
    return firstBlockTimestamp + blockDiff * intervalTime
  }

  async executeBulkDatabaseOperations(
    userGroups: Record<
      HexAddress,
      {
        transactions: ProcessedTransaction[]
        finalBalance: string
        finalTransactionHash: string
      }
    >,
    userAddresses: HexAddress[],
  ): Promise<void> {
    const firstBlockNumber = Math.min(
      ...Object.values(userGroups).flatMap(group => group.transactions.map(tx => tx.blockNumber)),
    )
    const firstBlockTimestamp = await Web3Helper.getBlockTimestamp(firstBlockNumber, this.network)
    await Promise.all([
      this.bulkCreateMembers(userAddresses),
      this.bulkInsertTransactions(userGroups, firstBlockNumber, firstBlockTimestamp),
      this.bulkUpsertBalances(userGroups),
      this.bulkCreateMetrics(userAddresses),
    ])
  }

  async bulkCreateMembers(userAddresses: HexAddress[]): Promise<void> {
    try {
      await Models.Member.bulkWrite(
        userAddresses.map((member: HexAddress) => ({
          updateOne: {
            filter: { address: member },
            update: {
              $setOnInsert: {
                address: member,
                ens: null,
                avatar: null,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      )
      logger.info('Bulk created members', llo({ count: userAddresses.length }))
    } catch (error) {
      logger.warn('Some members already existed', llo({ error }))
    }
  }

  async bulkInsertTransactions(userGroups: any, firstBlockNumber: number, firstBlockTimestamp: number): Promise<void> {
    const transactions: any = []

    for (const [userAddress, group] of Object.entries(userGroups)) {
      for (const tx of (group as any).transactions) {
        transactions.push({
          id: this.generateTransactionId(
            {
              network: this.network,
              transactionHash: tx.transactionHash,
              transactionIndex: tx.transactionIndex,
              logIndex: tx.logIndex,
            },
            userAddress,
          ),
          network: this.network,
          transactionHash: tx.transactionHash,
          transactionIndex: tx.transactionIndex,
          logIndex: tx.logIndex,
          blockNumber: tx.blockNumber,
          blockTimestamp: this.calculateTimestamp(tx.blockNumber, firstBlockNumber, firstBlockTimestamp),
          address: userAddress,
          type: ITransferType.delegate,
          amount: tx.parsedEvent.args.newBalance?.toString() || '0',
          tokenAddress: this.tokenAddress,
          memberVotingPower: tx.parsedEvent.args.newBalance?.toString() || '0',
          createdAt: new Date(),
          updatedAt: new Date(),
          __v: 0,
        })
      }
    }

    try {
      const status = await Models.MemberTransaction.insertMany(transactions, { ordered: false, lean: true })
      logger.info('Bulk inserted transactions', llo({ count: transactions.length, saved: status.length }))
    } catch (error: any) {
      logger.warn('Some transactions already existed', llo({ duplicates: error.writeErrors?.length || 0 }))
    }
  }

  async bulkUpsertBalances(userGroups: any): Promise<void> {
    const bulkOps: any = []

    for (const [userAddress, group] of Object.entries(userGroups)) {
      const lastTx = (group as any).transactions[(group as any).transactions.length - 1]

      bulkOps.push({
        updateOne: {
          filter: {
            address: userAddress,
            tokenAddress: this.tokenAddress,
            network: this.network,
          },
          update: {
            $set: {
              votingPower: (group as any).finalBalance,
              lastSyncVotingPowerBlockNumber: lastTx.blockNumber,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              address: userAddress,
              tokenAddress: this.tokenAddress,
              network: this.network,
              createdAt: new Date(),
              __v: 0,
            },
          },
          upsert: true,
        },
      })
    }

    await Models.MemberBalance.bulkWrite(bulkOps, { ordered: false })
    logger.info('Bulk upserted balances', llo({ count: bulkOps.length }))
  }

  async bulkCreateMetrics(userAddresses: HexAddress[]): Promise<void> {
    const plugins = await Models.Plugin.findAllByTokenAddress(this.tokenAddress, this.network)
    if (plugins.length === 0) return

    const bulkOps: any = []

    for (const userAddress of userAddresses) {
      for (const plugin of plugins) {
        const delegateReceivedCount = await Models.MemberTransaction.getReceiveDelegationCount(
          userAddress,
          this.tokenAddress,
          this.network,
        )

        bulkOps.push({
          updateOne: {
            filter: {
              address: userAddress,
              pluginAddress: plugin.address,
              network: this.network,
            },
            update: {
              $set: {
                delegateReceivedCount,
                updatedAt: new Date(),
              },
              $setOnInsert: {
                address: userAddress,
                pluginAddress: plugin.address,
                network: this.network,
                createdAt: new Date(),
                __v: 0,
              },
            },
            upsert: true,
          },
        })
      }
    }

    await Models.MemberMetrics.bulkWrite(bulkOps, { ordered: false })
    logger.info('Bulk created metrics', llo({ count: bulkOps.length }))
  }

  generateTransactionId(
    info: { network: NetworksEnum; transactionHash: string; transactionIndex: number; logIndex: number },
    address: HexAddress,
  ): string {
    return Models.MemberTransaction.getEntityId({
      network: info.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      address,
    })
  }
}

export default GovernanceBatchHandler
