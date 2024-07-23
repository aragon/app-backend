import {
  type IAlchemyTransferResponse,
  IEnumIndexerService,
  ITransactionCategory,
  ITransactionType,
  NetworksEnum,
} from '@types'
import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import { UtilsIndexer } from '@indexer/utils/indexer'
import type LogDaoRegistry from '@models/schema/logDaoRegistry'
import type Transaction from '@models/schema/transaction'
import BlockchainTransferCrawler from '@modules/blockchainTransferCrawler'
import Web3Helper from '@helpers/web3'
import { NetworkHelper } from '@helpers/network'
import { RateModule } from '@modules/rates'
import utils from '@helpers/utils'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'rates:DaoTransactions' })

/**
 * The DaoTransactions uses the alchemy_getAssetTransfers to fetch DAO transfers.
 * Due to a low limit on the method, the service should run alone.
 */

export const DaoTransactions = {
  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start DaoTransactions', llo({ startTime }))

    const crawler = new DBCrawler({
      model: Models.LogDaoRegistry,
      onDocument: async (daoRegistry: LogDaoRegistry) => DaoTransactions.onDocument(daoRegistry),
      onError: (error: any, document: any) => {
        logger.error('Error DaoTransactions', llo({ error, document }))
      },
      where: {
        network: { $in: NetworkHelper.supportedNetworks().map(w => w.networkName) },
      },
      batchSize: config.CRAWLER_CONFIG.DAO_TRANSACTIONS_BATCH_SIZE,
      concurrency: config.CRAWLER_CONFIG.DAO_TRANSACTIONS_CONCURRENCY,
    })

    await crawler.crawl()

    const duration = Date.now() - startTime
    logger.verbose(
      'End DaoTransactions',
      llo({ lastTimeSync: crawler.crawlResult?.lastCreatedAt, duration: `${duration}ms` }),
    )
  },

  getCategories: (network: NetworksEnum) => {
    const category = [
      ITransactionCategory.ERC20,
      ITransactionCategory.ERC721,
      ITransactionCategory.ERC1155,
      ITransactionCategory.Internal,
      ITransactionCategory.External,
    ]

    switch (network) {
      case NetworksEnum.baseMainnet:
      case NetworksEnum.zksyncSepolia:
      case NetworksEnum.arbitrumMainnet:
      case NetworksEnum.zksyncMainnet:
        return category.filter(cat => cat !== ITransactionCategory.Internal)
      default:
        return category
    }
  },
  onDocument: async (daoRegistry: LogDaoRegistry) => {
    const category = DaoTransactions.getCategories(daoRegistry.network)
    // txs to daoAddress
    const depositTxCrawler = new BlockchainTransferCrawler({
      network: daoRegistry.network,
      filter: {
        // fromBlock: aggregatorDb?.lastBlockNumber,
        toAddress: daoRegistry.address,
        category,
      },
      onTx: async (txLog: IAlchemyTransferResponse) =>
        DaoTransactions.saveTransaction(txLog, ITransactionType.deposit, daoRegistry),
      onError: async (error: any) => {
        logger.error(
          'Error deposit transfer',
          llo({ error, type: ITransactionType.withdraw, daoId: daoRegistry.id, network: daoRegistry.network }),
        )
      },
      logService: IEnumIndexerService.depositTxs,
      stopOnError: true,
    })
    await depositTxCrawler.crawl()

    // txs from daoAddress
    const withdrawTxCrawler = new BlockchainTransferCrawler({
      network: daoRegistry.network,
      filter: {
        // fromBlock: aggregatorDb?.lastBlockNumber,
        fromAddress: daoRegistry.address,
        category,
      },
      onTx: async (txLog: IAlchemyTransferResponse) =>
        DaoTransactions.saveTransaction(txLog, ITransactionType.withdraw, daoRegistry),
      onError: async (error: any) => {
        logger.error(
          'Error withdraw transfer',
          llo({ error, type: ITransactionType.withdraw, daoId: daoRegistry.id, network: daoRegistry.network }),
        )
      },
      logService: IEnumIndexerService.withdrawTxs,
      stopOnError: true,
    })
    await withdrawTxCrawler.crawl()
  },

  saveTransaction: async (tx: IAlchemyTransferResponse, type: ITransactionType, daoRegistry: LogDaoRegistry) => {
    try {
      const existingTxDb = await Models.Transaction.findExistingLog({
        transactionHash: tx.hash,
        category: tx.category,
        network: daoRegistry.network,
      })

      if (existingTxDb) {
        return
      }

      const blockTimestamp = await Web3Helper.getBlockTimestamp(Number(tx.blockNum), daoRegistry.network)

      await DbTx.executeTxFn(async ({ session }) => {
        const rawTx: Partial<Transaction> = {
          transactionHash: tx.hash,
          blockNumber: Number(tx.blockNum),
          blockTimestamp,
          network: daoRegistry.network,
          type,
          daoAddress: daoRegistry.address,
          fromAddress: tx.from,
          toAddress: tx.to,
          value: tx.value?.toString(),
          tokenId: tx.tokenId ? BigInt(tx.tokenId).toString() : undefined,
          erc721TokenId: tx.erc721TokenId ? BigInt(tx.erc721TokenId).toString() : undefined,
          erc1155Metadata: tx.erc1155Metadata?.map(w => ({
            tokenId: BigInt(w.tokenId)?.toString(),
            value: w.value?.toString(),
          })),
          category: tx.category,
        }

        const tokenAddress = tx.rawContract?.address || utils.zeroAddress
        const token = await UtilsIndexer.saveAndGetToken(tokenAddress, daoRegistry.network)

        if (token?.address) {
          rawTx.tokenAddress = token.address
          // historical price
          const daysDifference = utils.calculateDaysDifference(rawTx.blockTimestamp)
          const rate = await RateModule.fetchRate(token.address, daoRegistry.network, daysDifference)
          rawTx.amountUsd = rate ? (Number(rawTx.value) * Number(rate.priceUsd)).toString() : '0'

          rawTx.token = {
            network: token.network,
            address: token.address,
            symbol: token.symbol,
            name: token.name,
            type: token.type,
            logo: token.logo,
            decimals: token.decimals,
          }
        }

        const logDb = await Models.Transaction.create(rawTx, { session } as any)
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New Transaction', llo({ logId: logDb?.id }))
      })
    } catch (error) {
      logger.error('Error Transaction', llo({ error, logId: daoRegistry.id }))
    }
  },
}
