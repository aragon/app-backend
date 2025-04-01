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
import axios from 'axios'

const llo = logger.logMeta.bind(null, { service: 'modules:EventCrawler' })

class BlockchainLogCrawler {
  private readonly crawlParams: ICrawlParam
  public readonly crawlSetting: ICrawlSetting

  constructor(opts: ICrawlParam) {
    this.crawlParams = {
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
      isOnError: false,
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

    if (this.crawlSetting.isOnError) {
      this.crawlSetting.isOnError = false
    }

    let currentBlock = await Web3Helper.getBlockNumber(this.crawlSetting.filter.fromBlock, this.crawlParams.network)
    const latestBlock = await Web3Helper.getBlockNumber(this.crawlSetting.filter.toBlock, this.crawlParams.network)
    const rawLogs: IFormattedLog[] = []
    let allLogs: Log[] = []

    if (currentBlock === latestBlock) {
      this.crawlSetting.crawling = false
      return rawLogs
    }

    this.crawlParams.strategy = this.getStrategyBySituation(currentBlock, latestBlock)

    let retryCount = 0
    while (await this.updateAndCheckConditions(currentBlock, latestBlock)) {
      this.crawlSetting.runCount++

      if (retryCount >= 1 && this.crawlParams.strategy === ICrawStrategy.getLogs) {
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
              logsLen: 0,
            }),
          )
        } else if (!this.crawlParams.skipLogProcessing) {
          await this.processLogs(sortedLogs, currentBlock, toBlock, latestBlock)
        } else {
          sortedLogs?.map(log => rawLogs.push(this.formatLog(log)))
        }

        if (this.crawlParams.logService) {
          await this.onSaveProgress(toBlock)
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

  /**
   * Get logs based on the selected strategy
   * Strategy can be getLogs, getLogsByBatch, or getLogsByBlockReceipts
   * @param currentBlock
   * @param latestBlock
   */

  async getLogsByStrategy(currentBlock: number, latestBlock: number) {
    switch (this.crawlParams.strategy) {
      case ICrawStrategy.getBlockReceipts:
        return this.getLogsByBlockReceipts(currentBlock, latestBlock)
      case ICrawStrategy.getLogs:
        return this.getLogsWithoutTopics(currentBlock, latestBlock)
      case ICrawStrategy.getLogsByBatch:
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
        let resultLogs = response.filter((resp: any) => !resp.error).flatMap((resp: any) => resp.result)
        if (resultLogs.length > 0) {
          if (this.crawlParams.filterLogs) {
            resultLogs = await this.crawlParams.filterLogs(resultLogs)
          }
          allLogs = allLogs.concat(resultLogs)
        }

        const failedRequests = response.filter((resp: any) => resp.error)
        if (failedRequests.length === 0) {
          this.crawlSetting.nbTotal += allLogs.length
          this.crawlSetting.batchSize = this.crawlSetting.originalBatchSize
          // topics = this.crawlSetting?.filter?.topics // reset topics
          success = true
          break
        }

        const batchSizeErrors = failedRequests.filter((resp: any) => this.isBatchSizeError(resp.error))
        if (batchSizeErrors.length > 0) {
          if (this.crawlSetting.batchSize > 1) {
            this.crawlSetting.batchSize = Math.max(1, Math.floor(this.crawlSetting.batchSize / 3))
            toBlock = this.resizeToBlock(currentBlock, latestBlock)
            // topics = batchSizeErrors.flatMap((resp: any) => resp.topics) // re-try only for the missing topics
          } else {
            const error = batchSizeErrors[0].error
            logger.error('Batch size too small, stopping crawl', llo({ ...this.parseCrawlerInfoLog(), error }))
            this.crawlSetting.shutdown = true
            this.crawlParams.onError(error)
            break
          }
        } else {
          const error = failedRequests[0].error
          await this.handleErrors(error)
          this.crawlSetting.shutdown = true
          break
        }
      } catch (error) {
        await this.handleErrors(error)
        if (this.crawlParams.stopOnError && this.crawlSetting.shutdown) break
      }
    }

    return { logs: allLogs, toBlock }
  }

  getStrategyBySituation(fromBlock: number, toBlock: number) {
    if (this.crawlParams.oneBlockPerTime) {
      if (toBlock - fromBlock <= 5) {
        return ICrawStrategy.getBlockReceipts
      }
    }

    // If we're only processing a single block, use receipts
    if (toBlock - fromBlock === 1) {
      return ICrawStrategy.getBlockReceipts
    }

    // If we're only processing a small range, use getLogs
    // If we're processing a large range, use getLogsByBatch
    // Fewer thresholds for faster block times
    // If the average block time is less than 1 second, use 40

    const avgBlockTimeSec = config.NODES[utils.networkToAragon(this.crawlParams.network)].INTERVAL_BLOCK_TIME
    const blockRange = toBlock - fromBlock + 1

    let timeBasedThreshold: number
    if (avgBlockTimeSec <= 1) {
      timeBasedThreshold = 40
    } else if (avgBlockTimeSec < 5) {
      timeBasedThreshold = 20
    } else {
      timeBasedThreshold = 5
    }

    const mediumRangeThreshold = Math.min(timeBasedThreshold, this.crawlSetting.batchSize / 2)

    if (blockRange <= mediumRangeThreshold) {
      return ICrawStrategy.getLogs
    }

    return ICrawStrategy.getLogsByBatch
  }

