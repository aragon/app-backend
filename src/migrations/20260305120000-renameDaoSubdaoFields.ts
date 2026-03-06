import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const llo = logger.logMeta.bind(null, { service: 'Migration: renameDaoSubdaoFields' })

const MIGRATION_NAME = '20260305120000-renameDaoSubdaoFields'

export const renameDaoSubdaoFieldsMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION_NAME }))

    try {
      const collection = Models.Dao.collection
      const renameResult = await collection.updateMany(
        { $or: [{ parentDao: { $exists: true } }, { subDaos: { $exists: true } }] },
        { $rename: { parentDao: 'parentAccount', subDaos: 'linkedAccounts' } },
      )

      logger.info(
        'Renamed parentDao→parentAccount and subDaos→linkedAccounts',
        llo({
          migration: MIGRATION_NAME,
          matchedCount: renameResult.matchedCount,
          modifiedCount: renameResult.modifiedCount,
        }),
      )

      logger.info('Migration completed successfully', llo({ migration: MIGRATION_NAME }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION_NAME, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default renameDaoSubdaoFieldsMigration
