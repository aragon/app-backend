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

// Interface for GovernanceERC20 events
const govTokenInterface = new Interface(GovernanceERC20.abi)
const transferTopic = govTokenInterface.getEvent('Transfer')?.topicHash!
const delegateVotesChangedTopic = govTokenInterface.getEvent('DelegateVotesChanged')?.topicHash!

const governanceEventNames = Object.values(IGovernanceErc20Logs)
const abi = GovernanceERC20.abi.filter(
  (item: any) => item.type === 'event' && governanceEventNames.includes(item.name as IGovernanceErc20Logs),
)

const erc721abi = ERC721.abi.filter((item: any) => item.type === 'event' && item.name === IGovernanceErc20Logs.Transfer)
const iFace = new Interface([...abi, ...erc721abi])

const TransferCrawler = {
  instances: new Map<NetworksEnum, BlockchainLogCrawler>(),

  // Configuration for event loop optimization
  config: {
    yieldInterval: 10, // Yield to event loop every N logs
    yieldDelay: 0, // ms to yield (0 = setImmediate, >0 = setTimeout)
    batchSize: 100, // Logs to process before yielding
    logProgressInterval: 50, // Log progress every N logs
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
          await this.parseAndProcessTransferLogsSequential(filteredLogs, network)
          return filteredLogs
        },
      })

      this.instances.set(network, transferCrawler)
      return transferCrawler.crawl()
    } catch (error) {
      logger.error('TransferCrawler start', llo({ network, error }))
    }
  },

  async _collectTimestamps(logs: Log[], network: NetworksEnum) {
    const blockNumbers = logs.map(log => log.blockNumber)
    const minBlock = Math.min(...blockNumbers)
    const maxBlock = Math.max(...blockNumbers)

    return await Web3Helper.getBlocksTimestamps(minBlock, maxBlock, network)
  },

  // STRATEGY 1: Sequential processing with event loop yielding
  async parseAndProcessTransferLogsSequential(logs: Log[], network: NetworksEnum) {
    try {
      const startTime = Date.now()
      const deduplicatedLogs = this._deduplicateTransferLogs(logs, network)

      logger.info(
        'Starting sequential processing with event loop optimization',
        llo({
          network,
          totalLogs: logs.length,
          deduplicatedLogs: deduplicatedLogs.length,
          yieldInterval: this.config.yieldInterval,
        }),
      )

      // Pre-fetch all timestamps once
      const timestampCache = await this._collectTimestamps(deduplicatedLogs, network)

      // Process logs sequentially but yield to event loop periodically
      await this._processLogsWithYielding(deduplicatedLogs, network, timestampCache)

      const duration = Date.now() - startTime
      logger.info(
        'Sequential processing completed',
        llo({
          network,
          duration: `${duration}ms`,
          totalLogs: deduplicatedLogs.length,
          avgTimePerLog: `${Math.round(duration / deduplicatedLogs.length)}ms`,
        }),
      )
    } catch (error) {
      logger.error('Sequential processing failed', llo({ network, error }))
      throw error
    }
  },

  // STRATEGY 2: Process with periodic yielding to event loop
  async _processLogsWithYielding(logs: Log[], network: NetworksEnum, timestampCache: any): Promise<void> {
    for (let i = 0; i < logs.length; i++) {
      const log = logs[i]

      try {
        await this._processEventLog(log, network, timestampCache)

        // Yield to event loop periodically to prevent blocking
        if ((i + 1) % this.config.yieldInterval === 0) {
          await this._yieldToEventLoop()

          // Log progress periodically
          if ((i + 1) % this.config.logProgressInterval === 0) {
            logger.info(
              'Processing progress',
              llo({
                network,
                processed: i + 1,
                total: logs.length,
                percentage: Math.round(((i + 1) / logs.length) * 100),
              }),
            )
          }
        }
      } catch (error) {
        logger.error(
          'Log processing failed, continuing with next log',
          llo({
            network,
            logIndex: i,
            txHash: log.transactionHash,
            error,
          }),
        )
        // Continue processing next logs instead of failing completely
      }
    }
  },

  // STRATEGY 3: Batch processing while maintaining order within batches
  async parseAndProcessTransferLogsBatched(logs: Log[], network: NetworksEnum) {
    try {
      const startTime = Date.now()
      const deduplicatedLogs = this._deduplicateTransferLogs(logs, network)
      const timestampCache = await this._collectTimestamps(deduplicatedLogs, network)

      logger.info(
        'Starting batched sequential processing',
        llo({
          network,
          totalLogs: deduplicatedLogs.length,
          batchSize: this.config.batchSize,
        }),
      )

      // Process in batches to allow yielding between batches
      const batches = this._createBatches(deduplicatedLogs, this.config.batchSize)

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]
        const batchStartTime = Date.now()

        // Process batch sequentially
        for (let i = 0; i < batch.length; i++) {
          const log = batch[i]
          try {
            await this._processEventLog(log, network, timestampCache)
          } catch (error) {
            logger.error(
              'Log processing failed in batch',
              llo({
                network,
                batchIndex,
                logIndex: i,
                txHash: log.transactionHash,
                error,
              }),
            )
          }
        }

        // Yield to event loop between batches
        await this._yieldToEventLoop()

        logger.verbose(
          `Batch ${batchIndex + 1}/${batches.length} completed`,
          llo({
            network,
            batchIndex: batchIndex + 1,
            totalBatches: batches.length,
            logsInBatch: batch.length,
            batchDuration: `${Date.now() - batchStartTime}ms`,
          }),
        )
      }

      const duration = Date.now() - startTime
      logger.info(
        'Batched sequential processing completed',
        llo({
          network,
          duration: `${duration}ms`,
          totalLogs: deduplicatedLogs.length,
          batchesProcessed: batches.length,
        }),
      )
    } catch (error) {
      logger.error('Batched sequential processing failed', llo({ network, error }))
      throw error
    }
  },

  // STRATEGY 4: Stream-like processing with backpressure handling
  async parseAndProcessTransferLogsStreamed(logs: Log[], network: NetworksEnum) {
    try {
      const startTime = Date.now()
      const deduplicatedLogs = this._deduplicateTransferLogs(logs, network)
      const timestampCache = await this._collectTimestamps(deduplicatedLogs, network)

      logger.info(
        'Starting streamed processing',
        llo({
          network,
          totalLogs: deduplicatedLogs.length,
        }),
      )

      // Create an async iterator for sequential processing
      await this._processLogsAsyncIterator(deduplicatedLogs, network, timestampCache)

      const duration = Date.now() - startTime
      logger.info(
        'Streamed processing completed',
        llo({
          network,
          duration: `${duration}ms`,
          totalLogs: deduplicatedLogs.length,
        }),
      )
    } catch (error) {
      logger.error('Streamed processing failed', llo({ network, error }))
      throw error
    }
  },

  async *_createLogAsyncIterator(logs: Log[]): AsyncIterableIterator<Log> {
    for (const log of logs) {
      yield log
      // Small delay to prevent overwhelming the event loop
      await this._yieldToEventLoop()
    }
  },

  async _processLogsAsyncIterator(logs: Log[], network: NetworksEnum, timestampCache: any): Promise<void> {
    let processedCount = 0

    for await (const log of this._createLogAsyncIterator(logs)) {
      try {
        await this._processEventLog(log, network, timestampCache)
        processedCount++

        if (processedCount % this.config.logProgressInterval === 0) {
          logger.info(
            'Stream processing progress',
            llo({
              network,
              processed: processedCount,
              total: logs.length,
              percentage: Math.round((processedCount / logs.length) * 100),
            }),
          )
        }
      } catch (error) {
        logger.error(
          'Stream log processing failed',
          llo({
            network,
            processedCount,
            txHash: log.transactionHash,
            error,
          }),
        )
      }
    }
  },

  // Helper method to yield control back to the event loop
  async _yieldToEventLoop(): Promise<void> {
    if (this.config.yieldDelay === 0) {
      // Use setImmediate for fastest yielding
      return new Promise(resolve => setImmediate(resolve))
    } else {
      // Use setTimeout with specified delay
      return new Promise(resolve => setTimeout(resolve, this.config.yieldDelay))
    }
  },

  // Helper method to create batches
  _createBatches<T>(array: T[], batchSize: number): T[][] {
    const batches: T[][] = []
    for (let i = 0; i < array.length; i += batchSize) {
      batches.push(array.slice(i, i + batchSize))
    }
    return batches
  },

  // STRATEGY 5: Memory-efficient processing for very large datasets
  async parseAndProcessTransferLogsMemoryEfficient(logs: Log[], network: NetworksEnum) {
    try {
      const startTime = Date.now()

      logger.info(
        'Starting memory-efficient processing',
        llo({
          network,
          totalLogs: logs.length,
        }),
      )

      // Process in smaller chunks to avoid memory issues
      const chunkSize = 1000 // Adjust based on available memory

      for (let i = 0; i < logs.length; i += chunkSize) {
        const chunk = logs.slice(i, i + chunkSize)
        const deduplicatedChunk = this._deduplicateTransferLogs(chunk, network)
        const timestampCache = await this._collectTimestamps(deduplicatedChunk, network)

        // Process chunk sequentially
        await this._processLogsWithYielding(deduplicatedChunk, network, timestampCache)

        // Yield between chunks
        await this._yieldToEventLoop()

        logger.info(
          'Chunk processed',
          llo({
            network,
            chunkStart: i,
            chunkEnd: Math.min(i + chunkSize, logs.length),
            totalLogs: logs.length,
          }),
        )
      }

      const duration = Date.now() - startTime
      logger.info(
        'Memory-efficient processing completed',
        llo({
          network,
          duration: `${duration}ms`,
          totalLogs: logs.length,
        }),
      )
    } catch (error) {
      logger.error('Memory-efficient processing failed', llo({ network, error }))
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
        originalLogs: logs.length,
        finalLogs: result.length,
        duplicatesRemoved,
        reduction: `${Math.round((duplicatesRemoved / logs.length) * 100)}%`,
        network,
      }),
    )

    return result
  },

  _isLogLater(logA: Log, logB: Log): boolean {
    if (logA.blockNumber !== logB.blockNumber) {
      return logA.blockNumber > logB.blockNumber
    }
    if (logA.transactionIndex !== logB.transactionIndex) {
      return logA.transactionIndex > logB.transactionIndex
    }
    return logA.index > logB.index
  },

  async _processEventLog(log: Log, network: NetworksEnum, timestampCache: any): Promise<void> {
    try {
      if (log.topics[0] === transferTopic) {
        await this._processTransferLog(log, network, timestampCache)
      } else if (log.topics[0] === delegateVotesChangedTopic) {
        await this._processDelegateVotesChangedLog(log, network, timestampCache)
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
    const decoded = Web3Utils.parseLog(log, iFace)
    const iLogInfo = Web3Utils.parseInfoLog(log, decoded?.name!, network)

    return {
      event: decoded,
      info: iLogInfo,
    }
  },

  async _processTransferLog(log: Log, network: NetworksEnum, timestampCache: any): Promise<void> {
    try {
      const { event, info } = this._parseLogArguments(log, network)
      if (!event || !info) {
        return
      }

      const startTime = Date.now()
      await GovernanceErc20Handler.transfer(event, info, false, timestampCache)

      logger.verbose(
        'Processing transfer',
        llo({
          network,
          tokenAddress: info.address,
          blockNumber: Number(log.blockNumber),
          txHash: log.transactionHash,
          timeTaken: Date.now() - startTime,
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

  async _processDelegateVotesChangedLog(log: Log, network: NetworksEnum, timestampCache: any): Promise<void> {
    try {
      const { event, info } = this._parseLogArguments(log, network)

      if (!event || !info) {
        return
      }

      const startTime = Date.now()
      await GovernanceErc20Handler.delegateVotesChanged(event, info, false, timestampCache)

      logger.verbose(
        'Processing delegate votes changed',
        llo({
          network,
          tokenAddress: log.address,
          blockNumber: Number(log.blockNumber),
          txHash: log.transactionHash,
          timeTaken: Date.now() - startTime,
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
