import { Models } from '@dbModels'
import logger from '@logger'
import type { IMigration } from '@types'

const MIGRATION = '20261105171522-uniqueSafeExecution'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

export const uniqueSafeExecutionMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))
    try {
      await Models.Transaction.collection.createIndex(
        { network: 1, daoAddress: 1, safeTxHash: 1 },
        {
          unique: true,
          name: 'safe_execution_unique',
          partialFilterExpression: { type: 'execution', safeTxHash: { $type: 'string' } },
        },
      )
      logger.info('Migration completed successfully', llo({ migration: MIGRATION }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default uniqueSafeExecutionMigration
