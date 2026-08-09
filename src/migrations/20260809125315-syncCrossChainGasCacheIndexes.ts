import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: syncCrossChainGasCacheIndexes' })

/**
 * Build the indexes of the new `CrossChainGasCache` collection.
 *
 * The models only sync their indexes at boot when `MONGO_DB_SYNC_MODELS` is on, and it is off by
 * default. Without the TTL index on `purgeAt` nothing is ever deleted, so the collection grows
 * forever with old measurements and old hourly counters. `syncIndexes` builds what the model
 * declares and drops what it no longer declares, and it is safe to run again.
 */
export const syncCrossChainGasCacheIndexesMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260809125315-syncCrossChainGasCacheIndexes' }))

    try {
      await Models.CrossChainGasCache.syncIndexes()

      const indexes = await Models.CrossChainGasCache.collection.indexes()

      logger.info(
        'Migration completed successfully',
        llo({
          migration: '20260809125315-syncCrossChainGasCacheIndexes',
          indexes: indexes.map((index: any) => index.name),
        }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: '20260809125315-syncCrossChainGasCacheIndexes', error }))
      throw error
    }
  },

  stop: async () => {},
}

export default syncCrossChainGasCacheIndexesMigration
