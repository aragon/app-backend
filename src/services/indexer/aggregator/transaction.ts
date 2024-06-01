import { AggregatorTypeEnum, ITransactionCategory, type IAlchemyTransferResponse, ITransactionType } from '@types'
import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import { UtilsIndexer } from '@models/utils/indexer'
import type LogDaoRegistry from '@models/schema/logDaoRegistry'
import type Transaction from '@models/schema/transaction'
import BlockchainTransferCrawler from '@modules/blockchainTransferCrawler'
import type Aggregator from '@models/schema/aggregator'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorTransactions' })

/**
 * The AggregatorTransactions uses the alchemy_getAssetTransfers to fetch DAO transfers.
 * Due to a low limit on the method, the service should run alone.
 */

export const AggregatorTransactions = {
  start: async () => {
    logger.verbose('Start AggregatorTransactions', llo({}))

    const aggregatorDb = await Models.Aggregator.findByType(AggregatorTypeEnum.transactions)

    const crawler = new DBCrawler({
      model: Models.LogDaoRegistry,
      onDocument: async (daoRegistry: LogDaoRegistry) => AggregatorTransactions.onDocument(daoRegistry, aggregatorDb),
      onError: (error: any) => {
        logger.error('Error AggregatorTransactions', llo({ error }))
      },
      where: {},
      batchSize: 500,
      concurrency: 1,
    })

    await crawler.crawl()
    await UtilsIndexer.saveAggregationSync(crawler, aggregatorDb, 'lastBlockNumber')
    logger.verbose('End AggregatorTransactions', llo({}))
  },

  onDocument: async (daoRegistry: LogDaoRegistry, aggregatorDb: Aggregator) => {
    const depositTxCrawler = new BlockchainTransferCrawler({
      network: daoRegistry.network,
      filter: {
        fromBlock: aggregatorDb?.lastBlockNumber,
        toAddress: daoRegistry.address,
        category: [
          ITransactionCategory.ERC20,
          ITransactionCategory.ERC721,
          ITransactionCategory.ERC1155,
          ITransactionCategory.Internal,
          ITransactionCategory.External,
        ],
      },
      onTx: async (txLog: IAlchemyTransferResponse) =>
        AggregatorTransactions.saveTransaction(txLog, ITransactionType.deposit, daoRegistry),
      onError: async (error: any) => {
        logger.error('Error deposit transfer', llo({ error, type: ITransactionType.withdraw, daoId: daoRegistry.id }))
      },
      stopOnError: true,
    })
    await depositTxCrawler.crawl()

    const withdrawTxCrawler = new BlockchainTransferCrawler({
      network: daoRegistry.network,
      filter: {
        fromBlock: aggregatorDb?.lastBlockNumber,
        fromAddress: daoRegistry.address,
        category: [
          ITransactionCategory.ERC20,
          ITransactionCategory.ERC721,
          ITransactionCategory.ERC1155,
          ITransactionCategory.Internal,
          ITransactionCategory.External,
        ],
      },
      onTx: async (txLog: IAlchemyTransferResponse) =>
        AggregatorTransactions.saveTransaction(txLog, ITransactionType.withdraw, daoRegistry),
      onError: async (error: any) => {
        logger.error('Error withdraw transfer', llo({ error, type: ITransactionType.withdraw, daoId: daoRegistry.id }))
      },
      stopOnError: true,
    })
    await withdrawTxCrawler.crawl()
  },

  saveTransaction: async (tx: IAlchemyTransferResponse, type: ITransactionType, daoRegistry: LogDaoRegistry) => {
    try {
      const existingTxDb = await Models.Transaction.findExistingLog(tx.hash, tx.category, daoRegistry.network)
      if (existingTxDb) {
        return
      }

      await DbTx.executeTxFn(async ({ session }) => {
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

        const logDb = await Models.Transaction.create(rawTx, { session })
        await session.commitTransaction()
        await session.endSession()
        logger.verbose('New Transaction', llo({ logId: logDb?.id }))
      })
    } catch (error) {
      logger.error('Error Transaction', llo({ error, logId: daoRegistry.id }))
    }
  },
}
