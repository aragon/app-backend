import { type Log, type LogDescription, Interface } from 'ethers'
import async from 'async'
import logger from '@logger'
import {
  type IIndexerConfig,
  type IFormattedLog,
  type NetworksEnum,
  type ILogProcessingConfig,
  type IProcessingContext,
  type IProcessingStats,
  type IParallelConfig,
} from '@types'
import Web3Utils from '@helpers/web3Utils'
import { CrawlerErrorHandler } from './crawlerErrorHandler'

const llo = logger.logMeta.bind(null, { service: 'LogProcessingEngine' })

/**
 * Handles all log processing operations
 *
 * Responsibilities:
 * - Parse logs into events
 * - Execute event handlers
 * - Sort and deduplicate logs
 * - Handle parallel/sequential processing
 * - Track processing statistics
 */
export class LogProcessingEngine {
  private readonly events: IIndexerConfig[]
  private readonly isTopicObject: boolean
  private readonly onlyHistorical?: boolean
  private readonly stopOnError: boolean
  private readonly network: NetworksEnum
  private readonly onError?: (error: Error, log?: Log) => void
  private readonly errorHandler: CrawlerErrorHandler

  // Processing statistics
  private stats: IProcessingStats = {
    nbSuccess: 0,
    nbError: 0,
    nbTotal: 0,
    lastSync: 0,
  }

  // Deduplication tracking
  private readonly processedKeys = new Set<string>()

  constructor(config: ILogProcessingConfig & { network: NetworksEnum }) {
    this.events = config.events
    this.isTopicObject = config.isTopicObject
    this.onlyHistorical = config.onlyHistorical
    this.stopOnError = config.stopOnError ?? false
    this.network = config.network
    this.onError = config.onError

    // Initialize error handler for consistent error conversion
    this.errorHandler = new CrawlerErrorHandler({
      stopOnError: this.stopOnError,
    })
  }

  /**
   * Sort logs by block number and transaction index
   */
  sortLogs(logs: Log[]): Log[] {
    return logs.sort((a, b) => {
      // First, sort by blockNumber in ascending order
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber
      // If blockNumbers are the same, sort by transactionIndex in ascending order
      if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex
      // If both are the same, sort by logIndex
      return a.index - b.index
    })
  }

  /**
   * Build topic filters from events configuration
   */
  buildTopics(events: any[]): string[] {
    return events
      .map(item => {
        if (!item?.topic) {
          logger.error(
            `Topic hash not found for event ${item?.event}`,
            llo({
              event: item?.event,
              address: item?.address,
            }),
          )
          return null
        }
        return item.topic
      })
      .filter(Boolean)
      .flat() // Flatten arrays of topics
  }

  /**
   * Format a raw log into an event with handler
   */
  formatLog(log: Log): IFormattedLog {
    const eventSetting: IIndexerConfig | undefined = this.events.find(item => {
      if (typeof item.topic === 'string') {
        return item.topic === log.topics[0]
      }
      if (Array.isArray(item.topic)) {
        return item.topic.includes(log.topics[0])
      }
      return false
    })

    if (!eventSetting) {
      logger.warn(
        'Error event setting not found in blockchainCrawler',
        llo({
          topic: log.topics[0],
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
        }),
      )
      return {
        event: null as any,
        handler: null,
        info: null as any,
      }
    }

    const { config } = eventSetting
    let parsedEvent: LogDescription | null = null
    let matchingHandler: any = null

    for (const configItem of config) {
      const abiFragment = configItem.abi.find((item: any) => item.name === eventSetting?.event && item.type === 'event')
      if (!abiFragment) continue
      const iFace = new Interface([abiFragment])
      try {
        parsedEvent = Web3Utils.parseLog(log, iFace)
        if (parsedEvent) {
          matchingHandler = configItem.handler
          break
        }
      } catch (_) {
        // Continue with next config
      }
    }

    if (!parsedEvent && config.length) {
      logger.warn(
        'Error parsing log in blockchainCrawler',
        llo({
          topic: log.topics[0],
          configs: config.length,
          blockNumber: log.blockNumber,
          transactionHash: log.transactionHash,
          log,
        }),
      )
    }

    const info = Web3Utils.parseInfoLog(log, eventSetting.event, this.network)

    return {
      event: parsedEvent!,
      handler: matchingHandler,
      info,
    }
  }

