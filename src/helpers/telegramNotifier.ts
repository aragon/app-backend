import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { EnumQueueName, type IQueueTelegramNotification } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helper:telegramNotifier' })

/**
 * Fire-and-forget publish of a Telegram notification event.
 *
 * Never throws. The indexer/handler flow must not be affected by RabbitMQ outages
 * or any failure in the notifications pipeline — we only emit the event; downstream
 * fanout, rate-limiting, and delivery happen in the `aragon-telegram` service.
 */

const TelegramNotifier = {
  /**
   * Same publish, but lets a queue failure surface. Scheduled callers use this
   * so a RabbitMQ blip retries on the next run instead of losing the event.
   */
  publishOrThrow: async (payload: IQueueTelegramNotification): Promise<void> => {
    await RabbitMQHelper.sendMessage(EnumQueueName.telegramNotifications, payload)
  },

  publish: async (payload: IQueueTelegramNotification): Promise<void> => {
    try {
      await TelegramNotifier.publishOrThrow(payload)
    } catch (error) {
      logger.warn('telegramNotifier: publish failed', llo({ error, id: payload.id, event: payload.event }))
    }
  },
}

export default TelegramNotifier
