import { Models } from '@dbModels'
import logger from '@logger'
import { type IMigration, ITelegramNotificationEvent } from '@types'

const MIGRATION = '20260828015726-removeLegacyTelegramEvents'
const llo = logger.logMeta.bind(null, { service: `Migration: ${MIGRATION}` })

const VALID_EVENTS = Object.values(ITelegramNotificationEvent)

/**
 * Strips event values that no longer exist in the enum (`vote.cast`,
 * `vote.reset`) from stored subscriptions. Documents carrying them fail full
 * validation on every save, which breaks /subscribe and consent recording for
 * those users.
 */
export const removeLegacyTelegramEventsMigration: IMigration = {
  start: async () => {
    logger.info('Starting migration', llo({ migration: MIGRATION }))

    try {
      const result = await Models.TelegramSubscription.collection.updateMany(
        { 'subscriptions.events': { $elemMatch: { $nin: VALID_EVENTS } } },
        { $pull: { 'subscriptions.$[].events': { $nin: VALID_EVENTS } } } as any,
      )

      logger.info('Migration completed successfully', llo({ migration: MIGRATION, modified: result.modifiedCount }))
    } catch (error) {
      logger.error('Migration failed', llo({ migration: MIGRATION, error }))
      throw error
    }
  },

  stop: async () => {},
}

export default removeLegacyTelegramEventsMigration