  /**
   * Get logs without topic filtering, used for medium ranges
   */
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

  /**
   * Process block receipts, used for small ranges or when explicitly requested
   */
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
      const response: any = await axios.post(url, requests, {
        headers: { 'Content-Type': 'application/json' },
      })

      const validResponses = response.data.filter((resp: any) => !resp.error && resp.result)
      for (const resp of validResponses) {
        const blockReceipts = resp.result
        if (!blockReceipts || blockReceipts.length === 0) continue

        const logs = blockReceipts.map((receipt: any) => receipt.logs).flat()

        const blockLogs = logs.filter((log: any) => topics.includes(log.topics[0]))
        allLogs = allLogs.concat(blockLogs)
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

      const idToTopicMap: Record<string, string> = {}

      const batchRequests = topics.map(topicChunk => {
        const requestId = Math.random().toString(36).substring(2, 15)
        idToTopicMap[requestId] = topicChunk
        return {
          jsonrpc: '2.0',
          id: requestId,
          method: 'eth_getLogs',
          params: [
            {
              fromBlock: `0x${currentBlock.toString(16)}`,
              toBlock: `0x${toBlock.toString(16)}`,
              address: this.crawlParams.address,
              topics: [topicChunk],
            },
          ],
        }
      })

      const response: any = await axios.post(url, batchRequests, {
        headers: { 'Content-Type': 'application/json' },
      })

      return response.data.map((res: any) => ({
        ...res,
        topics: idToTopicMap[res.id],
      }))
    } catch (error: any) {
      logger.error('error executeBatchRequest', { error, topics, currentBlock, toBlock })
      throw error
    }
  }

  async updateAndCheckConditions(currentBlock: number, latestBlock: number): Promise<boolean> {
    return (
      this.crawlSetting.crawling &&
      !this.crawlSetting.isOnError &&
      currentBlock >= 0 &&
      latestBlock > 0 &&
      currentBlock <= latestBlock
    )
  }

  async handleErrors(error: any) {
    if (this.isRateLimited(error)) {
      await utils.wait(1000)
    } else {
      this.crawlSetting.shutdown = true
      this.crawlParams.onError(error)
    }
  }

  async debugLogs(sortedLogs: Log[]): Promise<void> {
    await Promise.all(
      sortedLogs?.map((log: Log) => {
        try {
          const formatLog: IFormattedLog = this.formatLog(log)
          this.crawlSetting.debugLogs.push(formatLog)
        } catch (_) {}
        return log
      }),
    )
  }

  async processLogs(logs: Log[], fromBlock: number, toBlock: number, latestBlock: number): Promise<void> {
    let logIndex = 0
    for (const log of logs) {
      logIndex++
      try {
        const startTIme = Date.now()

        const { handler, event, info } = this.formatLog(log)
        if (!event) {
          throw new Error('Error parse log in blockchainCrawler')
        }

        await handler(event, info, this.crawlParams.onlyHistorical)

        this.crawlSetting.nbSuccess++
        if (log.blockNumber) {
          this.crawlSetting.lastSync = log?.blockNumber
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
          }),
        )
        if (this.crawlParams.logService && log.blockNumber) {
          await this.onSaveProgress(log.blockNumber)
        }
      } catch (error: any) {
        this.crawlParams.onError(error, log)
        this.crawlSetting.nbError++
        if (this.crawlParams.stopOnError) {
          this.crawlSetting.isOnError = true
          break
        }
      }
    }
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
    const days = this.crawlParams.batchSize || 30
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
      const iFace = new Interface(configItem.abi)
      try {
        parsedEvent = Web3Helper.parseLog(log, iFace)
        if (parsedEvent) {
          matchingHandler = configItem.handler
          break
        }
      } catch (_) {
        // skip
      }
    }

    if (!parsedEvent) {
      logger.error('Error parsing log in blockchainCrawler', llo({ ...this.parseCrawlerInfoLog(), log }))
    }

    const info = Web3Helper.parseInfoLog(log, eventSetting!.event, this.crawlParams.network)

    return {
      event: parsedEvent!,
      handler: matchingHandler,
      info,
    }
  }

  isRateLimited(error: any): boolean {
    const messages = ['Your app has exceeded its compute units per second capacity']

    return messages.some(msg => error.message?.includes(msg))
  }

  isBatchSizeError(error: any): boolean {
    const messages = [
      'The query timed out',
      'Response size is larger than 150MB limit',
      'Log response size exceeded',
      'Consider reducing your block range',
    ]

    return messages.some(msg => error.message?.includes(msg))
  }

  parseCrawlerInfoLog() {
    return {
      network: this.crawlParams.network,
      address: this.crawlParams.address,
      logService: this.crawlParams.logService,
    }
  }
}

export default BlockchainLogCrawler
