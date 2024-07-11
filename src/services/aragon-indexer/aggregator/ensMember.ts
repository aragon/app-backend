import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Member from '@models/schema/member'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorEnsMember' })

export const AggregatorEnsMember = {
  start: async () => {
    logger.verbose('Start AggregatorEnsMember', llo({}))

    const crawler = new DBCrawler({
      model: Models.Member,
      onDocument: AggregatorEnsMember.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error AggregatorEnsMember', llo({ error, document }))
      },
      where: {},
      batchSize: 1000,
      concurrency: 10,
    })

    await crawler.crawl()
    logger.verbose('End AggregatorEnsMember', llo({ lastTimeSync: crawler.crawlResult.lastCreatedAt }))
  },

  onDocument: async function (document: Partial<Member>) {
    await DbTx.executeTxFn(async ({ session }) => {
      document.ens = await Web3Helper.getEnsWithAlchemy(document.address!)

      const logDb = await document.save({ session })

      await session.commitTransaction()
      await session.endSession()
      logger.verbose('Update Ens Member', llo({ logId: logDb?.id }))
    })
  },
}
