import async from 'async'
import { ethers, Interface, type Log } from 'ethers'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import logger from '@logger'
import BlockchainLogCrawler from '@src/modules/blockchainLogCrawler'
import { IGovernanceErc20Logs, type NetworksEnum } from '@types'
import PoolingCrawler from '@modules/poolingCrawler'
import { ERC721 } from '@artifacts/ERC721'
import Web3Utils from '@src/helpers/web3Utils'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'
import configIndexer from '@indexer/configIndexer'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'module:TransferCrawler' })

const govTokenInterface = new Interface(GovernanceERC20.abi)
const transferTopic = govTokenInterface.getEvent('Transfer')?.topicHash!
const delegateVotesChangedTopic = govTokenInterface.getEvent('DelegateVotesChanged')?.topicHash!

interface ShardedEvents {
  shardKey: string
  logs: Log[]
  involvedAddresses: Set<string>
}

interface AddressGroup {
  address: string
  logs: Log[]
}

const TransferCrawler = {
  instances: new Map<NetworksEnum, BlockchainLogCrawler>(),
  timestampsCache: {},
  config: {
    concurrency: 50, // ⬆️ Much higher shard concurrency
    batchSize: 100, // ⬆️ Larger batches
    shardCount: 100, // ⬆️ More shards for better distribution
    addressConcurrency: 20, // ⬆️ High concurrency within shards
  },

  async start({ logService, network }: { logService: any; network: NetworksEnum }) {
    try {
      if (this.instances.has(network)) {
        return this.instances.get(network)!.crawl()
      }

      const transferLogs = configIndexer.filter(config =>
        Object.values(IGovernanceErc20Logs).includes(config.event as IGovernanceErc20Logs),
      )

      const transferCrawler = new BlockchainLogCrawler({
        network,
        events: transferLogs,
        onError: async (error: any) => logger.error('Error Transfer Crawler', llo({ network, error })),
        logService,
        stopOnError: true,
        batchSize: 0.01,
        skipLogProcessing: true,
        filterLogs: async (logs: Log[]) => {
          const filteredLogs = await PoolingCrawler.filterLogs(logs, network)
          if (filteredLogs.length === 0) return []
          await this.parseAndProcessTransferLogs(filteredLogs, network)
          return filteredLogs
        },
      })

      this.instances.set(network, transferCrawler)
      return transferCrawler.crawl()
    } catch (error) {
      logger.error('TransferCrawler start', llo({ network, error }))
    }
  },

  async parseAndProcessTransferLogs(logs: Log[], network: NetworksEnum) {
    try {
      const startTime = Date.now()

      const deduplicatedLogs = this._deduplicateTransferLogs(logs, network)

      logger.info(
        'Starting high-concurrency events processing',
        llo({
          network,
          originalLogs: logs.length,
          deduplicatedLogs: deduplicatedLogs.length,
          shardCount: this.config.shardCount,
          shardConcurrency: this.config.concurrency,
          addressConcurrency: this.config.addressConcurrency,
        }),
      )

      if (deduplicatedLogs.length === 0) {
        logger.info('No logs to process after deduplication', llo({ network }))
        return
      }

      // Batch fetch all timestamps
      const blockNumbers = deduplicatedLogs.map(log => log.blockNumber)
      const minBlock = Math.min(...blockNumbers)
      const maxBlock = Math.max(...blockNumbers)
      this.timestampsCache = await Web3Helper.getBlocksTimestamps(minBlock, maxBlock, network)

      const shardedEvents = this._shardEventsByAddress(deduplicatedLogs)
      await this._processShardedEventsHighConcurrency(shardedEvents, network)

      const duration = Date.now() - startTime
      const totalEvents = shardedEvents.reduce((sum, shard) => sum + shard.logs.length, 0)

      logger.info(
        'High-concurrency processing completed',
        llo({
          network,
          totalShards: shardedEvents.length,
          totalEvents,
          duration: `${duration}ms`,
          eventsPerSecond: Math.round(totalEvents / (duration / 1000)),
          averageEventsPerShard: Math.round(totalEvents / shardedEvents.length),
        }),
      )
    } catch (error) {
      logger.error('High-concurrency processing failed', llo({ network, error }))
      throw error
    }
  },

  _deduplicateTransferLogs(logs: Log[], network: NetworksEnum): Log[] {
    const transferMap = new Map<string, Log>()
    const nonTransferLogs: Log[] = []
    let duplicatesRemoved = 0

    for (const log of logs) {
      if (log.topics[0] !== transferTopic) {
        nonTransferLogs.push(log)
        continue
      }

      try {
        const from = log.topics[1] ? ethers.getAddress(`0x${log.topics[1].slice(-40)}`) : null
        const to = log.topics[2] ? ethers.getAddress(`0x${log.topics[2].slice(-40)}`) : null

        if (!from || !to) {
          nonTransferLogs.push(log)
          continue
        }

        const transferKey = `${log.address.toLowerCase()}:${from.toLowerCase()}->${to.toLowerCase()}`

        const existingLog = transferMap.get(transferKey)

        if (!existingLog || this._isLogLater(log, existingLog)) {
          if (existingLog) duplicatesRemoved++
          transferMap.set(transferKey, log)
        } else {
          duplicatesRemoved++
        }
      } catch (error) {
        nonTransferLogs.push(log)
      }
    }

    const result = [...Array.from(transferMap.values()), ...nonTransferLogs]

    result.sort((a, b) => {
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber
      if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex
      return a.index - b.index
    })

    logger.info(
      'Deduplication completed',
      llo({
        network,
        originalLogs: logs.length,
        finalLogs: result.length,
        duplicatesRemoved,
        reduction: `${Math.round((duplicatesRemoved / logs.length) * 100)}%`,
      }),
    )

    return result
  },

  /**
   * Extract addresses from log based on event type
   */
  _extractAddressesFromLog(log: Log): string[] {
    const addresses: string[] = []

    try {
      if (log.topics[0] === transferTopic) {
        const from = log.topics[1] ? ethers.getAddress(`0x${log.topics[1].slice(-40)}`) : null
        const to = log.topics[2] ? ethers.getAddress(`0x${log.topics[2].slice(-40)}`) : null
        if (from && from !== ethers.ZeroAddress) addresses.push(from)
        if (to && to !== ethers.ZeroAddress) addresses.push(to)
      } else if (log.topics[0] === delegateVotesChangedTopic) {
        const delegate = log.topics[1] ? ethers.getAddress(`0x${log.topics[1].slice(-40)}`) : null
        if (delegate) addresses.push(delegate)
      }
    } catch (error) {}

    return addresses
  },

  /**
   * Shard events by address for parallel processing while maintaining chronological order
   */
  _shardEventsByAddress(logs: Log[]): ShardedEvents[] {
    const shards = new Map<string, Log[]>()

    for (const log of logs) {
      const addresses = this._extractAddressesFromLog(log)

      if (addresses.length === 0) continue

      const sortedAddresses = addresses.sort()
      const shardKey = this._getShardKey(sortedAddresses[0], sortedAddresses[1] || sortedAddresses[0])

      if (!shards.has(shardKey)) {
        shards.set(shardKey, [])
      }
      shards.get(shardKey)!.push(log)
    }

    return Array.from(shards.entries())
      .map(([shardKey, logs]) => {
        const involvedAddresses = new Set<string>()
        logs.forEach(log => {
          this._extractAddressesFromLog(log).forEach(addr => involvedAddresses.add(addr))
        })

        return {
          shardKey,
          logs: logs.sort((a, b) => {
            if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber
            if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex
            return a.index - b.index
          }),
          involvedAddresses,
        }
      })
      .sort((a, b) => a.shardKey.localeCompare(b.shardKey))
  },

  _getShardKey(address1: string, address2: string): string {
    const combined = `${address1}${address2}`.toLowerCase()
    const hash = this._simpleHash(combined)
    const shardId = hash % this.config.shardCount
    return `shard-${shardId.toString().padStart(3, '0')}`
  },

  /**
   * Simple hash function for sharding
   */
  _simpleHash(str: string): number {
    let hash = 0
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32-bit integer
    }
    return Math.abs(hash)
  },

  /**
   * Compare which log is later (higher block, tx index, log index)
   */
  _isLogLater(logA: Log, logB: Log): boolean {
    if (logA.blockNumber !== logB.blockNumber) {
      return logA.blockNumber > logB.blockNumber
    }
    if (logA.transactionIndex !== logB.transactionIndex) {
      return logA.transactionIndex > logB.transactionIndex
    }
    return logA.index > logB.index
  },

  /**
   * Process sharded events with ultra-high concurrency
   */
  async _processShardedEventsHighConcurrency(shardedEvents: ShardedEvents[], network: NetworksEnum): Promise<void> {
    return new Promise((resolve, reject) => {
      let processedShards = 0
      let processedEvents = 0
      const totalShards = shardedEvents.length
      const totalEvents = shardedEvents.reduce((sum, shard) => sum + shard.logs.length, 0)

      logger.info(
        'Starting ultra-high concurrency processing',
        llo({
          network,
          totalShards,
          totalEvents,
          maxConcurrentShards: this.config.concurrency,
        }),
      )

      const queue = async.queue(async (shard: ShardedEvents) => {
        const shardStartTime = Date.now()

        try {
          await this._processShardWithAddressGrouping(shard, network)

          processedShards++
          processedEvents += shard.logs.length

          const shardDuration = Date.now() - shardStartTime
          const progressPercent = Math.round((processedEvents / totalEvents) * 100)

          // Log progress every 10% or every 10 shards
          if (processedShards % 10 === 0 || [25, 50, 75, 90].includes(progressPercent)) {
            logger.info(
              'Processing progress',
              llo({
                network,
                progress: `${progressPercent}%`,
                shardsCompleted: `${processedShards}/${totalShards}`,
                eventsCompleted: `${processedEvents}/${totalEvents}`,
                queueLength: queue.length(),
                activeWorkers: queue.running(),
                avgShardTime: `${shardDuration}ms`,
              }),
            )
          }
        } catch (error) {
          logger.error(
            'Shard processing failed',
            llo({
              network,
              shardKey: shard.shardKey,
              eventCount: shard.logs.length,
              error,
            }),
          )
          throw error
        }
      }, this.config.concurrency) // High shard concurrency

      queue.drain(() => {
        logger.info(
          'All shards processed successfully',
          llo({
            network,
            totalShards: processedShards,
            totalEvents: processedEvents,
          }),
        )
        resolve()
      })

      queue.error(error => {
        reject(error)
      })

      // Add all shards to queue
      shardedEvents.forEach(shard => {
        queue.push(shard)
      })
    })
  },

  /**
   * Process shard with address-based grouping for maximum parallelism
   */
  async _processShardWithAddressGrouping(shard: ShardedEvents, network: NetworksEnum): Promise<void> {
    const { shardKey, logs } = shard

    // Group logs by actual addresses they affect
    const addressGroups = this._groupLogsByActualAddress(logs)

    logger.debug(
      'Processing shard with address grouping',
      llo({
        network,
        shardKey,
        totalLogs: logs.length,
        addressGroups: addressGroups.length,
        parallelism: `${addressGroups.length} address groups`,
      }),
    )

    // Process all address groups in parallel (no conflicts between different addresses)
    const results = await Promise.allSettled(
      addressGroups.map(async addressGroup => this._processAddressGroupSequentially(addressGroup, network, shardKey)),
    )

    const failures = results.filter(r => r.status === 'rejected')
    if (failures.length > 0) {
      logger.warn(`Shard ${shardKey} had ${failures.length}/${addressGroups.length} address group failures`)

      failures.slice(0, 3).forEach((failure, i) => {
        logger.error(`Address group failure ${i + 1}:`, {
          error: failure.status === 'rejected' ? failure.reason : 'Unknown error',
        })
      })
    }
  },

  /**
   * Group logs by the actual addresses they affect to avoid write conflicts
   */
  _groupLogsByActualAddress(logs: Log[]): AddressGroup[] {
    const addressToLogs = new Map<string, Log[]>()

    for (const log of logs) {
      const affectedAddresses = this._getAffectedAddresses(log)

      for (const address of affectedAddresses) {
        if (!addressToLogs.has(address)) {
          addressToLogs.set(address, [])
        }
        addressToLogs.get(address)!.push(log)
      }
    }

    return Array.from(addressToLogs.entries()).map(([address, logs]) => ({
      address,
      logs: logs.sort((a, b) => {
        // Maintain chronological order for same address
        if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber
        if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex
        return a.index - b.index
      }),
    }))
  },

  /**
   * Get all addresses affected by a log
   */
  _getAffectedAddresses(log: Log): string[] {
    const addresses: string[] = []

    if (log.topics[0] === transferTopic) {
      const from = log.topics[1] ? ethers.getAddress(`0x${log.topics[1].slice(-40)}`) : null
      const to = log.topics[2] ? ethers.getAddress(`0x${log.topics[2].slice(-40)}`) : null

      if (from && from !== ethers.ZeroAddress) addresses.push(from)
      if (to && to !== ethers.ZeroAddress) addresses.push(to)
    } else if (log.topics[0] === delegateVotesChangedTopic) {
      const delegate = log.topics[1] ? ethers.getAddress(`0x${log.topics[1].slice(-40)}`) : null
      if (delegate) addresses.push(delegate)
    }

    return addresses
  },

  /**
   * Process events for one address sequentially (to avoid write conflicts)
   * These MUST be sequential since they affect the same address
   */
  async _processAddressGroupSequentially(
    addressGroup: AddressGroup,
    network: NetworksEnum,
    shardKey: string,
  ): Promise<void> {
    const { address, logs } = addressGroup

    for (const log of logs) {
      try {
        await this._processEventLog(log, network, {
          shardKey,
          address,
          groupSize: logs.length,
        })
      } catch (error) {
        logger.error(
          'Failed processing event in address group',
          llo({
            network,
            address,
            shardKey,
            txHash: log.transactionHash,
            logIndex: log.index,
            error,
          }),
        )
        // Continue processing other events for this address
        // Don't throw to avoid failing the entire address group
      }
    }
  },

  /**
   * Process individual event log based on type
   */
  async _processEventLog(log: Log, network: NetworksEnum, info: any = {}): Promise<void> {
    try {
      if (log.topics[0] === transferTopic) {
        await this._processTransferLog(log, network, info)
      } else if (log.topics[0] === delegateVotesChangedTopic) {
        await this._processDelegateVotesChangedLog(log, network, info)
      }
    } catch (error) {
      logger.error(
        'Event log processing failed',
        llo({
          network,
          eventType: log.topics[0] === transferTopic ? 'Transfer' : 'DelegateVotesChanged',
          txHash: log.transactionHash,
          logIndex: log.index,
          shardInfo: info,
          error,
        }),
      )
      throw error
    }
  },

  _parseLogArguments: (log: Log, network: NetworksEnum) => {
    const governanceEventNames = Object.values(IGovernanceErc20Logs)
    const abi = GovernanceERC20.abi.filter(
      (item: any) => item.type === 'event' && governanceEventNames.includes(item.name as IGovernanceErc20Logs),
    )

    const erc721abi = ERC721.abi.filter(
      (item: any) => item.type === 'event' && item.name === IGovernanceErc20Logs.Transfer,
    )

    const iFace = new Interface([...abi, ...erc721abi])
    const decoded = Web3Utils.parseLog(log, iFace)
    const iLogInfo = Web3Utils.parseInfoLog(log, decoded?.name!, network)

    return {
      event: decoded,
      info: iLogInfo,
    }
  },

  /**
   * Process Transfer event log
   */
  async _processTransferLog(log: Log, network: NetworksEnum, _info: any): Promise<void> {
    try {
      const { event, info } = this._parseLogArguments(log, network)
      if (!event || !info) {
        return
      }

      const startTime = Date.now()

      await GovernanceErc20Handler.transfer(event, info, false, this.timestampsCache)

      const timeTaken = Date.now() - startTime

      // Only log slow transfers (> 1 second)
      if (timeTaken > 1000) {
        logger.warn(
          'Slow transfer processing detected',
          llo({
            ..._info,
            network,
            tokenAddress: info.address,
            blockNumber: Number(log.blockNumber),
            txHash: log.transactionHash,
            timeTaken: `${timeTaken}ms`,
          }),
        )
      }
    } catch (error) {
      logger.error(
        'Transfer processing failed',
        llo({
          network,
          txHash: log.transactionHash,
          logIndex: log.index,
          error,
        }),
      )
      throw error
    }
  },

  /**
   * Process DelegateVotesChanged event log
   */
  _processDelegateVotesChangedLog: async function (log: Log, network: NetworksEnum, _info: any): Promise<void> {
    try {
      const { event, info } = this._parseLogArguments(log, network)

      if (!event || !info) {
        return
      }

      const startTime = Date.now()

      await GovernanceErc20Handler.delegateVotesChanged(event, info, false, this.timestampsCache)

      const timeTaken = Date.now() - startTime

      // Only log slow delegate processing (> 1 second)
      if (timeTaken > 1000) {
        logger.warn(
          'Slow delegate processing detected',
          llo({
            ..._info,
            network,
            tokenAddress: log.address,
            blockNumber: Number(log.blockNumber),
            txHash: log.transactionHash,
            timeTaken: `${timeTaken}ms`,
          }),
        )
      }
    } catch (error) {
      logger.error(
        'DelegateVotesChanged processing failed',
        llo({
          network,
          txHash: log.transactionHash,
          logIndex: log.index,
          error,
        }),
      )
      throw error
    }
  },
}

export default TransferCrawler
