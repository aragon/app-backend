import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const MIGRATION = '20260924124828-syncSafeOwnerSyncIndexes'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

/**
 * Build the `SafeOwnerSync` indexes in production. Model index synchronization is disabled by
 * default, so the unique `(network, safeAddress)` key the owner sync serialises on would never exist.
 */
export const syncSafeOwnerSyncIndexesMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      await Models.SafeOwnerSync.syncIndexes()
      const indexes = await Models.SafeOwnerSync.collection.indexes()

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

export default syncSafeOwnerSyncIndexesMigration
