import logger from '@logger'
import { type LogDescription } from 'ethers'
import DbTx from '@modules/dbTx'
import { Models } from '@dbModels'
import {
  EnumQueueName,
  IEventLogMember,
  type HexAddress,
  type ILogInfo,
  ITransferSide,
  ITransferType,
  type NetworksEnum,
} from '@types'
import { ProxyMember } from '@modules/proxyMember'
import Web3Helper from '@helpers/web3'
import utils from '@helpers/utils'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import Web3Utils from '@helpers/web3Utils'
import type MemberBalance from '@models/schema/memberBalance'
import Web3BatchHelper from '@helpers/web3BatchHelper'

const llo = logger.logMeta.bind(null, { service: 'handlers:TransferProcessor' })

export interface BatchEvents {
  log: LogDescription
  info: ILogInfo
}

export interface UserTransferData {
  address: HexAddress
  events: {
    parsedEvent: LogDescription
    info: ILogInfo
    transferSide?: ITransferSide
    dbId: string
    eventType: 'transfer' | 'delegation'
  }[]
  balance?: MemberBalance
}

export interface TransferProcessorOptions {
  batchSize?: number
  parallelUsers?: number
  updateDaoMetrics?: boolean
}

/**
 * Class responsible for efficiently processing token transfer events in batches
 */
export class BatchTransfersHandler {
  private readonly network: NetworksEnum
  public readonly tokenAddress: HexAddress
  private plugins: any[] = []
  private token: any = null
  private readonly options: TransferProcessorOptions
  private initialized = false
  private timestampCache: Record<string, number> = {}
  private readonly web3BatchHelper: Web3BatchHelper

  /**
   * Create a new TransferProcessor
   * @param network The blockchain network
   * @param tokenAddress The token contract address
   * @param options Processing options
   */
  constructor(network: NetworksEnum, tokenAddress: HexAddress, options: TransferProcessorOptions = {}) {
    this.network = network
    this.tokenAddress = tokenAddress
    this.options = {
      batchSize: 50,
      parallelUsers: 10,
      updateDaoMetrics: true,
      ...options,
    }
    this.web3BatchHelper = new Web3BatchHelper()
  }

  /**
   * Process a batch of transfer or delegation events
   * @param events Array of events
   * @returns Promise that resolves when processing is complete
   */
  async processEvents(events: BatchEvents[]): Promise<void> {
    const startTime = Date.now()

    try {
      if (!this.initialized) {
        const success = await this.initialize()
        if (!success) return
      }

      const userEventMap = this.groupEventsByUser(events)
      const userAddresses = Object.keys(userEventMap)

      logger.info(
        'Processing events',
        llo({
          network: this.network,
          tokenAddress: this.tokenAddress,
          userCount: userAddresses.length,
          eventCount: events.length,
        }),
      )

      await Promise.all(userAddresses.map(async address => ProxyMember.createMember(address)))

      const userBalanceParams = userAddresses.map(address => {
        const userEvents = userEventMap[address].events
        const latestEvent = userEvents[userEvents.length - 1]

        return {
          address,
          blockNumber: latestEvent.info.blockNumber,
          tokenId:
            latestEvent.parsedEvent?.args?.tokenId !== undefined ? latestEvent.parsedEvent.args.tokenId : undefined,
        }
      })

      const balanceMap = await this.batchProcessBalances(userBalanceParams)

      const userBatches = this.chunkArray(userAddresses, this.options.parallelUsers!)
      for (const batch of userBatches) {
        await Promise.all(
          batch.map(async address => {
            try {
              const userData = userEventMap[address]
              const memberBalance = balanceMap.get(address)

              await this.processUserTransactionsWithBalance(userData, memberBalance!)
            } catch (error) {
              logger.error(
                'Error processing user transactions',
                llo({
                  error,
                  address,
                  network: this.network,
                  tokenAddress: this.tokenAddress,
                }),
              )
            }
          }),
        )
      }

      if (this.options.updateDaoMetrics && this.plugins.length > 0) {
        await this.updateDaoMetrics()
      }

      const duration = Date.now() - startTime
      logger.info(
        'Batch processing completed',
        llo({
          network: this.network,
          tokenAddress: this.tokenAddress,
          userCount: userAddresses.length,
          eventCount: events.length,
          duration: `${duration}ms`,
          eventsPerSecond: Math.round((events.length / duration) * 1000),
        }),
      )
    } catch (error) {
      logger.error(
        'Error in batch processing',
        llo({
          error,
          network: this.network,
          tokenAddress: this.tokenAddress,
        }),
      )
    }
  }

