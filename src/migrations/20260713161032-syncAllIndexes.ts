import logger from '@logger'
import Mongo from '@modules/mongo'
import { type IMigration } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: syncAllIndexes' })

const MIGRATION = '20260713161032-syncAllIndexes'

/**
 * Blind refresh of every model's indexes via Mongo.syncIndexes(), so the new
 * Transaction pagination indexes ({daoAddress, network, blockNumber, id} and
 * {daoAddress, network, side, blockNumber, id}) are built as part of the
 * migration run instead of waiting for the post-migration sync.
 */
export const syncAllIndexesMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      await Mongo.syncIndexes()

      logger.info('Migration completed successfully', llo({ migration: MIGRATION }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION, error }))
      throw error
    }
  },

  stop: async () => {
    // Usually empty for migrations
  },
}

export default syncAllIndexesMigration
