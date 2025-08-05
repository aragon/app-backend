import logger from '@logger'
import { Interface, type Log, type LogDescription, type TopicFilter } from 'ethers'
import {
  IConnectionType,
  type ICrawlParam,
  type ICrawlSetting,
  ICrawStrategy,
  type IFormattedLog,
  type IIndexerConfig,
  IProviderType,
  type NetworksEnum,
} from '@types'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import config from '@config'
import utils from '@helpers/utils'
import ProviderModule from '@modules/provider'
import { retryRequest } from '@helpers/retryRequest'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import axios from 'axios'
import BottleneckModule from '@modules/bottleneck'
import * as async from 'async'

const llo = logger.logMeta.bind(null, { service: 'modules:EventCrawler' })

class BlockchainLogCrawler {
  private readonly crawlParams: ICrawlParam
  public readonly crawlSetting: ICrawlSetting

  constructor(opts: ICrawlParam) {
    this.crawlParams = {
      parallel: opts.parallel,
      network: opts.network,
      fromBlock: opts.fromBlock,
      toBlock: opts.toBlock,
      address: opts.address,
      events: opts.events,
      strategy: opts.strategy,
      oneBlockPerTime: opts.oneBlockPerTime,
      filterLogs: opts.filterLogs,
      stopOnError: opts.stopOnError,
      logService: opts.logService,
      onlyHistorical: opts.onlyHistorical,
      onError: opts.onError || BlockchainLogCrawler.defaultOnError,
      skipLogProcessing: opts.skipLogProcessing,
      isTopicObject: opts.isTopicObject,
      batchSize: opts.batchSize, // in days
    }
    this.crawlSetting = {
      shutdown: false,
      crawling: false,
      originalBatchSize: this.calculateBatchSize(opts.network),
      batchSize: this.calculateBatchSize(opts.network),
      runCount: 0,
      debugLogs: [],
      filter: {
        address: opts.address,
        fromBlock: opts.fromBlock || 0,
        toBlock: opts.toBlock || 'latest',
        topics: this.buildTopics(opts.events),
      },
      nbSuccess: 0,
      nbError: 0,
      nbTotal: 0,
      lastSync: 0,
    }
  }

  static defaultOnError(error: Error, log?: Log): void {
    logger.error(
      'Error in EventCrawler',
      llo({
        error: error.message,
        logId: log?.transactionHash ?? null,
      }),
    )
  }

  async crawl(): Promise<IFormattedLog[] | undefined> {
    if (this.crawlSetting.crawling) {
      throw new Error('Already crawling')
    }

    this.crawlSetting.crawling = true
    if (this.crawlParams.logService) {
      this.crawlSetting.filter.fromBlock = (await this.getServiceStartBlock()) || this.crawlSetting.filter.fromBlock
    }

    let currentBlock = await Web3Helper.getBlockNumber(this.crawlSetting.filter.fromBlock, this.crawlParams.network)
    let latestBlock = await Web3Helper.getBlockNumber(this.crawlSetting.filter.toBlock, this.crawlParams.network)
    latestBlock = this.getOffsetToBlockNumber(latestBlock)

    const rawLogs: IFormattedLog[] = []
    let allLogs: Log[] = []

    if (currentBlock === latestBlock) {
      this.crawlSetting.crawling = false
      return rawLogs
    }

    logger.verbose(
      'Starting crawling logs',
      llo({
        ...this.parseCrawlerInfoLog(),
        currentBlock,
        latestBlock,
      }),
    )

    this.crawlParams.strategy = this.getStrategyBySituation(currentBlock, latestBlock)

    let retryCount = 0
    while (await this.updateAndCheckConditions(currentBlock, latestBlock)) {
      this.crawlSetting.runCount++

      if (retryCount >= 1 && this.crawlParams.strategy === ICrawStrategy.getLogsWithoutTopics) {
        this.crawlParams.strategy = ICrawStrategy.getLogsByBatch
      }

      try {
        const result: any = await this.getLogsByStrategy(currentBlock, latestBlock)

        const toBlock = result.toBlock
        allLogs = result.logs

        if (this.crawlSetting.shutdown) break

        this.crawlSetting.nbTotal += allLogs.length
        const sortedLogs = this.sortLogs(allLogs)

        if (sortedLogs.length === 0) {
          logger.verbose(
            'Processing log',
            llo({
              ...this.parseCrawlerInfoLog(),
              blockNumber: toBlock,
              fromBlock: currentBlock,
              strategy: this.crawlParams.strategy,
              toBlock,
              latestBlock,
            }),
          )
        } else if (!this.crawlParams.skipLogProcessing) {
          const parallelConfig = this.getParallelConfig(sortedLogs.length)
          let highestBlockProcessed = 0

          if (parallelConfig.enable) {
            highestBlockProcessed = await this.processLogsParallel(sortedLogs, {
              fromBlock: currentBlock,
              toBlock,
              latestBlock,
            })
          } else {
            highestBlockProcessed = await this.processLogs(sortedLogs, {
              fromBlock: currentBlock,
              toBlock,
              latestBlock,
            })
          }

          // Save progress once after processing (both parallel and sequential)
          // Use the highest block actually processed, or toBlock if no logs were processed
          if (this.crawlParams.logService) {
            const progressBlock = highestBlockProcessed > 0 ? highestBlockProcessed : toBlock
            await this.onSaveProgress(progressBlock)
          }
        } else {
          sortedLogs?.map(log => rawLogs.push(this.formatLog(log)))
        }
        if (this.crawlSetting.shutdown) break
        currentBlock = toBlock + 1
        if (currentBlock >= latestBlock) break
      } catch (error) {
        retryCount++
        await this.handleErrors(error)
        if (this.crawlParams.stopOnError && this.crawlSetting.shutdown) break
      }
    }

    if (this.crawlParams.skipLogProcessing) {
      return rawLogs
    }

    this.crawlSetting.crawling = false
    if (!this.crawlParams.filterLogs) {
      logger.verbose('Finished crawling logs', llo({ ...this.parseCrawlerInfoLog() }))
    }
  }

