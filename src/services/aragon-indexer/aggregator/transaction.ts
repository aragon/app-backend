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
import Utils from '@helpers/utils'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorTransactions' })

/**
 * The AggregatorTransactions uses the alchemy_getAssetTransfers to fetch DAO transfers.
 * Due to a low limit on the method, the service should run alone.
 */

export const AggregatorTransactions = {
  start: async () => {
    logger.verbose('Start AggregatorTransactions', llo({}))

    const crawler = new DBCrawler({
      model: Models.LogDaoRegistry,
      onDocument: async (daoRegistry: LogDaoRegistry) => AggregatorTransactions.onDocument(daoRegistry),
      onError: (error: any) => {
        logger.error('Error AggregatorTransactions', llo({ error }))
      },
      where: {},
      batchSize: 500,
      concurrency: 1,
    })

    await crawler.crawl()
    logger.verbose('End AggregatorTransactions', llo({ lastTimeSync: crawler.crawlResult?.lastCreatedAt }))
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
      case NetworksEnum.arbitrumMainnet:
        return category.filter(cat => cat !== ITransactionCategory.Internal)
      default:
        return category
    }
  },
  onDocument: async (daoRegistry: LogDaoRegistry) => {
    const category = AggregatorTransactions.getCategories(daoRegistry.network)
    // txs to daoAddress
    const depositTxCrawler = new BlockchainTransferCrawler({
      network: daoRegistry.network,
      filter: {
        // fromBlock: aggregatorDb?.lastBlockNumber,
        toAddress: daoRegistry.address,
        category,
      },
      onTx: async (txLog: IAlchemyTransferResponse) =>
        AggregatorTransactions.saveTransaction(txLog, ITransactionType.deposit, daoRegistry),
      onError: async (error: any) => {
        logger.error('Error deposit transfer', llo({ error, type: ITransactionType.withdraw, daoId: daoRegistry.id }))
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
        AggregatorTransactions.saveTransaction(txLog, ITransactionType.withdraw, daoRegistry),
      onError: async (error: any) => {
        logger.error('Error withdraw transfer', llo({ error, type: ITransactionType.withdraw, daoId: daoRegistry.id }))
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

      const transactionDb = await DbTx.executeTxFn(async ({ session }) => {
        const rawTx: Partial<Transaction> = {
          transactionHash: tx.hash,
          blockNumber: tx.blockNum,
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
          tokenAddress: tx.rawContract?.address!,
          category: tx.category,
        }

        const logDb = await Models.Transaction.create(rawTx, { session } as any)
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New Transaction', llo({ logId: logDb?.id }))
        return logDb
      })

      if (transactionDb.tokenAddress) {
        Utils.setImmediateAsync(async () =>
          UtilsIndexer.saveAndGetToken(transactionDb.tokenAddress, transactionDb.network),
        )
      }
    } catch (error) {
      logger.error('Error Transaction', llo({ error, logId: daoRegistry.id }))
    }
  },
}
