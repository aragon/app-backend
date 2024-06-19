import logger from '@logger'
import { type WebSocketProvider } from 'ethers'
import { ConfigState } from '@state/configState'
import {
  type IAlchemyTransferOptions,
  type IAlchemyTransferResponse,
  type IEnumIndexerService,
  NetworksEnum,
} from '@types'
import Utils from '@helpers/utils'
import BottleneckModule from '@modules/bottleneck'
import Web3Helper from '@helpers/web3'
import { Models } from '@dbModels'
import config from '@config'
import DbTx from '@modules/dbTx'

const llo = logger.logMeta.bind(null, { service: 'modules:BlockchainTransferCrawler' })

class BlockchainTransferCrawler {
  private readonly network: NetworksEnum
  private readonly fromBlock: number | string
  private readonly toBlock: number | string
  private readonly provider: WebSocketProvider
  private readonly filter: IAlchemyTransferOptions
  private readonly stopOnError: boolean
  private readonly logService: IEnumIndexerService | null
  batchSize: number = 0
  crawling: boolean
  isOnError: boolean
  shutdown: boolean
  readonly onTx: (log: IAlchemyTransferResponse) => Promise<void>
  readonly onError: (error: any, log?: IAlchemyTransferResponse) => void
  public readonly crawlResult: {
    network: NetworksEnum
    nbSuccess: number
    nbError: number
    nbTotal: number
    lastSync: number
  }

  constructor(opts: {
    network: NetworksEnum
    filter: IAlchemyTransferOptions
    onTx: (log: IAlchemyTransferResponse) => Promise<void>
    onError?: (error: Error, log?: IAlchemyTransferResponse) => void
    stopOnError?: boolean
    shutdown?: boolean
    logService?: IEnumIndexerService
  }) {
    this.network = opts.network
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
    this.onTx = opts.onTx
    this.onError = opts.onError || BlockchainTransferCrawler.defaultOnError
    this.stopOnError = opts.stopOnError ?? true
    this.shutdown = opts.shutdown ?? false
    this.crawling = false
    this.isOnError = false
    this.logService = opts.logService ?? null
    this.crawlResult = {
      network: opts.network,
      nbSuccess: 0,
      nbError: 0,
      nbTotal: 0,
      lastSync: 0,
    }
  }

  static defaultOnError(error: Error, log?: IAlchemyTransferResponse): void {
    logger.error(
      'Error in BlockchainTransferCrawler',
      llo({
        error: error.message,
        logId: log?.hash ?? null,
      }),
    )
  }

  async getBlockNumber(blockNumber: string | number | undefined): Promise<number> {
    if (blockNumber === 'latest' || blockNumber === undefined) {
      try {
        return await BottleneckModule.getNodeTransferLimiter(NetworksEnum.ethereumMainnet)!.schedule(async () =>
          this.provider.getBlockNumber(),
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
    this.batchSize = Math.max(0, latestBlock - currentBlock)

    while (await this.updateAndCheckConditions(currentBlock, latestBlock)) {
      const toBlock = Math.min(currentBlock + this.batchSize - 1, latestBlock)

      logger.silly(
        'Querying logs for topic chunk',
        llo({
          network: this.crawlResult.network,
          initBlock: this.fromBlock,
          endBlock: this.toBlock,
          fromBlock: currentBlock,
          toBlock,
        }),
      )

      try {
        const response = await BottleneckModule.getNodeTransferLimiter(this.network)!.schedule(async () =>
          this.provider.send('alchemy_getAssetTransfers', [
            {
              fromBlock: toBlock === 0 ? Web3Helper.convertToHexNumber(currentBlock) : undefined,
              toBlock: toBlock === 0 ? Web3Helper.convertToHexNumber(toBlock) : undefined,
              fromAddress: this.filter.fromAddress,
              toAddress: this.filter.toAddress,
              category: this.filter.category,
            },
          ]),
        )

        await this.processTxs(response.transfers)
      } catch (error) {
        await this.handleErrors(error)
        if (this.stopOnError && this.shutdown) break
      }

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
    if (this.isBatchSizeError(error) && this.batchSize >= 1000) {
      this.batchSize = Math.max(1, Math.floor(this.batchSize / 2))
      logger.warn('Reducing batch size due to error', llo({ newBatchSize: this.batchSize }))
    } else if (this.isRateLimited(error)) {
      await Utils.wait(2000)
    } else {
      this.shutdown = true
      this.onError(error)
    }
  }

  async processTxs(txs: IAlchemyTransferResponse[]): Promise<void> {
    for (const tx of txs) {
      try {
        await this.onTx(tx)
        this.crawlResult.nbSuccess++
        if (tx?.blockNum) {
          this.crawlResult.lastSync = Number(tx.blockNum)
        }
        if (this.logService && tx?.blockNum) {
          await this.onSaveProgress(tx.blockNum)
        }
      } catch (error) {
        this.onError(error, tx)
        this.crawlResult.nbError++
        if (this.stopOnError) {
          this.isOnError = true
          break
        }
      }
    }
  }

  isRateLimited(error: any): boolean {
    const messages = [
      'Your app has exceeded its compute units per second capacity',
      'alchemy_getAssetTransfers is a method with custom rate limits that you have exceeded',
    ]

    return messages.some(msg => error.message?.includes(msg))
  }

  isBatchSizeError(error: any): boolean {
    const messages = ['The query timed out', 'Log response size exceeded']

    return messages.some(msg => error.message?.includes(msg))
  }

  async getServiceStartBlock() {
    const existingConfig = await Models.ConfigIndexer.findExistingLog({
      network: this.crawlResult.network,
      service: this.logService!,
    })
    return existingConfig
      ? existingConfig.lastSync
      : config.ARAGON_SUPPORTED_BLOCK[this.crawlResult.network.toUpperCase()]
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

export default BlockchainTransferCrawler