  async end() {
    const configIndex = await Models.ConfigIndexer.findExistingLog({
      network: this.crawlParams.network,
      service: this.crawlParams.logService,
    })
    if (configIndex) {
      await configIndex.update({ end: true })
    }
  }

  async getLogsByStrategy(currentBlock: number, latestBlock: number) {
    switch (this.crawlParams.strategy) {
      case ICrawStrategy.getBlockReceipts:
        return this.getLogsByBlockReceipts(currentBlock, latestBlock)
      case ICrawStrategy.getLogsWithoutTopics:
        return this.getLogsWithoutTopics(currentBlock, latestBlock)
      case ICrawStrategy.getLogsByBatch:
        return this.getLogsByBatch(currentBlock, latestBlock)
      default:
        return this.getLogsByBatch(currentBlock, latestBlock)
    }
  }

  async getLogsByBatch(currentBlock: number, latestBlock: number) {
    const topics = this.crawlSetting?.filter?.topics
    let toBlock = this.calculateToBlock(currentBlock, latestBlock)
    let success = false
    let allLogs: Log[] = []

    while (!success) {
      try {
        const response = await this.executeBatchRequest(topics!, currentBlock, toBlock)
        const failedRequests = response.filter((resp: any) => resp.error)

        if (failedRequests.length === 0) {
          this.crawlSetting.shutdown = false
          let resultLogs = response.flatMap((resp: any) => resp.result)
          if (resultLogs.length > 0) {
            if (this.crawlParams.filterLogs) {
              resultLogs = await this.crawlParams.filterLogs(resultLogs)
            }
            allLogs = allLogs.concat(resultLogs).map((log: any) => ({
              ...log,
              blockNumber: Number(log.blockNumber),
              transactionIndex: Number(log.transactionIndex),
              index: Number(log.logIndex),
            }))
          }

          this.crawlSetting.nbTotal += allLogs.length
          if (this.crawlSetting.runCount <= 2) {
            this.crawlSetting.batchSize = this.crawlSetting.originalBatchSize
          }
          success = true
          break
        }

        const batchSizeErrors = failedRequests.filter((resp: any) => this.isBatchSizeError(resp.error))
        const rateLimitErrors = failedRequests.filter((resp: any) => this.isRateLimited(resp.error))

        if (batchSizeErrors.length > 0) {
          if (this.crawlSetting.batchSize > 1) {
            this.crawlSetting.batchSize = Math.max(1, Math.floor(this.crawlSetting.batchSize / 3))
            toBlock = this.resizeToBlock(currentBlock, latestBlock)
            continue
          }
          const error = batchSizeErrors[0].error
          logger.error('Batch size too small, stopping crawl', llo({ ...this.parseCrawlerInfoLog(), error }))
          this.crawlSetting.shutdown = true
          this.crawlParams.onError(error)
          break
        }

        if (rateLimitErrors.length > 0) {
          await this.handleErrors(rateLimitErrors[0].error)
          continue
        }

        const error = failedRequests[0].error
        await this.handleErrors(error)
        this.crawlSetting.shutdown = true
        break
      } catch (error) {
        await this.handleErrors(error)
        this.crawlSetting.shutdown = true
        break
      }
    }

    return { logs: allLogs, toBlock }
  }

