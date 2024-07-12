import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Member from '@models/schema/member'
import Web3Helper from '@helpers/web3'
import config from '@config'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorEnsMember' })

export const EnsMember = {
  start: async () => {
    const startTime = Date.now()
    logger.verbose('Start EnsMember', llo({ startTime }))

    const crawler = new DBCrawler({
      model: Models.Member,
      onDocument: EnsMember.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error EnsMember', llo({ error, document }))
      },
      where: {},
      batchSize: config.CRAWLER_CONFIG.ENS_BATCH_SIZE,
      concurrency: config.CRAWLER_CONFIG.ENS_CONCURRENCY,
    })

    await crawler.crawl()

    const duration = Date.now() - startTime
    logger.verbose('End EnsMember', llo({ lastTimeSync: crawler.crawlResult.lastCreatedAt, duration: `${duration}ms` }))
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
