import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const MIGRATION = '20260827210000-syncTelegramNotificationOutboxIndexes'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

export const syncTelegramNotificationOutboxIndexesMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))
    await Models.TelegramNotificationOutbox.syncIndexes()
    logger.info('Migration completed successfully', llo({ migration: MIGRATION }))
  },

  stop: async () => {},
}

export default syncTelegramNotificationOutboxIndexesMigration