  async getLogsWithoutTopics(currentBlock: number, latestBlock: number) {
    const toBlock = Math.min(currentBlock + this.crawlSetting.batchSize, latestBlock)
    let allLogs: Log[] = []

    try {
      const coreProvider = await ProviderModule.getAnyRpcProvider(this.crawlParams.network)

      const logs = await retryRequest(async () =>
        coreProvider.getLogs({
          fromBlock: currentBlock,
          toBlock,
          address: this.crawlParams.address,
        }),
      )

      let resultLogs = logs.filter((log: any) => {
        return this.crawlSetting.filter.topics!.includes(log.topics[0])
      })

      if (this.crawlParams.filterLogs && resultLogs.length > 0) {
        resultLogs = await this.crawlParams.filterLogs(resultLogs)
      }

      allLogs = resultLogs
    } catch (error: any) {
      if (this.isBatchSizeError(error)) {
        logger.warn(
          'Batch size error in getLogs, will switch to batch strategy',
          llo({
            fromBlock: currentBlock,
            toBlock,
            error: error.message,
          }),
        )
      }

      throw error
    }

    return { logs: allLogs, toBlock }
  }

  async getLogsByBlockReceipts(currentBlock: number, endBlock?: number) {
    const topics = this.crawlSetting?.filter?.topics!
    const toBlock = endBlock || currentBlock
    let allLogs: Log[] = []

    const url = await this.getProviderUrl()

    const requests: any = []
    for (let blockNum = currentBlock; blockNum <= toBlock; blockNum++) {
      const blockHex = `0x${blockNum.toString(16)}`
      requests.push({
        jsonrpc: '2.0',
        id: `block-${blockNum}`,
        method: 'eth_getBlockReceipts',
        params: [blockHex],
      })
    }

    try {
      const response = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(this.crawlParams.network).schedule(async () =>
          axios.post(url, requests, {
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      )

      const validResponses = response.data.filter((resp: any) => !resp.error && resp.result)
      if (validResponses.length === response.data.length) {
        for (const resp of validResponses) {
          const blockReceipts = resp.result
          if (!blockReceipts || blockReceipts.length === 0) continue

          const logs = blockReceipts.map((receipt: any) => receipt.logs).flat()

          const blockLogs = logs.filter((log: any) => topics.includes(log.topics[0]))
          allLogs = allLogs.concat(blockLogs).map((log: any) => ({
            ...log,
            blockNumber: Number(log.blockNumber),
            transactionIndex: Number(log.transactionIndex),
            index: Number(log.logIndex),
          }))
        }
      } else {
        this.crawlSetting.shutdown = true
      }
    } catch (batchError: any) {
      logger.warn('Batch request failed, falling back to individual requests', {
        error: batchError.message,
        currentBlock,
        toBlock,
      })
      this.crawlSetting.shutdown = true
      this.crawlParams.onError(batchError)
    }

    if (this.crawlParams.filterLogs) {
      allLogs = await this.crawlParams.filterLogs(allLogs)
    }

    return { logs: allLogs, toBlock }
  }

  async getProviderUrl() {
    const provider = await ProviderModule.getAnyRpcProvider(this.crawlParams.network)
    if (provider.config?.getProvider) {
      const coreProvider = await provider.config.getProvider()
      return coreProvider.connection.url
    }

    return config.NODES[utils.networkToAragon(this.crawlParams.network)].ARAGON_RPC
  }

  async executeBatchRequest(topics: string[] | TopicFilter, currentBlock: number, toBlock: number) {
    try {
      const url = await this.getProviderUrl()

      const topicChunk = this.crawlParams.isTopicObject ? topics : utils.chunkArray(topics, 4)
      const batchRequests = topicChunk.reduce((req: any, chunk: string[]) => {
        const requestId = Math.random().toString(36).substring(2, 15)
        req.push({
          jsonrpc: '2.0',
          id: requestId,
          method: 'eth_getLogs',
          params: [
            {
              fromBlock: `0x${currentBlock.toString(16)}`,
              toBlock: `0x${toBlock.toString(16)}`,
              address: this.crawlParams.address,
              topics: [chunk],
            },
          ],
        })
        return req
      }, [])

      const response = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(this.crawlParams.network).schedule(async () =>
          axios.post(url, batchRequests, {
            headers: { 'Content-Type': 'application/json' },
          }),
        ),
      )

      return response.data
    } catch (error: any) {
      if (this.isBatchSizeError(error)) {
        return [{ error }]
      }
      logger.error('error executeBatchRequest', { error, topics, currentBlock, toBlock })
      throw error
    }
  }

  async updateAndCheckConditions(currentBlock: number, latestBlock: number): Promise<boolean> {
    return this.crawlSetting.crawling && currentBlock >= 0 && latestBlock > 0 && currentBlock <= latestBlock
  }

  async handleErrors(error: any) {
    if (this.isRateLimited(error)) {
      const backoffTime = Math.min(500 * (this.crawlSetting.runCount || 1), 10000)
      await utils.wait(backoffTime)
    } else {
      this.crawlSetting.shutdown = true
      this.crawlParams.onError(error)
    }
  }

  async processLogs(
    logs: Log[],
    {
      fromBlock,
      toBlock,
      latestBlock,
    }: {
      fromBlock?: number
      toBlock?: number
      latestBlock?: number
    } = {},
  ): Promise<number> {
    let logIndex = 0
    let highestBlockNumber = 0

    for (const log of logs) {
      logIndex++
      try {
        const startTIme = Date.now()

        const { handler, event, info } = this.formatLog(log)
        if (!event) {
          continue
        }

        await handler(event, info, this.crawlParams.onlyHistorical)

        this.crawlSetting.nbSuccess++
        if (log.blockNumber) {
          // Track the highest block number processed
          highestBlockNumber = Math.max(highestBlockNumber, log.blockNumber)
          // Update lastSync only if this is a higher block number
          if (log.blockNumber > this.crawlSetting.lastSync) {
            this.crawlSetting.lastSync = log.blockNumber
          }
        }
        logger.verbose(
          'Processing Event',
          llo({
            ...this.parseCrawlerInfoLog(),
            blockNumber: Number(log.blockNumber),
            logsLen: logs.length,
            logIndex,
            event: event.name,
            strategy: this.crawlParams.strategy,
            fromBlock,
            processedTime: Date.now() - startTIme,
            toBlock,
            latestBlock,
            transactionHash: log.transactionHash,
          }),
        )
        // Progress is saved after processing the entire batch, not for each log
      } catch (error: any) {
        this.crawlParams.onError(error, log)
        this.crawlSetting.nbError++
        if (this.crawlParams.stopOnError) {
          this.crawlSetting.shutdown = true
          break
        }
      }
    }

    return highestBlockNumber
  }

  async getProvider(): Promise<any> {
    const provider = ProviderModule.getProvider(this.crawlParams.network, IProviderType.ALCHEMY, IConnectionType.RPC)
    return await provider.config.getProvider()
  }

  async getServiceStartBlock() {
    const existingConfig = await Models.ConfigIndexer.findExistingLog({
      network: this.crawlParams.network,
      service: this.crawlParams.logService!,
    })

    if (!existingConfig && (this.crawlSetting.filter?.fromBlock as number) > 0) {
      return this.crawlSetting.filter.fromBlock
    } else if (existingConfig) {
      return existingConfig.lastSync
    } else {
      return config.NODES[utils.networkToAragon(this.crawlParams.network)].FROM_BLOCK
    }
  }

  async onSaveProgress(blockNumber: number) {
    try {
      await DbTx.executeTxFn(async ({ session }) => {
        const existingConfig = await Models.ConfigIndexer.findExistingLog(
          {
            network: this.crawlParams.network,
            service: this.crawlParams.logService!,
          },
          { session },
        )

        if (existingConfig) {
          await existingConfig.update({ lastSync: blockNumber }, { session })
        } else {
          await Models.ConfigIndexer.create(
            {
              network: this.crawlParams.network,
              service: this.crawlParams.logService!,
              lastSync: blockNumber,
            },
            { session },
          )
        }
        await session.commitTransaction()
        await session.endSession()
      })
    } catch (error) {
      logger.error('Error saving progress', llo({ ...this.parseCrawlerInfoLog(), error }))
    }
  }

  // If we're only processing a small range, use getLogsByBatch without topics
  // If we're processing a large range, use getLogsByBatch without topics
  // Fewer thresholds for faster block times
  // If the average block time is less than 1 second, use 40
  getStrategyBySituation(fromBlock: number, toBlock: number) {
    if (this.crawlParams.oneBlockPerTime) {
      if (toBlock - fromBlock <= config.BLOCKCHAIN_LOG_CRAWLER.ONE_BLOCK_PER_TIME_MIN_THRESHOLD) {
        return ICrawStrategy.getBlockReceipts
      }
    }

    // If we're only processing a single block, use receipts
    if (toBlock - fromBlock === 1) {
      return ICrawStrategy.getBlockReceipts
    }

    const avgBlockTimeSec = config.NODES[utils.networkToAragon(this.crawlParams.network)].INTERVAL_BLOCK_TIME
    const blockRange = toBlock - fromBlock + 1

    let timeBasedThreshold: number
    if (avgBlockTimeSec <= 1) {
      timeBasedThreshold = config.BLOCKCHAIN_LOG_CRAWLER.BLOCK_HIGH_RANGE
    } else if (avgBlockTimeSec < 5) {
      timeBasedThreshold = config.BLOCKCHAIN_LOG_CRAWLER.BLOCK_MEDIUM_RANGE
    } else {
      timeBasedThreshold = config.BLOCKCHAIN_LOG_CRAWLER.BLOCK_LOW_RANGE
    }

    const mediumRangeThreshold = Math.min(timeBasedThreshold, this.crawlSetting.batchSize / 2)

    if (blockRange <= mediumRangeThreshold) {
      return ICrawStrategy.getLogsWithoutTopics
    }

    return ICrawStrategy.getLogsByBatch
  }

  sortLogs(logs: Log[]): Log[] {
    return logs.sort((a, b) => {
      // First, sort by blockNumber in ascending order
      if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber
      // If blockNumbers are the same, sort by transactionIndex in ascending order
      if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex
      // If both blockNumber and transactionIndex are the same, sort by index in ascending order
      return a.index - b.index
    })
  }

  buildTopics(events: any[]): string[] {
    return events
      .map(item => {
        if (!item?.topic) {
          logger.error(`Topic hash not found for event ${item?.event}`, llo({ ...this.parseCrawlerInfoLog(), item }))
          return null
        }
        return item.topic
      })
      .filter(Boolean) as string[]
  }

  calculateBatchSize(network: NetworksEnum): number {
    // Constants for seconds in a 30-day month
    const days = this.crawlParams.batchSize || config.BLOCKCHAIN_LOG_CRAWLER.DEFAULT_BATCH_SIZE
    const SECONDS_IN_MONTH = days * 24 * 3600

    // Get the block interval time from the config
    const blockIntervalTime = config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME

    // Error handling in case blockIntervalTime is undefined or falsy
    if (blockIntervalTime === undefined) {
      throw new Error(`Block interval time not found for network: ${network}`)
    }

    // Calculate the batch size
    return Math.floor(SECONDS_IN_MONTH / blockIntervalTime)
  }

  resizeToBlock(currentBlock: number, latestBlock: number): number {
    return Math.min(currentBlock + this.crawlSetting.batchSize - (this.crawlSetting.runCount > 1 ? 1 : 0), latestBlock)
  }

  calculateToBlock(currentBlock: number, latestBlock: number): number {
    const minBlock = Math.min(
      currentBlock + this.crawlSetting.batchSize - (this.crawlSetting.runCount > 1 ? 1 : 0),
      latestBlock,
    )

    if (this.crawlParams.oneBlockPerTime && latestBlock - currentBlock > 10) {
      return minBlock
    }

    if (this.crawlParams.oneBlockPerTime || this.crawlParams.strategy === ICrawStrategy.getBlockReceipts) {
      return currentBlock
    }

    return minBlock
  }

  formatLog(log: Log): IFormattedLog {
    const eventSetting: IIndexerConfig | undefined = this.crawlParams.events.find(item => {
      if (typeof item.topic === 'string') {
        return item.topic === log.topics[0]
      }
      if (Array.isArray(item.topic)) {
        return item.topic.includes(log.topics[0])
      }
      return false
    })

    if (!eventSetting) {
      logger.error('Error event setting not found in blockchainCrawler', llo({ ...this.parseCrawlerInfoLog() }))
    }

    let parsedEvent: LogDescription | null = null
    let matchingHandler: any = null

    for (const configItem of eventSetting?.config!) {
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
        // skip
      }
    }

    if (!parsedEvent && eventSetting?.config.length) {
      logger.error('Error parsing log in blockchainCrawler', llo({ ...this.parseCrawlerInfoLog(), log }))
    }

    const info = Web3Utils.parseInfoLog(log, eventSetting!.event, this.crawlParams.network)

    return {
      event: parsedEvent!,
      handler: matchingHandler,
      info,
    }
  }

