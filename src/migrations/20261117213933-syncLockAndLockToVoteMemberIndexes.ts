import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const MIGRATION = '20261117213933-syncLockAndLockToVoteMemberIndexes'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

export const syncLockAndLockToVoteMemberIndexesMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      await Models.Lock.createIndexes()
      await Models.LockToVoteMember.createIndexes()
      const lockIndexes = await Models.Lock.collection.indexes()
      const lockToVoteMemberIndexes = await Models.LockToVoteMember.collection.indexes()

      logger.info(
        'Migration completed successfully',
        llo({
          migration: MIGRATION,
          lockIndexes: lockIndexes.map((index: { name?: string }) => index.name),
          lockToVoteMemberIndexes: lockToVoteMemberIndexes.map((index: { name?: string }) => index.name),
        }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default syncLockAndLockToVoteMemberIndexesMigration
