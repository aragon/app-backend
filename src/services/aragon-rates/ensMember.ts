import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Member from '@models/schema/member'
import config from '@config'
import EnsHelper from '@helpers/ens'
import { type ICrawlStat } from '@types'

const llo = logger.logMeta.bind(null, { service: 'rates:EnsMember' })

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

  onDocument: async function (document: Partial<Member>, stats: ICrawlStat) {
    await DbTx.executeTxFn(async ({ session }) => {
      document.ens = await EnsHelper.getEnsWithUniversalResolver(document.address!)

      const logDb = await document.save({ session })

      await session.commitTransaction()
      await session.endSession()
      logger.verbose('Update Ens Member', llo({ logId: logDb?.id, stats }))
    })
  },
}
