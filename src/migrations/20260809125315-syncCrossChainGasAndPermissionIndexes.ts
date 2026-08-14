import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: syncCrossChainGasAndPermissionIndexes' })

/**
 * Build the indexes of the new `CrossChainGasCache` collection and of `DaoPermission`.
 *
 * The models only sync their indexes at boot when `MONGO_DB_SYNC_MODELS` is on, and it is off by
 * default. Without the TTL index on `purgeAt` nothing is ever deleted, so the collection grows
 * forever with old measurements and old hourly counters. `DaoPermission` had nothing to lead with
 * on the dao lookups either, so those queries read the whole network partition and sorted it in
 * memory. `syncIndexes` builds what the model declares and drops what it no longer declares, and
 * it is safe to run again.
 */
export const syncCrossChainGasAndPermissionIndexesMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260809125315-syncCrossChainGasAndPermissionIndexes' }))

    try {
      await Models.CrossChainGasCache.syncIndexes()
      await Models.DaoPermission.syncIndexes()

      const crossChainIndexes = await Models.CrossChainGasCache.collection.indexes()
      const daoPermissionIndexes = await Models.DaoPermission.collection.indexes()

      logger.info(
        'Migration completed successfully',
        llo({
          migration: '20260809125315-syncCrossChainGasAndPermissionIndexes',
          crossChainIndexes: crossChainIndexes.map((index: any) => index.name),
          daoPermissionIndexes: daoPermissionIndexes.map((index: any) => index.name),
        }),
      )
    } catch (error) {
      logger.error(
        'Migration failed',
        llo({ migration: '20260809125315-syncCrossChainGasAndPermissionIndexes', error }),
      )
      throw error
    }
  },

  stop: async () => {},
}

export default syncCrossChainGasAndPermissionIndexesMigration