  /**
   * Initialize token and plugin data
   * @returns Promise resolving to success status
   */
  private async initialize(): Promise<boolean> {
    try {
      const [plugins, token] = await Promise.all([
        Models.Plugin.findAllByTokenAddress(this.tokenAddress, this.network),
        Models.Token.findExistingLog({
          address: this.tokenAddress,
          network: this.network,
        }),
      ])

      if (!plugins || plugins.length === 0) {
        logger.info(
          'No plugins found for token',
          llo({
            tokenAddress: this.tokenAddress,
            network: this.network,
          }),
        )
        return false
      }

      if (!token) {
        logger.error(
          'Token not found',
          llo({
            tokenAddress: this.tokenAddress,
            network: this.network,
          }),
        )
        return false
      }

      this.plugins = plugins
      this.token = token
      this.initialized = true
      return true
    } catch (error) {
      logger.error(
        'Error initializing TransferProcessor',
        llo({
          error,
          network: this.network,
          tokenAddress: this.tokenAddress,
        }),
      )
      return false
    }
  }

  /**
   * Group events by user address
   * @param events Array of events
   * @returns Map of user addresses to their events
   */
  private groupEventsByUser(events: BatchEvents[]): Record<string, UserTransferData> {
    const userEventMap: Record<string, UserTransferData> = {}

    const sortedEvents = [...events].sort((a, b) => {
      if (a.info.blockNumber !== b.info.blockNumber) return a.info.blockNumber - b.info.blockNumber
      if (a.info.transactionIndex !== b.info.transactionIndex) return a.info.transactionIndex - b.info.transactionIndex
      return a.info.logIndex - b.info.logIndex
    })

    for (const { log: parsedEvent, info } of sortedEvents) {
      const eventType = parsedEvent.name === 'DelegateVotesChanged' ? 'delegation' : 'transfer'

      if (eventType === 'transfer') {
        if (parsedEvent.args.from !== utils.zeroAddress) {
          const address = parsedEvent.args.from
          if (!userEventMap[address]) {
            userEventMap[address] = {
              address,
              events: [],
            }
          }
          userEventMap[address].events.push({
            parsedEvent,
            info,
            transferSide: ITransferSide.outgoing,
            dbId: this.generateTransactionId(info, address),
            eventType,
          })
        }

        if (parsedEvent.args.to !== utils.zeroAddress) {
          const address = parsedEvent.args.to
          if (!userEventMap[address]) {
            userEventMap[address] = {
              address,
              events: [],
            }
          }
          userEventMap[address].events.push({
            parsedEvent,
            info,
            transferSide: ITransferSide.incoming,
            dbId: this.generateTransactionId(info, address),
            eventType,
          })
        }
      } else if (eventType === 'delegation') {
        const delegate = parsedEvent.args.delegate
        if (!userEventMap[delegate]) {
          userEventMap[delegate] = {
            address: delegate,
            events: [],
          }
        }

        userEventMap[delegate].events.push({
          parsedEvent,
          info,
          transferSide: ITransferSide.incoming,
          dbId: this.generateTransactionId(info, delegate),
          eventType,
        })
      }
    }

    for (const address in userEventMap) {
      userEventMap[address].events.sort((a, b) => {
        if (a.info.blockNumber !== b.info.blockNumber) return a.info.blockNumber - b.info.blockNumber
        if (a.info.transactionIndex !== b.info.transactionIndex)
          return a.info.transactionIndex - b.info.transactionIndex
        return a.info.logIndex - b.info.logIndex
      })
    }

    return userEventMap
  }

