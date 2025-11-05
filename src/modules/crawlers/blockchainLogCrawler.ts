import logger from '@logger'
import { type Log, type TopicFilter } from 'ethers'
import { type ICrawlParam, type ICrawlSetting, ICrawStrategy, type IFormattedLog } from '@types'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import config from '@config'
import utils from '@helpers/utils'
import ProviderModule from '@modules/provider'
import { retryRequest } from '@helpers/retryRequest'
import Web3Helper from '@helpers/web3'
import { AdaptiveBatchSizeManager } from './adaptiveBatchSizeManager'
import { BatchRequestManager } from './batchRequestManager'
import { CrawlerErrorHandler } from './crawlerErrorHandler'
import { ProgressTracker } from './progressTracker'
import { LogProcessingEngine } from './logProcessingEngine'

const llo = logger.logMeta.bind(null, { service: 'modules:EventCrawler' })

class BlockchainLogCrawler {
  private readonly crawlParams: ICrawlParam
  public crawlSetting: ICrawlSetting
  private readonly adaptiveBatchManager: AdaptiveBatchSizeManager
  private readonly batchRequestManager: BatchRequestManager
  private readonly errorHandler: CrawlerErrorHandler
  private readonly progressTracker?: ProgressTracker
  private readonly logProcessingEngine: LogProcessingEngine

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
      adaptiveConfig: opts.adaptiveConfig,
    }

    this.errorHandler = new CrawlerErrorHandler({
      stopOnError: opts.stopOnError,
    })

    this.batchRequestManager = new BatchRequestManager({
      network: opts.network,
      address: opts.address,
      isTopicObject: opts.isTopicObject,
    })

    // If batchSize is provided (real-time syncing), use it as the initial batch size
    // Otherwise use default config (60 days for historical crawling)
    const adaptiveConfig = opts.batchSize
      ? {
          ...opts.adaptiveConfig,
          initialBatchDays: opts.batchSize,
          // For real-time: allow reducing to 1/10th of provided batchSize
          // e.g., 0.01 days can reduce to 0.001 days (~86 seconds = ~4 blocks for 20s chains)
          // This ensures we can reduce but maintain a safe minimum (at least 2-5 blocks)
          minBatchDays: opts.adaptiveConfig?.minBatchDays ?? Math.max(opts.batchSize / 10, 0.001),
        }
      : opts.adaptiveConfig

    // Always use adaptive batch manager - it's superior to static batch sizing
    this.adaptiveBatchManager = new AdaptiveBatchSizeManager(opts.network, adaptiveConfig)
    const initialBatchSize = this.adaptiveBatchManager.getCurrentBatchSize()

    this.logProcessingEngine = new LogProcessingEngine({
      events: opts.events,
      isTopicObject: opts.isTopicObject || false,
      onlyHistorical: opts.onlyHistorical,
      stopOnError: opts.stopOnError,
      network: opts.network,
      onError: opts.onError,
    })

    if (opts.logService) {
      this.progressTracker = new ProgressTracker({
        network: opts.network,
        service: opts.logService,
        initialBlock: opts.fromBlock || config.NODES[utils.networkToAragon(opts.network)].FROM_BLOCK,
      })
    }

    this.crawlSetting = {
      shutdown: false,
      crawling: false,
      originalBatchSize: this.adaptiveBatchManager.getOriginalBatchSize(),
      batchSize: initialBatchSize,
      runCount: 0,
      debugLogs: [],
      filter: {
        address: opts.address,
        fromBlock: opts.fromBlock || 0,
        toBlock: opts.toBlock || 'latest',
        topics: this.crawlParams.isTopicObject
          ? opts.events[0].topic
          : this.logProcessingEngine.buildTopics(opts.events),
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
        const sortedLogs = this.logProcessingEngine.sortLogs(allLogs)
        let highestBlockProcessed = 0

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

          this.logProcessingEngine.updateTotalCount(sortedLogs.length)

          const context = {
            fromBlock: currentBlock,
            toBlock,
            latestBlock,
          }

          if (parallelConfig.enable) {
            highestBlockProcessed = parallelConfig.useBatch
              ? await this.logProcessingEngine.processLogsParallelBatch(sortedLogs, context, parallelConfig)
              : await this.logProcessingEngine.processLogsParallel(
                  sortedLogs,
                  context,
                  parallelConfig,
                  this.crawlParams.strategy,
                  Array.isArray(this.crawlParams.address)
                    ? this.crawlParams.address.join(',')
                    : this.crawlParams.address,
                  this.crawlParams.logService || undefined,
                )
          } else {
            highestBlockProcessed = await this.logProcessingEngine.processLogs(
              sortedLogs,
              context,
              this.crawlParams.strategy,
              Array.isArray(this.crawlParams.address) ? this.crawlParams.address.join(',') : this.crawlParams.address,
              this.crawlParams.logService || undefined,
            )
          }

          const stats = this.logProcessingEngine.getProcessingStats()
          this.crawlSetting.nbSuccess = stats.nbSuccess
          this.crawlSetting.nbError = stats.nbError
          this.crawlSetting.nbTotal = stats.nbTotal
          this.crawlSetting.lastSync = stats.lastSync
        } else {
          sortedLogs?.map(log => rawLogs.push(this.logProcessingEngine.formatLog(log)))
          if (sortedLogs?.length > 0) {
            highestBlockProcessed = Math.max(...sortedLogs.map(log => Number(log.blockNumber)))
          }
        }

        if (this.crawlParams.logService && !this.crawlParams.skipLogProcessing) {
          const progressBlock = highestBlockProcessed > 0 ? highestBlockProcessed : toBlock
          await this.onSaveProgress(progressBlock)
        }

        if (this.crawlSetting.shutdown) break
        currentBlock = toBlock + 1

        const newBatchSize = this.adaptiveBatchManager.resetForNextRange()
        this.crawlSetting.batchSize = newBatchSize
        logger.verbose(
          'Reset batch size for next range',
          llo({
            ...this.parseCrawlerInfoLog(),
            newBatchSize,
            currentBlock,
            latestBlock,
          }),
        )

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
    if (this.progressTracker) {
      await this.progressTracker.markAsEnded()
    } else {
      const configIndex = await Models.ConfigIndexer.findExistingLog({
        network: this.crawlParams.network,
        service: this.crawlParams.logService,
      })
      if (configIndex) {
        await configIndex.update({ end: true })
      }
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

        const { successfulResponses, failedResponses, batchSizeErrors, rateLimitErrors } =
          this.batchRequestManager.processBatchResponse(response)

        if (failedResponses.length === 0) {
          this.crawlSetting.shutdown = false
          let resultLogs = this.batchRequestManager.extractLogs(successfulResponses)
          if (resultLogs.length > 0) {
            if (this.crawlParams.filterLogs) {
              resultLogs = await this.crawlParams.filterLogs(resultLogs)
            }
            allLogs = allLogs.concat(this.batchRequestManager.formatLogs(resultLogs))
          }

          this.crawlSetting.nbTotal += allLogs.length

          const blocksProcessed = toBlock - currentBlock + 1
          this.adaptiveBatchManager.recordSuccess(allLogs.length, blocksProcessed)

          success = true
          break
        }

        if (batchSizeErrors.length > 0) {
          const newBatchSize = this.adaptiveBatchManager.recordBatchSizeError()
          this.crawlSetting.batchSize = newBatchSize
          toBlock = this.resizeToBlock(currentBlock, latestBlock)

          if (newBatchSize > 1) {
            continue
          }
          const rpcError = batchSizeErrors[0].error
          logger.error('Batch size at minimum, stopping crawl', llo({ ...this.parseCrawlerInfoLog(), error: rpcError }))
          this.crawlSetting.shutdown = true
          this.crawlParams.onError(this.errorHandler.toError(rpcError))
          break
        }

        if (rateLimitErrors.length > 0) {
          await this.handleErrors(rateLimitErrors[0].error)
          continue
        }

        const error = failedResponses[0].error
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

      if (this.crawlParams.isTopicObject) {
        const logs = await retryRequest(async () =>
          coreProvider.getLogs({
            fromBlock: currentBlock,
            toBlock,
            address: this.crawlParams.address,
            topics: this.crawlSetting.filter.topics as any,
          }),
        )

        allLogs = logs
      } else {
        const logs = await retryRequest(async () =>
          coreProvider.getLogs({
            fromBlock: currentBlock,
            toBlock,
            address: this.crawlParams.address,
          }),
        )

        const resultLogs = logs.filter((log: any) => {
          return this.crawlSetting.filter.topics!.includes(log.topics[0])
        })

        allLogs = resultLogs
      }

      if (this.crawlParams.filterLogs && allLogs.length > 0) {
        allLogs = await this.crawlParams.filterLogs(allLogs)
      }
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

    try {
      const requests = this.createBlockReceiptsRequests(currentBlock, toBlock)
      const response = await this.executeBlockReceiptsRequest(requests)

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

  async updateAndCheckConditions(currentBlock: number, latestBlock: number): Promise<boolean> {
    return this.crawlSetting.crawling && currentBlock >= 0 && latestBlock > 0 && currentBlock <= latestBlock
  }

  async handleErrors(error: any) {
    const analysis = this.errorHandler.analyzeError(error)

    if (analysis.shouldRetry && analysis.backoffMs) {
      await utils.wait(analysis.backoffMs)
    } else {
      this.crawlSetting.shutdown = true
      this.crawlParams.onError(this.errorHandler.toError(error))
    }

    this.crawlSetting.nbError++
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
    const context = {
      fromBlock: fromBlock || 0,
      toBlock: toBlock || 0,
      latestBlock: latestBlock || 0,
    }

    const result = await this.logProcessingEngine.processLogs(
      logs,
      context,
      this.crawlParams.strategy,
      Array.isArray(this.crawlParams.address) ? this.crawlParams.address.join(',') : this.crawlParams.address,
      this.crawlParams.logService || undefined,
    )

    const stats = this.logProcessingEngine.getProcessingStats()
    this.crawlSetting.nbSuccess = stats.nbSuccess
    this.crawlSetting.nbError = stats.nbError
    this.crawlSetting.lastSync = stats.lastSync

    return result
  }

  async getServiceStartBlock() {
    if (this.progressTracker) {
      return await this.progressTracker.getStartingBlock()
    }

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
    if (this.progressTracker) {
      await this.progressTracker.saveProgress(blockNumber)
    } else {
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
          await DbTx.safeCommit(session)
        })
      } catch (error) {
        logger.error('Error saving progress', llo({ ...this.parseCrawlerInfoLog(), error }))
      }
    }
  }

  getStrategyBySituation(fromBlock: number, toBlock: number) {
    if (this.crawlParams.oneBlockPerTime) {
      if (toBlock - fromBlock <= config.BLOCKCHAIN_LOG_CRAWLER.ONE_BLOCK_PER_TIME_MIN_THRESHOLD) {
        return ICrawStrategy.getBlockReceipts
      }
    }

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
    return this.logProcessingEngine.sortLogs(logs)
  }

  buildTopics(events: any[]): string[] {
    return this.logProcessingEngine.buildTopics(events)
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
    return this.logProcessingEngine.formatLog(log)
  }

  isRateLimited(error: any): boolean {
    return this.errorHandler.isRateLimited(error)
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

  getProviderUrl() {
    return this.batchRequestManager.getProviderUrl()
  }

  async executeBatchRequest(topics: string[] | TopicFilter, currentBlock: number, toBlock: number) {
    return this.batchRequestManager.executeBatchRequest(topics, currentBlock, toBlock)
  }

  isBatchSizeError(error: any): boolean {
    return this.errorHandler.isBatchSizeError(error)
  }

  createBlockReceiptsRequests(fromBlock: number, toBlock: number): any[] {
    return this.batchRequestManager.createBlockReceiptsRequests(fromBlock, toBlock)
  }

  async executeBlockReceiptsRequest(requests: any[]): Promise<any> {
    return this.batchRequestManager.executeBlockReceiptsRequest(requests)
  }

  getParallelConfig(logCount?: number): {
    enable: boolean
    concurrency: number
    batchSize: number
    useBatch: boolean
  } {
    const parallel = this.crawlParams.parallel

    if (!parallel) {
      return {
        enable: false,
        concurrency: 1,
        batchSize: 1,
        useBatch: false,
      }
    }

    if (typeof parallel === 'boolean') {
      return {
        enable: parallel,
        concurrency: parallel ? 1 : 1,
        batchSize: parallel ? 50 : 1,
        useBatch: false,
      }
    }

    if (typeof parallel === 'object' && parallel !== null) {
      const baseConfig = {
        enable: parallel.enable ?? false,
        concurrency: parallel.concurrency ?? 1,
        batchSize: parallel.batchSize ?? 50,
        useBatch: parallel.useBatch ?? false,
      }

      if (parallel.enable && parallel.autoScale && logCount !== undefined) {
        const adaptive = this.getAdaptiveConfig(logCount)
        return {
          enable: true,
          concurrency: adaptive.concurrency,
          batchSize: adaptive.batchSize,
          useBatch: parallel.useBatch ?? false,
        }
      }

      return baseConfig
    }

    return {
      enable: false,
      concurrency: 1,
      batchSize: 1,
      useBatch: false,
    }
  }

  /**
   * Calculate optimal concurrency and batch size based on log count
   * Scales from 1-50 concurrency based on workload
   */
  private getAdaptiveConfig(logCount: number): { concurrency: number; batchSize: number } {
    if (logCount <= 0) {
      return { concurrency: 1, batchSize: 50 }
    }

    let concurrency: number

    if (logCount <= 1000) {
      concurrency = 2
    } else if (logCount <= 10000) {
      concurrency = 5
    } else if (logCount <= 50000) {
      concurrency = 20
    } else if (logCount <= 100000) {
      concurrency = 30
    } else if (logCount <= 500000) {
      concurrency = 40
    } else {
      concurrency = 50
    }

    let batchSize: number

    if (logCount <= 1000) {
      batchSize = 500
    } else if (logCount <= 10000) {
      batchSize = 2000
    } else if (logCount <= 50000) {
      batchSize = 5000
    } else if (logCount <= 100000) {
      batchSize = 10000
    } else if (logCount <= 500000) {
      batchSize = 15000
    } else {
      batchSize = 25000
    }

    logger.verbose('Adaptive parallel config', llo({ concurrency, batchSize, logCount }))
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
    const context = {
      fromBlock: fromBlock || 0,
      toBlock: toBlock || 0,
      latestBlock: latestBlock || 0,
    }

    const parallelConfig = this.getParallelConfig(logs?.length || 0)
    const result = await this.logProcessingEngine.processLogsParallel(
      logs,
      context,
      parallelConfig,
      this.crawlParams.strategy,
      Array.isArray(this.crawlParams.address) ? this.crawlParams.address.join(',') : this.crawlParams.address,
      this.crawlParams.logService || undefined,
    )

    const stats = this.logProcessingEngine.getProcessingStats()
    this.crawlSetting.nbSuccess = stats.nbSuccess
    this.crawlSetting.nbError = stats.nbError
    this.crawlSetting.lastSync = stats.lastSync

    return result
  }

  async processLogsParallelBatch(
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
    const context = {
      fromBlock: fromBlock || 0,
      toBlock: toBlock || 0,
      latestBlock: latestBlock || 0,
    }
    const parallelConfig = this.getParallelConfig(logs?.length || 0)
    const result = await this.logProcessingEngine.processLogsParallelBatch(logs, context, parallelConfig)

    const stats = this.logProcessingEngine.getProcessingStats()
    this.crawlSetting.nbSuccess = stats.nbSuccess
    this.crawlSetting.nbError = stats.nbError
    this.crawlSetting.lastSync = stats.lastSync

    return result
  }
}

export { BlockchainLogCrawler }
