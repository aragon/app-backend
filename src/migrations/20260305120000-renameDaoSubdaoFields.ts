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
        [
          {
            $set: {
              parentAccount: {
                $cond: [{ $eq: [{ $type: '$parentAccount' }, 'missing'] }, '$parentDao', '$parentAccount'],
              },
              linkedAccounts: {
                $cond: [
                  { $eq: [{ $type: '$linkedAccounts' }, 'missing'] },
                  { $ifNull: ['$subDaos', []] },
                  '$linkedAccounts',
                ],
              },
            },
          },
          {
            $unset: ['parentDao', 'subDaos'],
          },
        ],
      )

      logger.info(
        'Renamed parentDao→parentAccount and subDaos→linkedAccounts',
        llo({
          migration: MIGRATION_NAME,
          matchedCount: renameResult.matchedCount,
          modifiedCount: renameResult.modifiedCount,
        }),
      )

      const legacyIndexes = ['parentDao_1_isActive_1_isHidden_1', 'subDaos_1_isActive_1_isHidden_1']
      for (const indexName of legacyIndexes) {
        try {
          await collection.dropIndex(indexName)
          logger.info('Dropped legacy index', llo({ migration: MIGRATION_NAME, indexName }))
        } catch (e: any) {
          if (e.codeName !== 'IndexNotFound') throw e
          logger.info('Legacy index not found, skipping', llo({ migration: MIGRATION_NAME, indexName }))
        }
      }

      logger.info('Migration completed successfully', llo({ migration: MIGRATION_NAME }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION_NAME, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default renameDaoSubdaoFieldsMigration