  /**
   * Generate a unique transaction ID
   * @param info Log info
   * @param address User address
   * @returns Unique transaction ID
   */
  private generateTransactionId(info: ILogInfo, address: HexAddress): string {
    return Models.MemberTransaction.getEntityId({
      network: this.network,
      transactionHash: info.transactionHash,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      address,
    })
  }

  /**
   * Check if a transaction is already processed
   * @param txIds Transaction ID
   * @returns Promise resolving to boolean indicating if transaction exists
   */
  private async getExistingTxIds(txIds: string[]): Promise<Set<string>> {
    const existingTxs = await Models.MemberTransaction.find({ id: { $in: txIds } })
      .select('id')
      .lean()

    return new Set(existingTxs.map(tx => tx.id))
  }

  /**
   * Get block timestamp from cache or blockchain
   * @param network
   * @param blockNumber
   * @private
   */
  private async getBlockTimestamp(network: NetworksEnum, blockNumber: number): Promise<number> {
    const cacheKey = `${network}-${blockNumber}`

    if (this.timestampCache[cacheKey]) {
      return this.timestampCache[cacheKey]
    }

    const timestamp = await Web3Helper.getBlockTimestamp(blockNumber, network)

    if (!timestamp) {
      return Math.round(Date.now() / 1000)
    }

    this.timestampCache[cacheKey] = timestamp

    return timestamp
  }

  public setTimestampCache(cache: any) {
    this.timestampCache = cache
  }

  /**
   * Get user balance data
   * @param address User address
   * @param blockNumber Block number for balance check
   * @param tokenId Token ID (for NFTs)
   * @returns Promise resolving to user balance data
   */
  private async getAndUpdateBalanceData(
    address: HexAddress,
    blockNumber: number,
    tokenId?: number,
  ): Promise<MemberBalance> {
    try {
      // Get the timestamp for this block
      const blockTimestamp = await this.getBlockTimestamp(this.network, blockNumber)

      // Use the batch helper to get voting power and balance
      const batchResult = await this.web3BatchHelper.getVotingPowerAndBalancesInBatch(
        [
          {
            memberAddress: address,
            tokenAddress: this.tokenAddress,
            blockNumber,
            blockTimestamp,
          },
        ],
        this.network,
      )

      const result = batchResult[address]
      const balance = result?.balance || '0'
      const votingPower = result?.votingPower || '0'

      // Get or create the balance record in the database
      const balanceDb = await ProxyMember.getBalances({
        address,
        tokenAddress: this.tokenAddress,
        network: this.network,
      })

      // Update the database with the new balance and voting power
      await DbTx.executeTxFn(async ({ session }) => {
        await balanceDb!.updateBalance(
          {
            amount: balance,
            blockNumber,
            tokenId,
          },
          { session },
        )

        if (votingPower !== '0') {
          await balanceDb!.updateVotingPower(votingPower, blockNumber, { session })
        }
        await session.commitTransaction()
      })

      return balanceDb!
    } catch (error) {
      logger.error(
        'Error getting balance data',
        llo({
          error,
          address,
          tokenAddress: this.tokenAddress,
          network: this.network,
          blockNumber,
        }),
      )

      // Fallback to existing balance or create new one
      const balanceDb = await ProxyMember.getBalances({
        address,
        tokenAddress: this.tokenAddress,
        network: this.network,
      })

      return balanceDb!
    }
  }

