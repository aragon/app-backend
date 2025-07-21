import { type IMigration } from '@types'
import logger from '@logger'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import type DaoMemberMapping from '@models/schema/daoMemberMapping'

const llo = logger.logMeta.bind(null, { service: 'Migration: daoMemberMapping' })

// TODO: to do
export const daoMemberMappingMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20250718012152-daoMemberMapping' }))

    try {
      const crawler = new DBCrawler({
        model: Models.DaoMemberMapping,
        onDocument: async (doc: DaoMemberMapping) => {
          const id = Models.DaoMemberMapping.getEntityId({
            network: doc.network,
            memberAddress: doc.memberAddress,
            tokenOrPluginAddress: doc.tokenAddress || doc.pluginAddress,
          })

          const toSave = {
            id,
            memberAddress: doc.memberAddress,
            network: doc.network,
            tokenAddress: doc.tokenAddress ? doc.tokenAddress : null,
            pluginAddress: doc.tokenAddress ? null : doc.pluginAddress,
          }

          await Models.DaoMemberMapping.deleteOne({ _id: doc._id })
          await Models.DaoMemberMapping.create(toSave)
        },
        onError: (error: any, document: any) => {
          logger.error('Error migrate daoMemberMapping', llo({ error, document }))
        },
        where: {},
        batchSize: 2000,
        concurrency: 200,
      })

      await crawler.crawl()

      logger.info('Migration completed successfully', llo({ migration: '20250718012152-daoMemberMapping' }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20250718012152-daoMemberMapping', error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default daoMemberMappingMigration
