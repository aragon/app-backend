import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import { DaoEventWindow } from '@services/aragon-telegram/helpers/daoEventWindow'
import { type TelegramMetrics } from '@services/aragon-telegram/helpers/metrics'
import { type NotificationRenderer } from '@services/aragon-telegram/helpers/notificationRenderer'
import { telegramErrorMeta } from '@services/aragon-telegram/helpers/telegramError'
import { telegramRecipientHash, telegramUserLogHash } from '@services/aragon-telegram/helpers/userHash'
import {
  EnumQueueName,
  type IQueueTelegramNotification,
  type IRenderedNotification,
  ITelegramNotificationEvent,
} from '@types'
import { type Api, GrammyError } from 'grammy'

const VALID_EVENTS = new Set<string>(Object.values(ITelegramNotificationEvent))

/** Per-recipient marker that avoids storing a raw Telegram user id. */
const deliveryMarker = (messageId: string, telegramUserId: number): { id: string; recipientHash: string } => {
  const recipientHash = telegramRecipientHash(telegramUserId)
  return { id: `delivered:${messageId}:${recipientHash}`, recipientHash }
}

/**
 * Consumes `telegram.notifications` events from RabbitMQ, fans out to every
 * active subscriber for the target DAO, and delivers the rendered message.
 *
 * Rate limits and 429 retries are handled by the `@grammyjs/auto-retry`
 * transformer installed on the bot's API in `bot.ts`. We don't preemptively
 * throttle here; PoC traffic stays well under Telegram's caps.
 *
 * Each event with subscribers and a rendered message claims a slot in its
 * organization's hourly `DaoEventWindow`; past the cap it is marked dispatched
 * and dropped. Claiming after render keeps a null render from spending a slot.
 */
const MUTE_NOTICE =
  '<i>This organization is very active right now. Further notifications from it are muted for the rest of the hour.</i>'

export class NotificationDispatcher {
  private readonly llo: any
  private readonly daoEventWindow = new DaoEventWindow()

  constructor(
    private readonly api: Api,
    private readonly renderer: NotificationRenderer,
    private readonly metrics?: TelegramMetrics,
  ) {
    this.llo = logger.logMeta.bind(null, { service: 'telegram:dispatcher' })
  }

  async start(): Promise<void> {
    await RabbitMQHelper.process(
      EnumQueueName.telegramNotifications,
      async (data: IQueueTelegramNotification) => {
        await this.handle(data)
      },
      {
        retry: {
          maxAttempts: config.SERVICES.ARAGON_TELEGRAM.DELIVERY_MAX_ATTEMPTS,
          baseDelayMs: config.SERVICES.ARAGON_TELEGRAM.DELIVERY_RETRY_BASE_DELAY_MS,
          maxDelayMs: config.SERVICES.ARAGON_TELEGRAM.DELIVERY_RETRY_MAX_DELAY_MS,
          deadLetterQueue: EnumQueueName.telegramNotificationsDeadLetter,
        },
      },
    )
  }

  private async handle(msg: IQueueTelegramNotification): Promise<void> {
    if (!this.isValidPayload(msg)) {
      logger.warn('telegram dispatcher: invalid payload', this.llo({ msg }))
      return
    }

    const markerId = `dispatched:${msg.id}`
    if (await Models.TelegramNotifiedEvent.exists({ id: markerId })) {
      logger.verbose('telegram dispatcher: duplicate delivery skipped', this.llo({ id: msg.id }))
      return
    }

    const subscribers = await Models.TelegramSubscription.findActiveSubscribersForDao(
      { network: msg.network, daoAddress: msg.daoAddress },
      msg.event,
    )
    if (subscribers.length === 0) {
      await Models.TelegramNotifiedEvent.claim(markerId)
      return
    }

    const rendered = await this.renderer.render(msg)
    if (!rendered) {
      await Models.TelegramNotifiedEvent.claim(markerId)
      return
    }

    const daoId = Models.TelegramSubscription.getDaoId({ network: msg.network, daoAddress: msg.daoAddress })
    const slot = this.daoEventWindow.claimSlot(daoId, msg.id, config.SERVICES.ARAGON_TELEGRAM.MAX_DAO_EVENTS_PER_HOUR)
    if (slot === 'muted') {
      logger.warn(
        'telegram dispatcher: organization over hourly cap, notification muted',
        this.llo({ id: msg.id, daoId }),
      )
      await Models.TelegramNotifiedEvent.claim(markerId)
      return
    }
    if (slot === 'send-with-mute-notice') rendered.text = `${rendered.text}\n\n${MUTE_NOTICE}`

    const results = await Promise.allSettled(
      subscribers.map(sub => this.sendToChat(msg.id, msg.event, sub.chatId, sub.telegramUserId, rendered)),
    )
    const failed = results.find(result => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason

    await Models.TelegramNotifiedEvent.claim(markerId)
  }

  private isValidPayload(msg: IQueueTelegramNotification): boolean {
    return Boolean(msg?.event && VALID_EVENTS.has(msg.event) && msg.network && msg.daoAddress)
  }

  private async sendToChat(
    messageId: string,
    event: ITelegramNotificationEvent,
    chatId: number,
    telegramUserId: number,
    rendered: IRenderedNotification,
  ): Promise<void> {
    const marker = deliveryMarker(messageId, telegramUserId)
    const markerId = marker.id
    if (await Models.TelegramNotifiedEvent.exists({ id: markerId })) return

    try {
      await this.api.sendMessage(chatId, rendered.text, {
        parse_mode: 'HTML',
        reply_markup: rendered.keyboard,
        link_preview_options: { is_disabled: true },
      })
      this.metrics?.notificationsDelivered.inc({ event })
    } catch (err) {
      const permanent = await this.handleSendError(err, telegramUserId)
      if (!permanent) throw err
    }

    await Models.TelegramNotifiedEvent.claim(markerId, marker.recipientHash)
  }

  private async handleSendError(err: unknown, telegramUserId: number): Promise<boolean> {
    if (err instanceof GrammyError && err.error_code === 403) {
      this.metrics?.usersBlocked.inc()
      const sub = await Models.TelegramSubscription.findByTelegramUserId(telegramUserId)
      await sub?.blockForDeletion(config.SERVICES.ARAGON_TELEGRAM.BLOCKED_SUBSCRIBER_RETENTION_DAYS)
      return true
    }
    logger.warn(
      'telegram dispatcher: send failed',
      this.llo({ err: telegramErrorMeta(err), userHash: telegramUserLogHash(telegramUserId) }),
    )
    const permanent =
      err instanceof GrammyError && err.error_code >= 400 && err.error_code < 500 && err.error_code !== 429
    this.metrics?.sendFailures.inc({ kind: permanent ? 'permanent' : 'retryable' })
    return permanent
  }
}