  /**
   * Batch process balance data for multiple users
   * @param users Array of user data with address and block number
   * @returns Map of addresses to balance data
   */
  private async batchProcessBalances(
    users: Array<{ address: HexAddress; blockNumber: number; tokenId?: number }>,
  ): Promise<Map<string, MemberBalance>> {
    try {
      const batchParams = await Promise.all(
        users.map(async ({ address, blockNumber }) => {
          const blockTimestamp = await this.getBlockTimestamp(this.network, blockNumber)
          return {
            memberAddress: address,
            tokenAddress: this.tokenAddress,
            blockNumber,
            blockTimestamp,
          }
        }),
      )

      const batchResults = await this.web3BatchHelper.getVotingPowerAndBalancesInBatch(batchParams, this.network)

      const balanceMap = new Map<string, MemberBalance>()
      await Promise.all(
        users.map(async ({ address, blockNumber, tokenId }) => {
          try {
            const result = batchResults[address]
            const balance = result?.balance || '0'
            const votingPower = result?.votingPower || '0'

            const balanceDb = await ProxyMember.getBalances({
              address,
              tokenAddress: this.tokenAddress,
              network: this.network,
            })

            await DbTx.executeTxFn(async ({ session }) => {
              await balanceDb!.updateBalance(
                {
                  amount: balance,
                  blockNumber,
                  tokenId,
                },
                { session },
              )

              if (votingPower !== '0') {
                await balanceDb!.updateVotingPower(votingPower, blockNumber, { session })
              }
              await session.commitTransaction()
            })

            balanceMap.set(address, balanceDb!)
          } catch (error) {
            logger.error(
              'Error updating user balance',
              llo({
                error,
                address,
                tokenAddress: this.tokenAddress,
                network: this.network,
              }),
            )
          }
        }),
      )

      return balanceMap
    } catch (error) {
      logger.error(
        'Error in batch balance processing',
        llo({
          error,
          network: this.network,
          tokenAddress: this.tokenAddress,
        }),
      )
      return new Map()
    }
  }

  /**
   * Process all transactions for a user
   * @param userData User transaction data
   */
  private async processUserTransactions(userData: UserTransferData): Promise<void> {
    try {
      const { address, events } = userData

      const txIds = events.map(event => event.dbId)
      const existingTxIds = await this.getExistingTxIds(txIds)

      const newEvents = events.filter(event => !existingTxIds.has(event.dbId))

      if (newEvents.length === 0) {
        return
      }

      const latestEvent = newEvents[newEvents.length - 1]

      // if the tokenId is there then it is an NFT, otherwise it is a fungible token
      const tokenId =
        newEvents[0]?.parsedEvent?.args?.tokenId !== undefined
          ? Number(newEvents[0].parsedEvent.args.tokenId || 0)
          : undefined

      const memberBalance = await this.getAndUpdateBalanceData(address, latestEvent.info.blockNumber, tokenId)

      for (const event of newEvents) {
        if (event.eventType === 'transfer') {
          await this.processSingleTransaction(address, memberBalance, event)
        } else if (event.eventType === 'delegation') {
          await this.processSingleDelegation(address, event)
        }
      }

      const hasBalance =
        BigInt(memberBalance.amount?.toString() || '0') > 0n ||
        BigInt(memberBalance.votingPower?.toString() || '0') > 0n

      if (hasBalance) {
        await this.handleDaoMembership(address, memberBalance)
      }
    } catch (error) {
      logger.error(
        'Error processing user transactions',
        llo({
          error,
          address: userData.address,
          tokenAddress: this.tokenAddress,
          network: this.network,
        }),
      )
    }
  }

  /**
   * Process user transactions with a pre-fetched balance
   */
  private async processUserTransactionsWithBalance(
    userData: UserTransferData,
    memberBalance: MemberBalance,
  ): Promise<void> {
    try {
      const { address, events } = userData

      const txIds = events.map(event => event.dbId)
      const existingTxIds = await this.getExistingTxIds(txIds)

      const newEvents = events.filter(event => !existingTxIds.has(event.dbId))

      if (newEvents.length === 0) {
        return
      }

      for (const event of newEvents) {
        if (event.eventType === 'transfer') {
          await this.processSingleTransaction(address, memberBalance, event)
        } else if (event.eventType === 'delegation') {
          await this.processSingleDelegation(address, event)
        }
      }

      const hasBalance =
        BigInt(memberBalance.amount?.toString() || '0') > 0n ||
        BigInt(memberBalance.votingPower?.toString() || '0') > 0n

      if (hasBalance) {
        await this.handleDaoMembership(address, memberBalance)
      }
    } catch (error) {
      logger.error(
        'Error processing user transactions with balance',
        llo({
          error,
          address: userData.address,
          tokenAddress: this.tokenAddress,
          network: this.network,
        }),
      )
    }
  }

