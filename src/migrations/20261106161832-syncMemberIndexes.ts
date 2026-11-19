import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const MIGRATION = '20261106161832-syncMemberIndexes'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

export const syncMemberIndexesMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      await Models.Member.createIndexes()
      const indexes = await Models.Member.collection.indexes()

      const { modifiedCount } = await Models.Member.collection.updateMany(
        { $or: [{ ens: { $exists: true } }, { avatar: { $exists: true } }] },
        { $unset: { ens: '', avatar: '' } },
      )

      logger.info(
        'Migration completed successfully',
        llo({
          migration: MIGRATION,
          indexes: indexes.map((index: { name?: string }) => index.name),
          membersCleaned: modifiedCount,
        }),
      )
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default syncMemberIndexesMigration
