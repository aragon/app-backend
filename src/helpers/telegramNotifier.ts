import config from '@config'
import utils from '@helpers/utils'
import logger from '@logger'
import RabbitMQ from '@modules/rabbitMQ'
import { EnumQueueName, type IQueueTelegramNotification } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helper:telegramNotifier' })
const PUBLISH_ATTEMPTS = 3
const PUBLISH_RETRY_DELAY_MS = 500

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
    for (let attempt = 1; attempt <= PUBLISH_ATTEMPTS; attempt++) {
      try {
        await TelegramNotifier.publishOrThrow(payload)
        return
      } catch (error) {
        if (attempt === PUBLISH_ATTEMPTS) {
          logger.warn(
            'telegramNotifier: publish failed',
            llo({ error, id: payload.id, event: payload.event, attempts: attempt }),
          )
          return
        }
        await utils.wait(PUBLISH_RETRY_DELAY_MS * attempt)
      }
    }
  },
}

export default TelegramNotifier
