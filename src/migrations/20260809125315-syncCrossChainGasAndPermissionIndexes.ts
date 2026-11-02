import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: syncCrossChainGasAndPermissionIndexes' })

/**
 * DAO lookups need indexes that lead with the DAO and match the log order. Without them Mongo
 * reads the whole network partition and sorts it in memory.
 */
export const syncCrossChainGasAndPermissionIndexesMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: '20260809125315-syncCrossChainGasAndPermissionIndexes' }))

    try {
      await Models.DaoPermission.syncIndexes()

      const daoPermissionIndexes = await Models.DaoPermission.collection.indexes()

      logger.info(
        'Migration completed successfully',
        llo({
          migration: '20260809125315-syncCrossChainGasAndPermissionIndexes',
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
