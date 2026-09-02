import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration } from '@types'

const MIGRATION = '20260827170000-syncTelegramIndexes'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

/** Build the unique, query, and TTL indexes required by the Telegram service. */
export const syncTelegramIndexesMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    await Promise.all([Models.TelegramSubscription.syncIndexes(), Models.TelegramNotifiedEvent.syncIndexes()])

    logger.info('Migration completed successfully', llo({ migration: MIGRATION }))
  },

  stop: async () => {},
}

export default syncTelegramIndexesMigration
