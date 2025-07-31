import { IMigHelper, type IMigration } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import type Token from '@models/schema/token'
import TokenDetector from '@helpers/tokenDetector'

const llo = logger.logMeta.bind(null, { service: 'Migration: hasClockMode' })

export const hasClockModeMigration: IMigration & IMigHelper = {
  countDocs: 0,

  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250627144557-hasClockMode' }))

    try {
      const crawler = new DBCrawler({
        model: Models.Token,
        onDocument: async (token: Token) => {
          hasClockModeMigration.countDocs++
          const result = await TokenDetector.detectTokenType(token.address, token.network)
          token.hasClockMode = result.hasClockMode
          await token.save()
          logger.verbose('Processed document', llo({ count: hasClockModeMigration.countDocs }))
        },
        onError: (error: any, document: any) => {
          logger.error(
            'Error save token hasClockMode',
            llo({
              error,
              address: document.address,
              network: document.network,
            }),
          )
        },

        where: {
          isGovernance: true,
          hasClockMode: { $exists: false },
        },
        batchSize: 2000,
        concurrency: 200,
      })

      await crawler.crawl()
      logger.info('Migration completed successfully', llo({ migration: '20250627144557-hasClockMode' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250627144557-hasClockMode', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default hasClockModeMigration