  isRateLimited(error: any): boolean {
    const messages = [
      'Your app has exceeded its compute units per second capacity',
      'Too many requests, reason: call rate limit exhausted',
    ]

    return messages.some(msg => error.message?.includes(msg))
  }

  isBatchSizeError(error: any): boolean {
    const messages = [
      'The query timed out',
      'timeout',
      'eth_getLogs is limited',
      'Response size is larger than 150MB limit',
      'Log response size exceeded',
      'Consider reducing your block range',
      'Query returned more than 1000000 results',
      'Cannot create a string longer',
    ]

    return messages.some(msg => error.message?.includes(msg))
  }

  getOffsetToBlockNumber(blockNumber: number): number {
    if (!this.crawlParams.filterLogs) return blockNumber
    const networkName = utils.networkToAragon(this.crawlParams.network)
    const offset = networkName ? config.NODES[networkName]?.OFFSET_TO_BLOCK : 0
    return blockNumber - offset
  }

  parseCrawlerInfoLog() {
    return {
      network: this.crawlParams.network,
      address: this.crawlParams.address,
      logService: this.crawlParams.logService,
    }
  }

  getParallelConfig(logCount?: number): { enable: boolean; concurrency: number; batchSize: number } {
    const parallel = this.crawlParams.parallel

    // Default disabled config
    if (!parallel) {
      return {
        enable: false,
        concurrency: 1,
        batchSize: 1,
      }
    }

    // Boolean config - always use defaults (1, 50)
    if (typeof parallel === 'boolean') {
      return {
        enable: parallel,
        concurrency: parallel ? 1 : 1,
        batchSize: parallel ? 50 : 1,
      }
    }

    // Object config
    if (typeof parallel === 'object' && parallel !== null) {
      const baseConfig = {
        enable: parallel.enable ?? false,
        concurrency: parallel.concurrency ?? 1, // Default concurrency is 1
        batchSize: parallel.batchSize ?? 50, // Default batch size is 50
      }

      // If autoScale is enabled and we have a log count, calculate adaptive values
      if (parallel.enable && parallel.autoScale && logCount !== undefined) {
        const adaptive = this.getAdaptiveConfig(logCount)
        return {
          enable: true,
          concurrency: adaptive.concurrency,
          batchSize: adaptive.batchSize,
        }
      }

      return baseConfig
    }

    // Fallback
    return {
      enable: false,
      concurrency: 1,
      batchSize: 1,
    }
  }