  /**
   * Process a single transaction event
   * @param address
   * @param memberBalance
   * @param event
   * @private
   */
  private async processSingleTransaction(
    address: HexAddress,
    memberBalance: MemberBalance,
    event: UserTransferData['events'][0],
  ): Promise<void> {
    const { parsedEvent, info, transferSide, dbId } = event

    const blockTimestamp = await this.getBlockTimestamp(info.network, info.blockNumber)
    const tokenId = parsedEvent?.args.tokenId || null
    const txAmount = tokenId !== null ? 1 : parsedEvent?.args?.amount || '0'

    await DbTx.executeTxFn(async ({ session }) => {
      await Models.MemberTransaction.create(
        {
          id: dbId,
          network: this.network,
          transactionHash: info.transactionHash,
          transactionIndex: info.transactionIndex,
          logIndex: info.logIndex,
          blockNumber: info.blockNumber,
          blockTimestamp,
          address,
          type: ITransferType.tokenTransfer,
          side: transferSide,
          from: parsedEvent.args.from,
          to: parsedEvent.args.to,
          amount: txAmount,
          tokenAddress: this.tokenAddress,
          memberBalance: memberBalance.amount,
          tokenId,
        },
        { session },
      )

      await session.commitTransaction()
    })
  }

  /**
   * Process a single delegation event
   * @param userData User data
   * @param event Event data
   */
  private async processSingleDelegation(address: HexAddress, event: UserTransferData['events'][0]): Promise<void> {
    const { parsedEvent, info, dbId } = event

    try {
      const blockTimestamp = await this.getBlockTimestamp(info.network, info.blockNumber)

      const { from, to, delegator } = await this._findDelegatorsFromReceipt(parsedEvent, info)

      if ((from === utils.zeroAddress && to === utils.zeroAddress) || from === to) {
        logger.warn('Skip from and to address', llo({ from, to, info }))
        return
      }

      // Determine transfer side
      let side: ITransferSide
      if (address === from) {
        side = ITransferSide.outgoing
      } else if (address === to) {
        side = ITransferSide.incoming
      } else {
        logger.error('Error cannot detect delegation side', llo({ from, to, address, info }))
        return
      }

      const newVotingPower = BigInt(parsedEvent?.args?.newBalance || 0).toString()

      await DbTx.executeTxFn(async ({ session }) => {
        await Models.MemberTransaction.create(
          {
            id: dbId,
            network: this.network,
            transactionHash: info.transactionHash,
            transactionIndex: info.transactionIndex,
            logIndex: info.logIndex,
            blockNumber: info.blockNumber,
            blockTimestamp,
            address,
            delegator,
            type: ITransferType.delegate,
            side,
            from,
            to,
            amount: BigInt(parsedEvent?.args?.newBalance || 0).toString(),
            tokenAddress: this.tokenAddress,
            memberVotingPower: newVotingPower,
          },
          { session },
        )

        await session.commitTransaction()
      })

      await Promise.all(
        this.plugins.map(async (plugin: any) => {
          await ProxyMember.updateDelegationMetrics({
            memberAddress: address,
            pluginAddress: plugin.address,
            tokenAddress: this.tokenAddress,
            network: this.network,
          })

          await ProxyMember.updateActivity({
            memberAddress: address,
            pluginAddress: plugin.address,
            blockNumber: info.blockNumber,
            network: this.network,
          })
        }),
      )
    } catch (error) {
      logger.error(
        'Error processing delegation',
        llo({
          error,
          address,
          tokenAddress: this.tokenAddress,
          network: this.network,
          txHash: info.transactionHash,
          logIndex: info.logIndex,
        }),
      )
    }
  }

