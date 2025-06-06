import async from 'async'
import { type Log, ethers, Interface } from 'ethers'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import logger from '@logger'
import BlockchainLogCrawler from '@src/modules/blockchainLogCrawler'
import { IGovernanceErc20Logs, type IIndexerConfig, type NetworksEnum } from '@types'
import PoolingCrawler from '@modules/poolingCrawler'
import { ERC721 } from '@artifacts/ERC721'
import Web3Utils from '@src/helpers/web3Utils'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'

const llo = logger.logMeta.bind(null, { service: 'module:TransferCrawler' })

const govTokenInterface = new Interface(GovernanceERC20.abi)
const transferTopic = govTokenInterface.getEvent('Transfer')?.topicHash!
const delegateVotesChangedTopic = govTokenInterface.getEvent('DelegateVotesChanged')?.topicHash!

interface ShardedEvents {
  shardKey: string
  logs: Log[]
  involvedAddresses: Set<string>
}

const TransferCrawler = {
  instances: new Map<NetworksEnum, BlockchainLogCrawler>(),

  config: {
    concurrency: 20,
    batchSize: 500,
    shardCount: 150,
  },

  async start({ logService, network, topics }: { logService: any; network: NetworksEnum; topics: IIndexerConfig[] }) {
    try {
      if (this.instances.has(network)) {
        return this.instances.get(network)!.crawl()
      }

      const transferCrawler = new BlockchainLogCrawler({
        network,
        events: topics,
        onError: async (error: any) => logger.error('Error Transfer Crawler', llo({ network, error })),
        logService,
        stopOnError: true,
        batchSize: 0.01,
        skipLogProcessing: true,
        filterLogs: async (logs: Log[]) => {
          const filteredLogs = await PoolingCrawler.filterLogs(logs, network)
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

      logger.info(
        'Starting mixed events processing with address sharding',
        llo({
          network,
          totalLogs: logs.length,
          shardCount: this.config.shardCount,
          concurrency: this.config.concurrency,
        }),
      )

      const shardedEvents = this._shardEventsByAddress(logs)

      await this._processShardedEvents(shardedEvents, network)

      const duration = Date.now() - startTime
      logger.info(
        'Events processing completed',
        llo({
          network,
          totalEvents: shardedEvents.length,
          totalShards: shardedEvents.length,
          duration: `${duration}ms`,
          eventsPerSecond: Math.round(shardedEvents.length / (duration / 1000)),
        }),
      )
    } catch (error) {
      logger.error('Mixed events processing failed', llo({ network, error }))
      throw error
    }
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
   * Process sharded events using async queue
   */
  async _processShardedEvents(shardedEvents: ShardedEvents[], network: NetworksEnum): Promise<void> {
    return new Promise((resolve, reject) => {
      let processedShards = 0
      let processedEvents = 0

      const queue = async.queue(async (shard: ShardedEvents) => {
        try {
          await this._processShardBatches(shard, network)

          processedShards++
          processedEvents += shard.logs.length

          logger.debug(
            'Shard processed',
            llo({
              network,
              shardKey: shard.shardKey,
              eventCount: shard.logs.length,
              involvedAddresses: shard.involvedAddresses.size,
              progress: `${processedShards}/${shardedEvents.length} shards`,
              totalEvents: processedEvents,
            }),
          )
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
      }, this.config.concurrency)

      queue.drain(() => {
        logger.info(
          'All shards processed',
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
   * Process events within a shard in batches
   */
  async _processShardBatches(shard: ShardedEvents, network: NetworksEnum): Promise<void> {
    const { shardKey, logs } = shard

    // Process logs in batches within the shard
    for (let i = 0; i < logs.length; i += this.config.batchSize) {
      const batch = logs.slice(i, i + this.config.batchSize)

      logger.debug(
        'Processing shard batch',
        llo({
          network,
          shardKey,
          batchIndex: Math.floor(i / this.config.batchSize),
          batchSize: batch.length,
          progress: `${i + batch.length}/${logs.length}`,
        }),
      )

      // Process each log in the batch sequentially (maintains chronological order)
      for (const log of batch) {
        await this._processEventLog(log, network)
      }
    }
  },

  /**
   * Process individual event log based on type
   */
  async _processEventLog(log: Log, network: NetworksEnum): Promise<void> {
    try {
      if (log.topics[0] === transferTopic) {
        await this._processTransferLog(log, network)
      } else if (log.topics[0] === delegateVotesChangedTopic) {
        await this._processDelegateVotesChangedLog(log, network)
      }
    } catch (error) {
      logger.error(
        'Event log processing failed',
        llo({
          network,
          eventType: log.topics[0] === transferTopic ? 'Transfer' : 'DelegateVotesChanged',
          txHash: log.transactionHash,
          logIndex: log.index,
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
  async _processTransferLog(log: Log, network: NetworksEnum): Promise<void> {
    try {
      const { event, info } = this._parseLogArguments(log, network)
      if (!event || !info) {
        return
      }

      await GovernanceErc20Handler.transfer(event, info)

      logger.debug(
        'Processing transfer',
        llo({
          network,
          tokenAddress: info.address,
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
        }),
      )
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
  _processDelegateVotesChangedLog: async function (log: Log, network: NetworksEnum): Promise<void> {
    try {
      const { event, info } = this._parseLogArguments(log, network)

      if (!event || !info) {
        return
      }

      await GovernanceErc20Handler.delegateVotesChanged(event, info)

      logger.debug(
        'Processing delegate votes changed',
        llo({
          network,
          tokenAddress: log.address,
          blockNumber: log.blockNumber,
          txHash: log.transactionHash,
        }),
      )
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