  /**
   * Calculate optimal concurrency and batch size based on log count
   * Scales from 1-50 concurrency based on workload
   */
  private getAdaptiveConfig(logCount: number): { concurrency: number; batchSize: number } {
    // Handle edge cases
    if (logCount <= 0) {
      return { concurrency: 1, batchSize: 50 }
    }

    // Calculate concurrency: scales from 1 to 50 based on log count
    // Using a logarithmic scale for smoother scaling
    let concurrency: number

    if (logCount <= 100) {
      concurrency = 1 // Minimal concurrency for very small batches
    } else if (logCount <= 1000) {
      concurrency = Math.ceil(logCount / 100) // 1-10 for small batches
    } else if (logCount <= 10000) {
      concurrency = Math.ceil(10 + (logCount - 1000) / 450) // 10-30 for medium batches
    } else if (logCount <= 100000) {
      concurrency = Math.ceil(30 + (logCount - 10000) / 4500) // 30-50 for large batches
    } else {
      // For very large batches, cap at 50 but scale down if extremely large
      concurrency = logCount > 400000 ? 40 : 50
    }

    // Calculate batch size: larger batches for larger workloads
    let batchSize: number

    if (logCount <= 1000) {
      batchSize = 50 // Default for small workloads
    } else if (logCount <= 10000) {
      batchSize = 100 // Moderate batch size
    } else if (logCount <= 50000) {
      batchSize = 200 // Large batch size
    } else {
      batchSize = 500 // Very large batch size for massive workloads
    }

    logger.verbose('Adaptive parallel config', llo({ concurrency, batchSize }))
    return { concurrency, batchSize }
  }