  /**
   * Find delegators from transaction receipt
   * @param parsedEvent The parsed event
   * @param info Event info
   * @returns Object with from, to, and delegator addresses
   */
  private async _findDelegatorsFromReceipt(parsedEvent: LogDescription, info: ILogInfo) {
    let from = utils.zeroAddress
    let to = utils.zeroAddress
    let delegator = utils.zeroAddress

    const txReceipt = await Web3Helper.getTransactionReceipt(info.transactionHash, this.network)

    if (txReceipt) {
      const delegationChangedLogs = Web3Utils.findLogsByName(
        txReceipt,
        IEventLogMember.DelegateChanged,
        GovernanceERC20.abi,
      )

      const log = delegationChangedLogs?.find(
        ({ parsed }: { parsed: LogDescription | null }) =>
          parsed?.args?.fromDelegate === parsedEvent?.args?.delegate ||
          parsed?.args?.toDelegate === parsedEvent?.args?.delegate,
      )

      if (log?.parsed?.args?.delegator) {
        delegator = log?.parsed?.args.delegator
      }

      if (log?.parsed?.args?.fromDelegate) {
        from = log.parsed.args.fromDelegate
      }

      if (log?.parsed?.args?.toDelegate) {
        to = log.parsed.args.toDelegate
      }
    }

    return { from, to, delegator }
  }

  /**
   * Update DAO metrics for all plugins
   */
  private async updateDaoMetrics(): Promise<void> {
    try {
      const uniqueDaoList = utils.getUniqueValuesByKey(this.plugins, 'daoAddress')
      await Promise.all(
        uniqueDaoList.map(async (daoAddress: string) => {
          await RabbitMQHelper.sendMessage(EnumQueueName.daoMetrics, {
            id: daoAddress,
            params: { address: daoAddress, network: this.network },
          })
        }),
      )
    } catch (error) {
      logger.error(
        'Error updating DAO metrics',
        llo({
          error,
          network: this.network,
          tokenAddress: this.tokenAddress,
        }),
      )
    }
  }

  /**
   * Split array into chunks
   * @param array Array to split
   * @param chunkSize Size of each chunk
   * @returns Array of chunks
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = []
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize))
    }
    return chunks
  }

  private async handleDaoMembership(address: HexAddress, memberBalance: MemberBalance): Promise<void> {
    try {
      await Promise.all(
        this.plugins.map(async (plugin: any) => {
          const memberShipParams = {
            memberAddress: address,
            daoAddress: plugin.daoAddress,
            network: plugin.network,
            pluginAddress: plugin.address,
            tokenAddress: plugin.tokenAddress,
          }

          const hasBalance =
            BigInt(memberBalance.amount?.toString() || '0') > 0n ||
            BigInt(memberBalance.votingPower?.toString() || '0') > 0n

          const isMember = await ProxyMember.isMemberOfDao(memberShipParams)

          if (!isMember && hasBalance) {
            logger.info(
              'Added member to DAO',
              llo({
                address,
                daoAddress: plugin.daoAddress,
                tokenAddress: this.tokenAddress,
              }),
            )
            await ProxyMember.addToDao(memberShipParams)
          } else if (isMember && !hasBalance) {
            logger.info(
              'Removed member from DAO',
              llo({
                address,
                daoAddress: plugin.daoAddress,
                tokenAddress: this.tokenAddress,
              }),
            )
            await ProxyMember.removeFromDao(memberShipParams)
          }
        }),
      )
    } catch (error) {
      logger.error(
        'Error handling DAO membership',
        llo({
          error,
          address,
          tokenAddress: this.tokenAddress,
        }),
      )
    }
  }
}
