import config from '@config'
import { Models } from '@dbModels'
import TelegramNotifier from '@helpers/telegramNotifier'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'telegram:notificationOutbox' })

/** Publishes persisted proposal notifications and leaves failed records pending for the next run. */
export const TelegramNotificationOutboxPublisher = {
  start: async (): Promise<void> => {
    const records = await Models.TelegramNotificationOutbox.findReadyToPublish(
      config.SERVICES.ARAGON_TELEGRAM.OUTBOX_BATCH_SIZE,
    )

    for (const record of records) {
      try {
        await TelegramNotifier.publishOrThrow(record.toQueuePayload())
        await record.markPublished()
        logger.verbose('telegram outbox: notification published', llo({ id: record.id, attemptCount: record.attemptCount }))
      } catch (error) {
        await record.markFailed(error, config.SERVICES.ARAGON_TELEGRAM.OUTBOX_INTERVAL)
        logger.warn('telegram outbox: notification publish failed; will retry', llo({ id: record.id, error }))
      }
    }
  },
}
