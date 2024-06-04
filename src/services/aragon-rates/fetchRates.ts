import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import dayjs from '@helpers/dayjs'
import Token from '@models/schema/token'
import { RateModule } from '@modules/rates'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:FetchRates' })

export const FetchRates = {
  start: async () => {
    logger.verbose('Start FetchRates', llo({}))

    // const aggregatorDb = await Models.Aggregator.findByType(AggregatorTypeEnum.plugin)

    const crawler = new DBCrawler({
      model: Models.Token,
      onDocument: FetchRates.onDocument,
      onError: (error: any) => {
        logger.error('Error FetchRates', llo({ error }))
      },
      where: {
        lastUpdatedAt: { $lte: dayjs.utc().subtract(6, 'hours').toDate() },
      },
      batchSize: 1000,
      concurrency: 1,
    })

    await crawler.crawl()
    // await UtilsIndexer.saveAggregationSync(crawler, aggregatorDb, 'lastTimeSync')
    logger.verbose('End FetchRates', llo({ lastTimeSync: crawler.crawlResult.lastCreatedAt }))
  },

  async onDocument(token: Token) {
    const rate = await RateModule.fetchRate(token.address, token.network)

    await DbTx.executeTxFn(async ({ session }) => {
      const logDb = await token.update(rate, { session })
      await session.commitTransaction()
      await session.endSession()
      logger.verbose('Token rate updated', llo({ logId: logDb.id }))
    })
  },
}
