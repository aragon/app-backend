import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const MIGRATION = '20260929055041-syncTokenMemberIndexes'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

export const syncTokenMemberIndexesMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      await Models.TokenMember.createIndexes()
      const indexes = await Models.TokenMember.collection.indexes()

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

export default syncTokenMemberIndexesMigration
