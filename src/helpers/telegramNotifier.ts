import config from '@config'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import RabbitMQ from '@modules/rabbitMQ'
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
   * Publishes on the channel directly and lets a failure surface —
   * `RabbitMQHelper.sendMessage` swallows broker errors, which would let a
   * scheduled caller claim an event that was never queued.
   */
  publishOrThrow: async (payload: IQueueTelegramNotification): Promise<void> => {
    const queueName = EnumQueueName.telegramNotifications
    const channelWrapper = RabbitMQ.getChannel(queueName)
    await channelWrapper.sendToQueue(queueName, payload, {
      persistent: true,
      contentType: 'application/json',
      timeout: config.SERVICES.ARAGON_TELEGRAM.PUBLISH_TIMEOUT_MS,
    })
  },

  publish: async (payload: IQueueTelegramNotification): Promise<void> => {
    try {
      await RabbitMQHelper.sendMessage(EnumQueueName.telegramNotifications, payload)
    } catch (error) {
      logger.warn('telegramNotifier: publish failed', llo({ error, id: payload.id, event: payload.event }))
    }
  },
}

export default TelegramNotifier
