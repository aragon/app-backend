import logger from '@logger'
import { type Filter, type Log, type WebSocketProvider } from 'ethers'
import { type IEnumIndexerService, type IEnumIndexerServiceStatic, NetworksEnum } from '@types'
import BottleneckModule from '@modules/bottleneck'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import config from '@config'
import utils from '@helpers/utils'
import ProviderModule from '@modules/provider'
import { retryRequest } from '@helpers/retryRequest'

const llo = logger.logMeta.bind(null, { service: 'modules:BlockchainLogCrawler' })

class BlockchainLogCrawler {
  private readonly network: NetworksEnum
  private readonly fromBlock: number | string
  private readonly toBlock: number | string
  private readonly onLog: (log: Log) => Promise<void>
  private readonly onError: (error: any, log?: Log) => void
  private readonly filter: Filter
  private readonly stopOnError: boolean
  private readonly logService: IEnumIndexerService | IEnumIndexerServiceStatic | null
  private readonly originalBatchSize: number
  private batchSize: number
  private crawling: boolean
  private isOnError: boolean
  private runCount: number
  private shutdown: boolean
  public readonly crawlResult: {
    network: NetworksEnum
    fromBlock: number
    toBlock: number
    nbSuccess: number
    nbError: number
    nbTotal: number
    lastSync: number
    logService: IEnumIndexerService | IEnumIndexerServiceStatic | null
  }