  /**
   * Process logs sequentially
   */
  async processLogs(
    logs: Log[],
    context: IProcessingContext,
    strategy?: string,
    address?: string,
    logService?: string,
  ): Promise<number> {
    let highestBlockNumber = 0
    let logIndex = 0

    for (const log of logs) {
      logIndex++
      try {
        const startTime = Date.now()
        const { handler, event, info } = this.formatLog(log)

        if (!event) {
          highestBlockNumber = Math.max(highestBlockNumber, log.blockNumber)
          continue
        }

        await handler(event, info, this.onlyHistorical)

        if (log.blockNumber) {
          highestBlockNumber = Math.max(highestBlockNumber, log.blockNumber)
          if (log.blockNumber > this.stats.lastSync) {
            this.stats.lastSync = log.blockNumber
          }
        }

        this.stats.nbSuccess++

        logger.verbose(
          'Processing Event',
          llo({
            network: this.network,
            address,
            logService,
            blockNumber: Number(log.blockNumber),
            logsLen: logs.length,
            logIndex,
            event: event.name,
            strategy,
            fromBlock: context.fromBlock,
            processedTime: Date.now() - startTime,
            toBlock: context.toBlock,
            latestBlock: context.latestBlock,
            transactionHash: log.transactionHash,
          }),
        )
      } catch (error: any) {
        this.stats.nbError++
        this.onError?.(this.errorHandler.toError(error), log)

        if (this.stopOnError) {
          throw error
        }
      }
    }

    return highestBlockNumber
  }

  /**
   * Process logs in parallel using async queue
   */
  async processLogsParallel(
    logs: Log[],
    context: IProcessingContext,
    parallelConfig: IParallelConfig,
    strategy?: string,
    address?: string,
    logService?: string,
  ): Promise<number> {
    if (!logs || logs.length === 0) {
      return 0
    }

    const concurrency = parallelConfig.concurrency || 10
    const totalLogs = logs.length
    let highestBlockNumber = 0
    let processedCount = 0

    return new Promise((resolve, reject) => {
      const queue = async.queue(async (task: { log: Log; index: number }) => {
        const { log, index } = task

        // Create unique key for deduplication
        const logKey = `${log.blockNumber}-${log.transactionHash}-${log.transactionIndex}-${log.index}`

        if (this.processedKeys.has(logKey)) {
          processedCount++
          return
        }
        this.processedKeys.add(logKey)

        const startTime = Date.now()

        try {
          const { handler, event, info } = this.formatLog(log)

          if (!event) {
            processedCount++
            return
          }

          await handler(event, info, this.onlyHistorical)

          this.stats.nbSuccess++

          logger.verbose(
            'Processing Event (Parallel)',
            llo({
              network: this.network,
              address,
              logService,
              blockNumber: Number(log.blockNumber),
              logsLen: totalLogs,
              logIndex: index + 1,
              processedCount: processedCount + 1,
              event: event.name,
              strategy,
              fromBlock: context.fromBlock,
              processedTime: Date.now() - startTime,
              toBlock: context.toBlock,
              latestBlock: context.latestBlock,
              transactionHash: log.transactionHash,
              parallel: true,
              concurrency,
            }),
          )

          processedCount++
        } catch (error: any) {
          this.stats.nbError++
          processedCount++
          this.onError?.(this.errorHandler.toError(error), log)

          if (this.stopOnError) {
            queue.kill()
            reject(error)
          }
        }

        // Update highest block number regardless of success/failure
        if (log.blockNumber) {
          highestBlockNumber = Math.max(highestBlockNumber, log.blockNumber)
          if (log.blockNumber > this.stats.lastSync) {
            this.stats.lastSync = log.blockNumber
          }
        }
      }, concurrency)

      // Add all logs to queue with their index
      logs.map((log, index) => ({ log, index }))
      logs.forEach(async (log, index) => queue.push({ log, index }))

      // Handle completion
      queue.drain(() => {
        if (processedCount >= totalLogs) {
          resolve(highestBlockNumber)
        }
      })

      // Handle errors
      queue.error((error, task) => {
        logger.error(
          'Parallel processing queue error',
          llo({
            error,
            transactionHash: task?.log?.transactionHash,
            logIndex: task?.index,
            network: this.network,
            address,
            logService,
          }),
        )
        if (this.stopOnError) {
          queue.kill()
          reject(error)
        }
      })

      // If queue is empty, resolve immediately
      if (queue.length() === 0 && queue.running() === 0) {
        resolve(highestBlockNumber)
      }
    })
  }

