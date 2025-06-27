import { type IMigration } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import type Token from '@models/schema/token'
import TokenDetector from '@helpers/tokenDetector'

const llo = logger.logMeta.bind(null, { service: 'Migration: hasClockMode' })

export const hasClockModeMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250627144557-hasClockMode' }))

    try {
      logger.info('Migration completed successfully', llo({ migration: '20250627144557-hasClockMode' }))

      const crawler = new DBCrawler({
        model: Models.Token,
        onDocument: async (token: Token) => {
          const result = await TokenDetector.detectTokenType(token.address, token.network)
          token.hasClockMode = result.hasClockMode
          await token.save()
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
        },
        batchSize: 1000,
        concurrency: 10,
      })

      await crawler.crawl()
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
