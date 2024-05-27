import type BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import type Network from '@models/schema/network'
import DbTx from '@modules/dbTx'
import type DBCrawler from '@models/utils/crawler'

export const UtilsIndexer = {
  saveSync: async (crawler: BlockchainLogCrawler, networkDb: Network, property: string) => {
    if (crawler.crawlResult.nbError === 0 && crawler.crawlResult?.latestBlockNumber > 0) {
      await DbTx.executeTxFn(async ({ session }) => {
        await networkDb.update(
          {
            [property]: crawler.crawlResult.latestBlockNumber,
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
      })
    }
  },

  saveAggregationSync: async (crawler: DBCrawler, aggregatorDb: Network, property: string) => {
    if (crawler?.crawlResult?.nbError === 0 && crawler?.crawlResult?.lastCreatedAt) {
      await DbTx.executeTxFn(async ({ session }) => {
        await aggregatorDb.update(
          {
            [property]: crawler.crawlResult.lastCreatedAt,
          },
          { session },
        )
        await session.commitTransaction()
        await session.endSession()
      })
    }
  },
}