  constructor(opts: {
    network: NetworksEnum
    filter: Filter | any
    batchSize?: number
    onLog: (log: Log) => Promise<void>
    onError?: (error: Error, log?: Log) => void
    stopOnError?: boolean
    logService?: IEnumIndexerService | IEnumIndexerServiceStatic | null
  }) {
    this.network = opts.network
    this.filter = {
      ...opts.filter,
      fromBlock: opts.filter.fromBlock || 0,
      toBlock: opts.filter.toBlock || 'latest',
    }
    this.fromBlock = opts.filter.fromBlock
    this.toBlock = opts.filter.toBlock
    this.batchSize = opts.batchSize || this.calculateBatchSize(opts.network)
    this.originalBatchSize = this.batchSize
    this.onLog = opts.onLog
    this.onError = opts.onError || BlockchainLogCrawler.defaultOnError
    this.stopOnError = opts.stopOnError ?? true
    this.shutdown = false
    this.crawling = false
    this.isOnError = false
    this.runCount = 0
    this.logService = opts.logService ?? null

    this.crawlResult = {
      fromBlock: 0,
      toBlock: 0,
      network: opts.network,
      logService: this.logService,
      lastSync: 0,
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
    // Constants for block times in seconds for different networks
    const BLOCK_TIME_SECONDS = {
      ethereum: 12,
      zkSync: 15,
      arbitrum: 3,
      base: 12,
      polygon: 2,
    };

    // Seconds in 4 months (assuming 30 days per month)
    const days = 30 * 4
    const secondsInMonth = days * 24 * 3600;

    switch (network) {
      case NetworksEnum.zksyncMainnet:
      case NetworksEnum.zksyncSepolia:
        return Math.floor(secondsInMonth / BLOCK_TIME_SECONDS.zkSync);
      case NetworksEnum.ethereumMainnet:
      case NetworksEnum.ethereumSepolia:
        return Math.floor(secondsInMonth / BLOCK_TIME_SECONDS.ethereum);
      case NetworksEnum.arbitrumMainnet:
        return Math.floor(secondsInMonth / BLOCK_TIME_SECONDS.arbitrum);
      case NetworksEnum.baseMainnet:
        return Math.floor(secondsInMonth / BLOCK_TIME_SECONDS.base);
      case NetworksEnum.polygonMainnet:
        return Math.floor(secondsInMonth / BLOCK_TIME_SECONDS.polygon);
      default:
        throw new Error(`Unsupported network: ${network}`);
    }
  }

  async getBlockNumber(blockNumber: string | number | undefined): Promise<number> {
    if (blockNumber === 'latest' || blockNumber === undefined) {
      try {
        return await retryRequest(async () =>
          BottleneckModule.getNodeLimiter(this.crawlResult.network)!.schedule(async () =>
            this.getProvider().getBlockNumber(),
          ),
        )
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

    // override when use log service
    if (this.logService) {
      this.filter.fromBlock = await this.getServiceStartBlock()
      this.filter.toBlock = 'latest'
    }

    let currentBlock = await this.getBlockNumber(this.filter.fromBlock as any)
    const latestBlock = await this.getBlockNumber(this.filter.toBlock as any)

    while (await this.updateAndCheckConditions(currentBlock, latestBlock)) {
      this.runCount++
      let toBlock = Math.min(currentBlock + this.batchSize - (this.runCount > 1 ? 1 : 0), latestBlock)

      // Handle topics: use chunks if there are topics, or pass empty for all logs
      const topicChunks = utils.chunkArray(this.filter.topics, 4)
      let allLogs: Log[] = []

      for (const topics of topicChunks) {
        let success = false
        while (!success) {
          try {
            const logs = await retryRequest(async () =>
              BottleneckModule.getNodeLimiter(this.crawlResult.network)!.schedule(async () =>
                this.getProvider().getLogs({
                  address: this.filter.address,
                  topics: [topics],
                  fromBlock: currentBlock,
                  toBlock,
                }),
              ),
            )

            allLogs = allLogs.concat(logs) // Collect logs from this chunk
            this.crawlResult.fromBlock = currentBlock
            this.crawlResult.toBlock = toBlock
            this.crawlResult.nbTotal += logs.length
            this.batchSize = this.originalBatchSize
            success = true
            break
          } catch (error: any) {
            if (this.isBatchSizeError(error)) {
              if (this.batchSize > 1) {
                this.batchSize = Math.max(1, Math.floor(this.batchSize / 2))
                toBlock = Math.min(currentBlock + this.batchSize - (this.runCount > 1 ? 1 : 0), latestBlock)
              } else {
                logger.error('Batch size too small, stopping crawl', llo({ error }))
                this.shutdown = true
                this.onError(error)
                break
              }
            } else {
              await this.handleErrors(error)
              if (this.stopOnError && this.shutdown) break
            }
          }
        }
        if (this.shutdown) break
      }

      if (this.shutdown) break

      await this.processLogs(allLogs.sort((a, b) => a.blockNumber - b.blockNumber))

      if (this.logService) {
        await this.onSaveProgress(toBlock)
      }
      if (this.shutdown) break
      currentBlock = toBlock + 1
      if (currentBlock >= latestBlock) break
    }

    this.crawling = false
    logger.verbose('Finished crawling logs', llo({ crawlResult: this.crawlResult, filter: this.filter }))
  }

  async handleErrors(error: any) {
    if (this.isRateLimited(error)) {
      await utils.wait(1000)
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
        if (log.blockNumber) {
          this.crawlResult.lastSync = log?.blockNumber
        }
        logger.verbose('Processing log', llo({ crawlResult: this.crawlResult }))
        if (this.logService && log.blockNumber) {
          await this.onSaveProgress(log.blockNumber)
        }
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
    const messages = ['The query timed out', 'Log response size exceeded']

    return messages.some(msg => error.message?.includes(msg))
  }

  getProvider(): WebSocketProvider {
    return ProviderModule.getProvider(this.network)!
  }

  async getServiceStartBlock() {
    const existingConfig = await Models.ConfigIndexer.findExistingLog({
      network: this.crawlResult.network,
      service: this.logService!,
    })

    if (!existingConfig && (this.filter?.fromBlock as number) > 0) {
      return this.filter.fromBlock
    } else if (existingConfig) {
      return existingConfig.lastSync
    } else {
      return config.ARAGON_SUPPORTED_BLOCK[utils.networkToAragon(this.crawlResult.network)]
    }
  }

  async onSaveProgress(blockNumber: number) {
    const existingConfig = await Models.ConfigIndexer.findExistingLog({
      network: this.crawlResult.network,
      service: this.logService!,
    })

    await DbTx.executeTxFn(async ({ session }) => {
      if (existingConfig) {
        await existingConfig.update({ lastSync: blockNumber })
      } else {
        await Models.ConfigIndexer.create(
          {
            network: this.crawlResult.network,
            service: this.logService!,
            lastSync: blockNumber,
          },
          { session } as any,
        )
      }

      await session.commitTransaction()
      await session.endSession()
    })
  }
}

export default BlockchainLogCrawler
