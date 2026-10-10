import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const MIGRATION = '20261002000000-uniqueSafePluginAssociations'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

/**
 * Build the two unique Safe indexes in production: one process row per network, DAO and Safe, one
 * owner row per network, Safe and owner. Model index synchronization is disabled there.
 */
export const uniqueSafePluginAssociationsMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      await Models.SafeMember.syncIndexes()
      await Models.Plugin.syncIndexes()

      logger.info('Migration completed successfully', llo({ migration: MIGRATION }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default uniqueSafePluginAssociationsMigration