  /**
   * Process logs in parallel batches for better memory management
   * This method maintains the original behavior of detecting batch handlers
   */
  async processLogsParallelBatch(
    logs: Log[],
    context: IProcessingContext,
    parallelConfig: IParallelConfig,
  ): Promise<number> {
    if (!logs || logs.length === 0) {
      return 0
    }

    const batchSize = parallelConfig.batchSize || 5000
    const concurrency = parallelConfig.concurrency || 10
    let highestBlockNumber = 0

    // Group logs by event type and handler for better batching
    const eventBatches = new Map<
      string,
      {
        logs: Array<{ log: Log; formatted: IFormattedLog }>
        handler: any
        eventName: string
      }
    >()

    // First pass: parse all logs and group by event type
    for (const log of logs) {
      const formatted = this.formatLog(log)
      if (!formatted?.event || !formatted?.handler) continue

      const eventName = formatted.event.name
      const handlerKey = `${eventName}_${formatted.handler.name || 'default'}`

      if (!eventBatches.has(handlerKey)) {
        eventBatches.set(handlerKey, {
          logs: [],
          handler: formatted.handler,
          eventName,
        })
      }

      eventBatches.get(handlerKey)!.logs.push({ log, formatted })
    }

    // Process each event type's batches
    for (const [handlerKey, eventData] of eventBatches) {
      const { logs: eventLogs, handler, eventName } = eventData

      // Check if this handler is a batch handler
      const isBatchHandler = handler.name?.endsWith('Batch')

      if (isBatchHandler) {
        // For batch handlers, split into chunks and call with arrays
        for (let i = 0; i < eventLogs.length; i += batchSize) {
          const chunk = eventLogs.slice(i, Math.min(i + batchSize, eventLogs.length))

          // Prepare array of events for batch handler
          const eventsArray = chunk.map(item => ({
            parsedEvent: item.formatted.event,
            info: item.formatted.info,
          }))

          try {
            // Call batch handler with array of events
            await handler(eventsArray)

            // Update stats and block number
            for (const item of chunk) {
              if (item.log.blockNumber) {
                highestBlockNumber = Math.max(highestBlockNumber, item.log.blockNumber)
                if (item.log.blockNumber > this.stats.lastSync) {
                  this.stats.lastSync = item.log.blockNumber
                }
              }
              this.stats.nbSuccess++
            }
          } catch (error: any) {
            this.stats.nbError += chunk.length
            this.onError?.(this.errorHandler.toError(error), chunk[0]?.log)

            logger.error(
              'Batch handler processing error',
              llo({
                error,
                handlerKey,
                eventName,
                batchSize: chunk.length,
              }),
            )

            if (this.stopOnError) {
              throw error
            }
          }
        }
      } else {
        // For regular handlers, process individually but in parallel chunks
        const chunks: (typeof eventLogs)[] = []
        for (let i = 0; i < eventLogs.length; i += batchSize) {
          chunks.push(eventLogs.slice(i, Math.min(i + batchSize, eventLogs.length)))
        }

        await async.eachLimit(chunks, concurrency, async chunk => {
          for (const item of chunk) {
            try {
              await handler(item.formatted.event, item.formatted.info, this.onlyHistorical)

              if (item.log.blockNumber) {
                highestBlockNumber = Math.max(highestBlockNumber, item.log.blockNumber)
                if (item.log.blockNumber > this.stats.lastSync) {
                  this.stats.lastSync = item.log.blockNumber
                }
              }

              this.stats.nbSuccess++
            } catch (error: any) {
              this.stats.nbError++
              this.onError?.(this.errorHandler.toError(error), item.log)

              logger.error(
                'Individual processing error',
                llo({
                  error,
                  eventName,
                  blockNumber: item.log.blockNumber,
                }),
              )

              if (this.stopOnError) {
                throw error
              }
            }
          }
        })
      }
    }

    // Clear event batches from memory
    eventBatches.clear()

    return highestBlockNumber
  }

  /**
   * Get current processing statistics
   */
  getProcessingStats(): IProcessingStats {
    return { ...this.stats }
  }

  /**
   * Reset processing statistics
   */
  resetStats(): void {
    this.stats = {
      nbSuccess: 0,
      nbError: 0,
      nbTotal: 0,
      lastSync: 0,
    }
    this.processedKeys.clear()
  }

  /**
   * Update total count
   */
  updateTotalCount(count: number): void {
    this.stats.nbTotal += count
  }
}
