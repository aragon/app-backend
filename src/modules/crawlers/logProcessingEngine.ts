import Web3Utils from '@helpers/web3Utils'
import logger from '@logger'
import {
  ICrawStrategy,
  type IFormattedLog,
  type IIndexerConfig,
  type ILogProcessingConfig,
  type IParallelConfig,
  type IProcessingContext,
  type IProcessingStats,
  type NetworksEnum,
} from '@types'
import async from 'async'
import { Interface, type Log, type LogDescription } from 'ethers'
import { CrawlerErrorHandler } from './crawlerErrorHandler'
import { TickContext } from './tickContext'

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

  private isRealtimeStrategy(strategy?: string): boolean {
    return strategy === ICrawStrategy.getBlockReceipts || strategy === ICrawStrategy.getLogsWithoutTopics
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
    let matchingBatchHandler: any = null

    for (const configItem of config) {
      const abiFragment = configItem.abi.find((item: any) => item.name === eventSetting?.event && item.type === 'event')
      if (!abiFragment) continue
      const iFace = new Interface([abiFragment])
      try {
        parsedEvent = Web3Utils.parseLog(log, iFace)
        if (parsedEvent) {
          matchingHandler = configItem.handler
          matchingBatchHandler = configItem.batchHandler
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
      batchHandler: matchingBatchHandler,
      info,
    }
  }

  private static readonly BATCH_THRESHOLD = 10

  /**
   * Process logs sequentially, with adaptive batch handler support.
   * Events with a `batchHandler` in config are grouped — if volume exceeds threshold,
   * the batch handler is used; otherwise falls back to the individual handler.
   */
  async processLogs(
    logs: Log[],
    context: IProcessingContext,
    strategy?: string,
    address?: string,
    logService?: string,
  ): Promise<number> {
    let highestBlockNumber = 0

    const parsed: Array<{ log: Log; formatted: IFormattedLog; index: number }> = []
    for (let i = 0; i < logs.length; i++) {
      const formatted = this.formatLog(logs[i])
      if (formatted.event) {
        parsed.push({ log: logs[i], formatted, index: i + 1 })
      } else {
        highestBlockNumber = Math.max(highestBlockNumber, logs[i].blockNumber)
      }
    }

    if (parsed.length === 0) return highestBlockNumber

    // Scope TickContext to logs we actually handle so the timestamp prefetch
    // covers only blocks containing relevant events — not every block the
    // provider returned.
    const tickCtx = new TickContext(
      this.network,
      parsed.map(p => p.log),
    )
    if (this.isRealtimeStrategy(strategy)) {
      await tickCtx.init()
    }

    try {
      const { individualEvents, batchQueues } = this.partitionByBatchSupport(parsed, tickCtx)

      highestBlockNumber = await this.runIndividualHandlers(individualEvents, tickCtx, highestBlockNumber, {
        context,
        strategy,
        address,
        logService,
        totalLogs: logs.length,
      })

      highestBlockNumber = await this.runBatchHandlers(batchQueues, highestBlockNumber)
    } finally {
      tickCtx.clear()
    }

    return highestBlockNumber
  }

  /**
   * Partition parsed events into individual and batch queues.
   * Events with a batchHandler are grouped by handler function reference — if the group
   * exceeds BATCH_THRESHOLD they go to batchQueues, otherwise fall back to individual.
   */
  private partitionByBatchSupport(
    parsed: Array<{ log: Log; formatted: IFormattedLog; index: number }>,
    tickCtx: TickContext,
  ) {
    type ParsedItem = (typeof parsed)[0]
    type BatchQueue = { handler: any; events: Array<{ parsedEvent: any; info: any; log: Log }> }

    const candidates = new Map<(...args: any[]) => any, ParsedItem[]>()
    const individualEvents: ParsedItem[] = []

    for (const item of parsed) {
      if (item.formatted.batchHandler) {
        const key = item.formatted.batchHandler
        if (!candidates.has(key)) candidates.set(key, [])
        candidates.get(key)!.push(item)
      } else {
        individualEvents.push(item)
      }
    }

    const batchQueues = new Map<(...args: any[]) => any, BatchQueue>()

    for (const [key, items] of candidates) {
      if (items.length >= LogProcessingEngine.BATCH_THRESHOLD) {
        batchQueues.set(key, {
          handler: items[0].formatted.batchHandler,
          events: items.map(item => {
            item.formatted.info.context = tickCtx
            return { parsedEvent: item.formatted.event, info: item.formatted.info, log: item.log }
          }),
        })
      } else {
        individualEvents.push(...items)
      }
    }

    return { individualEvents, batchQueues }
  }

  /**
   * Run individual event handlers sequentially.
   */
  private async runIndividualHandlers(
    events: Array<{ log: Log; formatted: IFormattedLog; index: number }>,
    tickCtx: TickContext,
    highestBlockNumber: number,
    meta: { context: IProcessingContext; strategy?: string; address?: string; logService?: string; totalLogs: number },
  ): Promise<number> {
    for (const { log, formatted, index } of events) {
      try {
        const startTime = Date.now()
        const { handler, event, info } = formatted
        info.context = tickCtx

        await handler(event, info, this.onlyHistorical)

        if (log.blockNumber) {
          highestBlockNumber = Math.max(highestBlockNumber, log.blockNumber)
          if (log.blockNumber > this.stats.lastSync) this.stats.lastSync = log.blockNumber
        }

        this.stats.nbSuccess++

        logger.verbose(
          'Processing Event',
          llo({
            network: this.network,
            address: meta.address,
            logService: meta.logService,
            blockNumber: Number(log.blockNumber),
            logsLen: meta.totalLogs,
            logIndex: index,
            event: event.name,
            strategy: meta.strategy,
            fromBlock: meta.context.fromBlock,
            processedTime: Date.now() - startTime,
            toBlock: meta.context.toBlock,
            latestBlock: meta.context.latestBlock,
            transactionHash: log.transactionHash,
          }),
        )
      } catch (error: any) {
        this.stats.nbError++
        this.onError?.(this.errorHandler.toError(error), log)
        if (this.stopOnError) throw error
      }
    }

    return highestBlockNumber
  }

  /**
   * Run batch handlers — one call per handler with all collected events.
   */
  private async runBatchHandlers(
    batchQueues: Map<
      (...args: any[]) => any,
      { handler: any; events: Array<{ parsedEvent: any; info: any; log: Log }> }
    >,
    highestBlockNumber: number,
  ): Promise<number> {
    for (const [, { handler, events }] of batchQueues) {
      const handlerName = handler.name || 'batch'
      try {
        const startTime = Date.now()
        await handler(events)

        for (const { log } of events) {
          if (log.blockNumber) {
            highestBlockNumber = Math.max(highestBlockNumber, log.blockNumber)
            if (log.blockNumber > this.stats.lastSync) this.stats.lastSync = log.blockNumber
          }
          this.stats.nbSuccess++
        }

        logger.verbose(
          'Processing Batch Event',
          llo({ network: this.network, handlerName, count: events.length, processedTime: Date.now() - startTime }),
        )
      } catch (error: any) {
        this.stats.nbError += events.length
        this.onError?.(this.errorHandler.toError(error), events[0]?.log)
        if (this.stopOnError) throw error
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

    const tickCtx = new TickContext(this.network, logs)
    if (this.isRealtimeStrategy(strategy)) {
      await tickCtx.init()
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

          info.context = tickCtx
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
          tickCtx.clear()
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
          tickCtx.clear()
          reject(error)
        }
      })

      // If queue is empty, resolve immediately
      if (queue.length() === 0 && queue.running() === 0) {
        tickCtx.clear()
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
    strategy?: string,
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

    if (eventBatches.size === 0) return highestBlockNumber

    // No eager prefetch for the batch path: each batch handler fetches the
    // timestamps it needs via `context.getBlockTimestamps(uniqueBlocks)` in one
    // batch call, which is then cached on the TickContext for same-tick reuse.
    // Passing `[]` avoids double-fetching blocks the handler wouldn't look up.
    const tickCtx = new TickContext(this.network, [])
    if (this.isRealtimeStrategy(strategy)) {
      await tickCtx.init()
    }

    try {
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
            const eventsArray = chunk.map(item => {
              item.formatted.info.context = tickCtx
              return {
                parsedEvent: item.formatted.event,
                info: item.formatted.info,
              }
            })

            try {
              await handler(eventsArray)

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
                item.formatted.info.context = tickCtx
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
    } finally {
      eventBatches.clear()
      tickCtx.clear()
    }

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
