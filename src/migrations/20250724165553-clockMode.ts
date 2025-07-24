import { EnumConnection, type IMigration } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import type Token from '@models/schema/token'
import TokenDetector from '@helpers/tokenDetector'

const llo = logger.logMeta.bind(null, { service: 'Migration: clockMode' })

export const clockModeMigration: IMigration = {

  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250724165553-clockMode' }))

    try {
      const crawler = new DBCrawler({
        model: Models.Token,
        onDocument: async (token: Token) => {

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
          hasClockMode: true,
          isGovernance: true,
        },
        batchSize: 1000,
        concurrency: 10,
      })

      await crawler.crawl()
      logger.info('Migration completed successfully', llo({ migration: '20250724165553-clockMode' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250724165553-clockMode', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default clockModeMigration
