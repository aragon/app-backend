import logger from '@logger'
import { type Filter, type Log, type WebSocketProvider } from 'ethers'
import { ConfigState } from '@state/configState'
import { NetworksEnum } from '@types'
import Utils from '@helpers/utils'
import Bottleneck from 'bottleneck'

const llo = logger.logMeta.bind(null, { service: 'modules:BlockchainLogCrawler' })

const limiter = new Bottleneck({
  maxConcurrent: 10, // Maximum number of concurrent requests
  minTime: 200, // Minimum time (ms) between requests
})

class BlockchainLogCrawler {
  private readonly fromBlock: number | string
  private readonly toBlock: number | string
  private readonly provider: WebSocketProvider
  private readonly onLog: (log: Log) => Promise<void>
  private readonly onError: (error: any, log?: Log) => void
  private readonly filter: Filter
  private readonly stopOnError: boolean
  private batchSize: number
  private crawling: boolean
  private isOnError: boolean
  private shutdown: boolean
  public readonly crawlResult: {
    nbSuccess: number
    nbError: number
    nbTotal: number
    lastBlockSync: number
    latestBlockNumber: number
  }

  constructor(opts: {
    network: NetworksEnum
    filter: Filter | any
    batchSize?: number
    onLog: (log: Log) => Promise<void>
    onError?: (error: Error, log?: Log) => void
    stopOnError?: boolean
  }) {
    this.provider = ConfigState.getInstance().getConfigItem(opts.network) as WebSocketProvider
    if (!this.provider) {
      throw new Error('Provider not configured for network: ' + opts.network)
    }

    this.filter = {
      ...opts.filter,
      fromBlock: opts.filter.fromBlock || 0,
      toBlock: opts.filter.toBlock || 'latest',
    }
    this.fromBlock = this.filter.fromBlock as any
    this.toBlock = this.filter.toBlock as any
    this.batchSize = opts.batchSize || this.calculateBatchSize(opts.network)
    this.onLog = opts.onLog
    this.onError = opts.onError || BlockchainLogCrawler.defaultOnError
    this.stopOnError = opts.stopOnError ?? true
    this.shutdown = false
    this.crawling = false
    this.isOnError = false
    this.crawlResult = {
      latestBlockNumber: 0,
      lastBlockSync: 0,
      nbSuccess: 0,
      nbError: 0,
      nbTotal: 0,
    }
  }

  static defaultOnError(error: Error, log?: Log): void {
    logger.error(
      'Error in BlockchainLogCrawler',
      llo({
        error: error.message,
        logId: log?.transactionHash ?? null,
      }),
    )
  }

  calculateBatchSize(network: NetworksEnum): number {
    const secondsInMonth = 30 * 24 * 3600
    switch (network) {
      case NetworksEnum.mainnet:
      case NetworksEnum.arbitrum:
      case NetworksEnum.base:
        return Math.floor(secondsInMonth / 14) // Average block time ~14 seconds
      case NetworksEnum.polygon:
        return Math.floor(secondsInMonth / 2) // Average block time ~2 seconds
      case NetworksEnum.sepolia:
        return Math.floor(secondsInMonth / 12) // Average block time ~12 seconds
      default:
        throw new Error(`Unsupported network: ${network}`)
    }
  }

  async getBlockNumber(blockNumber: string | number | undefined): Promise<number> {
    if (blockNumber === 'latest' || blockNumber === undefined) {
      try {
        return await limiter.schedule(async () => this.provider.getBlockNumber())
      } catch (error) {
        logger.error(
          'Error get block number',
          llo({
            blockNumber,
            error,
          }),
        )
        return -1
      }
    } else {
      return Number(blockNumber)
    }
  }

  async updateAndCheckConditions(currentBlock: number, latestBlock: number): Promise<boolean> {
    return this.crawling && !this.isOnError && currentBlock >= 0 && latestBlock > 0 && currentBlock <= latestBlock
  }

  async crawl(): Promise<void> {
    if (this.crawling) {
      throw new Error('Already crawling')
    }

    this.crawling = true
    let currentBlock = await this.getBlockNumber(this.filter.fromBlock as any)
    const latestBlock = await this.getBlockNumber(this.filter.toBlock as any)
    this.crawlResult.latestBlockNumber = latestBlock

    while (await this.updateAndCheckConditions(currentBlock, latestBlock)) {
      const toBlock = Math.min(currentBlock + this.batchSize - 1, latestBlock)

      // Handle topics: use chunks if there are topics, or pass empty for all logs
      const topicChunks = Utils.chunkArray(this.filter.topics, 4)

      for (const topics of topicChunks) {
        logger.silly(
          'Querying logs for topic chunk',
          llo({
            initBlock: this.fromBlock,
            endBlock: this.toBlock,
            fromBlock: currentBlock,
            toBlock,
            topics,
          }),
        )

        try {
          const logs = await limiter.schedule(async () =>
            this.provider.getLogs({
              address: this.filter.address,
              topics: [topics],
              fromBlock: currentBlock,
              toBlock,
            }),
          )
          await this.processLogs(logs)
        } catch (error) {
          await this.handleErrors(error)
          if (this.stopOnError && this.shutdown) break
        }
      }

      if (this.shutdown) break
      currentBlock = toBlock + 1
    }

    this.crawling = false
    logger.info('Finished crawling logs', llo({ crawlResult: this.crawlResult }))
  }

  async handleErrors(error: any) {
    if (this.isBatchSizeError(error) && this.batchSize >= 1000) {
      this.batchSize = Math.max(1, Math.floor(this.batchSize / 2))
      logger.warn('Reducing batch size due to error', llo({ newBatchSize: this.batchSize }))
    } else if (this.isRateLimited(error)) {
      await Utils.wait(1000)
    } else {
      this.shutdown = true
      this.onError(error)
    }
  }

  async processLogs(logs: Log[]): Promise<void> {
    for (const log of logs) {
      try {
        await this.onLog(log)
        this.crawlResult.nbSuccess++
        this.crawlResult.lastBlockSync = log?.blockNumber
      } catch (error) {
        this.onError(error, log)
        this.crawlResult.nbError++
        if (this.stopOnError) {
          this.isOnError = true
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
    const messages = ['Log response size exceeded']

    return messages.some(msg => error.message?.includes(msg))
  }
}

export default BlockchainLogCrawler