  async processLogsParallel(
    logs: Log[],
    {
      fromBlock,
      toBlock,
      latestBlock,
    }: {
      fromBlock?: number
      toBlock?: number
      latestBlock?: number
    } = {},
  ): Promise<number> {
    // Safety check: if no logs, return immediately
    if (!logs || logs.length === 0) {
      return 0
    }

    // Get parallel config with log count for auto-scaling
    const parallelConfig = this.getParallelConfig(logs.length)

    // Track processed logs to prevent duplicates
    const processedLogs = new Set<string>()
    let processedCount = 0
    const totalLogs = logs.length
    let highestBlockNumber = 0

    // Create promise to track completion
    return new Promise<number>((resolve, reject) => {
      // Create a queue for parallel processing with fixed concurrency
      const queue = async.queue<{ log: Log; index: number }>(async task => {
        const { log, index } = task

        // Create unique key using blockNumber, transactionHash, transactionIndex, and logIndex
        // This ensures uniqueness even when multiple events from same address in same tx
        const logKey = `${log.blockNumber}-${log.transactionHash}-${log.transactionIndex}-${log.index}`

        // Double-check to prevent duplicate processing
        if (processedLogs.has(logKey)) {
          processedCount++
          return
        }
        processedLogs.add(logKey)

        const startTime = Date.now()

        try {
          const { handler, event, info } = this.formatLog(log)
          if (!event) {
            processedCount++
            return
          }

          await handler(event, info, this.crawlParams.onlyHistorical)

          this.crawlSetting.nbSuccess++
          if (log.blockNumber) {
            // Track the highest block number processed
            highestBlockNumber = Math.max(highestBlockNumber, log.blockNumber)
            // Update lastSync only if this is a higher block number to avoid out-of-order updates
            if (log.blockNumber > this.crawlSetting.lastSync) {
              this.crawlSetting.lastSync = log.blockNumber
            }
          }

          logger.verbose(
            'Processing Event (Parallel)',
            llo({
              ...this.parseCrawlerInfoLog(),
              blockNumber: Number(log.blockNumber),
              logsLen: totalLogs,
              logIndex: index + 1,
              processedCount: processedCount + 1,
              event: event.name,
              strategy: this.crawlParams.strategy,
              fromBlock,
              processedTime: Date.now() - startTime,
              toBlock,
              latestBlock,
              transactionHash: log.transactionHash,
              parallel: true,
              concurrency: parallelConfig.concurrency,
            }),
          )

          // Don't save progress for each log in parallel mode to avoid write conflicts
          // Progress will be saved once after all logs are processed

          processedCount++
        } catch (error: any) {
          processedCount++
          this.crawlParams.onError(error, log)
          this.crawlSetting.nbError++

          if (this.crawlParams.stopOnError) {
            this.crawlSetting.shutdown = true
            queue.kill()
            reject(error)
          }
        }
      }, parallelConfig.concurrency)

      // Set up completion handler
      queue.drain(() => {
        // Verify all logs were processed
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
            transactionHash: task.log.transactionHash,
            logIndex: task.index,
            ...this.parseCrawlerInfoLog(),
          }),
        )
        if (this.crawlParams.stopOnError) {
          this.crawlSetting.shutdown = true
          queue.kill()
          reject(error)
        }
      })

      // Add all logs to the queue at once to prevent loops
      // Each log is added exactly once with its index
      const tasks = logs.map((log, index) => ({ log, index }))

      // Push tasks in batches to avoid memory spikes
      const { batchSize } = parallelConfig
      for (let i = 0; i < tasks.length; i += batchSize) {
        const batch = tasks.slice(i, Math.min(i + batchSize, tasks.length))
        queue.push(batch)

        // If shutdown is triggered, stop adding more tasks
        if (this.crawlSetting.shutdown) {
          break
        }
      }

      // If queue is empty (shouldn't happen), resolve immediately
      if (queue.length() === 0 && queue.running() === 0) {
        resolve(highestBlockNumber)
      }
    })
  }
}

export default BlockchainLogCrawler
