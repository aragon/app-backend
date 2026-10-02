import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const MIGRATION = '20260921055952-syncSafeTransactionIndexes'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

/** Build the `SafeTransaction` and `SafeAccount` indexes: model index sync is off by default, so the unique keys never form on their own. */
export const syncSafeTransactionIndexesMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      await Models.SafeTransaction.syncIndexes()
      await Models.SafeAccount.syncIndexes()
      const indexes = [
        ...(await Models.SafeTransaction.collection.indexes()),
        ...(await Models.SafeAccount.collection.indexes()),
      ]

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

export default syncSafeTransactionIndexesMigration
