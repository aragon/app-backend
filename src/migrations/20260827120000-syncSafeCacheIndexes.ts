import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const MIGRATION = '20260827120000-syncSafeCacheIndexes'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

/**
 * Build the Safe cache TTL index in production. Model index synchronization is disabled by default,
 * so relying on `MONGO_DB_SYNC_MODELS` would leave stale Safe payloads and budget documents forever.
 * Safe read freshness is also enforced in the model query because Mongo TTL cleanup is asynchronous.
 */
export const syncSafeCacheIndexesMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      await Models.SafeCache.syncIndexes()
      const indexes = await Models.SafeCache.collection.indexes()

      logger.info(
        'Migration completed successfully',
        llo({ migration: MIGRATION, indexes: indexes.map((index: { name?: string }) => index.name) }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default syncSafeCacheIndexesMigration
