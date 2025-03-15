import logger from '@logger'
import { Interface, type Log, type LogDescription } from 'ethers'
import {
  IConnectionType,
  type ICrawlParam,
  type ICrawlSetting,
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
      stopOnError: opts.stopOnError,
      logService: opts.logService,
      onlyHistorical: opts.onlyHistorical,
      onError: opts.onError || BlockchainLogCrawler.defaultOnError,
      skipLogProcessing: opts.skipLogProcessing,
      isCustomTopics: opts.isCustomTopics,
    }

    const topics = opts.events
      .map(item => {
        if (!item?.topic) {
          logger.error(`Topic hash not found for event ${item.event}`, llo({ ...this.parseCrawlerInfoLog(), item }))
          return null
        }
        return item.topic
      })
      .filter(Boolean) as string[]

    this.crawlSetting = {
      shutdown: false,
      crawling: false,
      isOnError: false,
      originalBatchSize: this.calculateBatchSize(opts.network),
      batchSize: this.calculateBatchSize(opts.network),
      runCount: 0,
      filter: {
        address: opts.address,
        fromBlock: opts.fromBlock || 0,
        toBlock: opts.toBlock || 'latest',
        topics: [topics],
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

  calculateBatchSize(network: NetworksEnum): number {
    // Constants for seconds in a 30-day month
    const days = 120
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

  async updateAndCheckConditions(currentBlock: number, latestBlock: number): Promise<boolean> {
    return (
      this.crawlSetting.crawling &&
      !this.crawlSetting.isOnError &&
      currentBlock >= 0 &&
      latestBlock > 0 &&
      currentBlock <= latestBlock
    )
  }

  getTopics(): any {
    let topicChunks: any = []

    if (!this.crawlParams.isCustomTopics) {
      topicChunks = utils.chunkArray(this.crawlSetting.filter.topics, 4)
    } else {
      topicChunks = this.crawlSetting?.filter?.topics?.[0]
    }

    return topicChunks
  }

  async getLogsByBatch(topicChunks: string[], currentBlock: number, toBlock: number) {
    try {
      const coreProvider = await ProviderModule.getAnyRpcProvider(this.crawlParams.network)

      const batchRequests = topicChunks.map((topics: any) =>
        coreProvider.send('eth_getLogs', [
          {
            fromBlock: `0x${currentBlock.toString(16)}`,
            toBlock: `0x${toBlock.toString(16)}`,
            topics,
            address: this.crawlParams.address,
          },
        ]),
      )

      return await retryRequest(async () => Promise.all(batchRequests))
    } catch (e: any) {
      throw e
    }
  }

  async crawl(): Promise<IFormattedLog[] | undefined> {
    if (this.crawlSetting.crawling) {
      throw new Error('Already crawling')
    }

    this.crawlSetting.crawling = true

    if (this.crawlParams.logService) {
      this.crawlSetting.filter.fromBlock = (await this.getServiceStartBlock()) || this.crawlSetting.filter.fromBlock
    }

    let currentBlock = await Web3Helper.getBlockNumber(
      this.crawlSetting.filter.fromBlock as any,
      this.crawlParams.network,
    )
    const latestBlock = await Web3Helper.getBlockNumber(
      this.crawlSetting.filter.toBlock as any,
      this.crawlParams.network,
    )

    const rawLogs: any = []

    while (await this.updateAndCheckConditions(currentBlock, latestBlock)) {
      this.crawlSetting.runCount++
      let toBlock = Math.min(
        currentBlock + this.crawlSetting.batchSize - (this.crawlSetting.runCount > 1 ? 1 : 0),
        latestBlock,
      )

      const topicChunks = this.getTopics()
      const allLogs: Log[] = []
      let success = false

      while (!success) {
        try {
          const logs = await this.getLogsByBatch(topicChunks, currentBlock, toBlock)

          allLogs.push(...logs.flat())
          this.crawlSetting.nbTotal += logs.length
          this.crawlSetting.batchSize = this.crawlSetting.originalBatchSize
          success = true
          break
        } catch (error: any) {
          if (this.isBatchSizeError(error)) {
            if (this.crawlSetting.batchSize > 1) {
              this.crawlSetting.batchSize = Math.max(1, Math.floor(this.crawlSetting.batchSize / 2))
              toBlock = Math.min(
                currentBlock + this.crawlSetting.batchSize - (this.crawlSetting.runCount > 1 ? 1 : 0),
                latestBlock,
              )
            } else {
              logger.error('Batch size too small, stopping crawl', llo({ ...this.parseCrawlerInfoLog(), error }))
              this.crawlSetting.shutdown = true
              this.crawlParams.onError(error)
              break
            }
          } else {
            await this.handleErrors(error)
            if (this.crawlParams.stopOnError && this.crawlSetting.shutdown) break
          }
        }
      }

      if (this.crawlSetting.shutdown) break

      const sortedLogs = allLogs.sort((a, b) => {
        // First, sort by blockNumber in ascending order
        if (a.blockNumber !== b.blockNumber) return a.blockNumber - b.blockNumber
        // If blockNumbers are the same, sort by transactionIndex in ascending order
        if (a.transactionIndex !== b.transactionIndex) return a.transactionIndex - b.transactionIndex
        // If both blockNumber and transactionIndex are the same, sort by index in ascending order
        return a.index - b.index
      })

      if (!this.crawlParams.skipLogProcessing) {
        await this.processLogs(sortedLogs)
      } else {
        await Promise.all(
          sortedLogs?.map(log => {
            try {
              const formatLog = this.formatLog(log)
              rawLogs.push(formatLog)
            } catch (_) {}
            return log
          }),
        )
      }

      if (this.crawlParams.logService) {
        await this.onSaveProgress(toBlock)
      }
      if (this.crawlSetting.shutdown) break
      currentBlock = toBlock + 1
      if (currentBlock >= latestBlock) break
    }

    if (this.crawlParams.skipLogProcessing) {
      return rawLogs
    }

    this.crawlSetting.crawling = false
    logger.verbose('Finished crawling logs', llo({ ...this.parseCrawlerInfoLog() }))
  }

  async handleErrors(error: any) {
    if (this.isRateLimited(error)) {
      await utils.wait(1000)
    } else {
      this.crawlSetting.shutdown = true
      this.crawlParams.onError(error)
    }
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

  async processLogs(logs: Log[]): Promise<void> {
    let logIndex = 0
    for (const log of logs) {
      logIndex++
      try {
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
          'Processing log',
          llo({ ...this.parseCrawlerInfoLog(), blockNumber: Number(log.blockNumber), logsLen: logs.length, logIndex }),
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

  parseCrawlerInfoLog() {
    return {
      network: this.crawlParams.network,
      address: this.crawlParams.address,
      logService: this.crawlParams.logService,
    }
  }
}

export default BlockchainLogCrawler
