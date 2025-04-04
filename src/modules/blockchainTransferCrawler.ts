import logger from '@logger'
import { type WebSocketProvider } from 'ethers'
import {
  type IAlchemyTransferOptions,
  type IAlchemyTransferResponse,
  IConnectionType,
  type IEnumIndexerService,
  type IEnumIndexerServiceStatic,
  IProviderType,
  type NetworksEnum,
} from '@types'
import BottleneckModule from '@modules/bottleneck'
import { Models } from '@dbModels'
import config from '@config'
import DbTx from '@modules/dbTx'
import utils from '@helpers/utils'
import ProviderModule from '@modules/provider'
import { retryRequest } from '@helpers/retryRequest'
import Web3Utils from '@helpers/web3Utils'

const llo = logger.logMeta.bind(null, { service: 'modules:BlockchainTransferCrawler' })

class BlockchainTransferCrawler {
  private readonly network: NetworksEnum
  private readonly fromBlock: number | string
  private readonly toBlock: number | string
  private readonly filter: IAlchemyTransferOptions
  private readonly stopOnError: boolean
  private readonly logService: IEnumIndexerService | IEnumIndexerServiceStatic | null
  private runCount: number
  originalBatchSize: number = 0
  batchSize: number = 0
  crawling: boolean
  isOnError: boolean
  shutdown: boolean
  readonly onTx: (log: IAlchemyTransferResponse) => Promise<void>
  readonly onError: (error: any, log?: IAlchemyTransferResponse) => void
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
    filter: IAlchemyTransferOptions
    onTx: (log: IAlchemyTransferResponse) => Promise<void>
    onError?: (error: Error, log?: IAlchemyTransferResponse) => void
    stopOnError?: boolean
    shutdown?: boolean
    logService?: IEnumIndexerService | IEnumIndexerServiceStatic | null
  }) {
    this.network = opts.network
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
        const provider = this.getProvider()
        return await retryRequest(async () =>
          BottleneckModule.getNodeTransferLimiter(this.network).schedule(async () => provider.getBlockNumber()),
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
    this.originalBatchSize = this.batchSize

    while (await this.updateAndCheckConditions(currentBlock, latestBlock)) {
      this.runCount++
      let toBlock = Math.min(currentBlock + this.batchSize - (this.runCount > 1 ? 1 : 0), latestBlock)

      let success = false
      while (!success) {
        try {
          const provider = this.getProvider()
          const response = await retryRequest(async () =>
            BottleneckModule.getNodeTransferLimiter(this.network).schedule(async () =>
              provider.send('alchemy_getAssetTransfers', [
                {
                  fromBlock: currentBlock !== 0 ? Web3Utils.convertToHexNumber(currentBlock) : undefined,
                  toBlock: toBlock !== 0 ? Web3Utils.convertToHexNumber(toBlock) : 'latest',
                  fromAddress: this.filter.fromAddress,
                  toAddress: this.filter.toAddress,
                  category: this.filter.category,
                },
              ]),
            ),
          )

          await this.processTxs(response.transfers)
          this.batchSize = this.originalBatchSize
          success = true
          break
        } catch (error) {
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
        if (this.shutdown) break
      }

      if (this.logService) {
        await this.onSaveProgress(toBlock)
      }
      if (this.shutdown) break
      currentBlock = toBlock + 1
      if (currentBlock >= latestBlock) break
    }

    this.crawling = false
    logger.verbose('Finished crawling logs', llo({ crawlResult: this.crawlResult }))
  }

  async handleErrors(error: any) {
    if (this.isRateLimited(error)) {
      await utils.wait(2000)
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

  getProvider(): WebSocketProvider {
    return ProviderModule.getProvider(this.network, IProviderType.ALCHEMY, IConnectionType.RPC)
  }

  async getServiceStartBlock() {
    const existingConfig = await Models.ConfigIndexer.findExistingLog({
      network: this.crawlResult.network,
      service: this.logService!,
    })
    return existingConfig
      ? existingConfig.lastSync
      : config.NODES[utils.networkToAragon(this.crawlResult.network)].FROM_BLOCK
  }

  async onSaveProgress(blockNumber: number) {
    try {
      await DbTx.executeTxFn(async ({ session }) => {
        const existingConfig = await Models.ConfigIndexer.findExistingLog(
          {
            network: this.crawlResult.network,
            service: this.logService!,
          },
          { session },
        )

        if (existingConfig) {
          await existingConfig.update({ lastSync: blockNumber }, { session })
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
    } catch (error) {
      logger.error('Error onSaveProgress', llo({ error }))
    }
  }
}

export default BlockchainTransferCrawler
