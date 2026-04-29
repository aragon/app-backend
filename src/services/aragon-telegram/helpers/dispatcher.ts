import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import {
  type IRenderedNotification,
  type NotificationRenderer,
} from '@services/aragon-telegram/helpers/notificationRenderer'
import {
  EnumQueueName,
  type IQueueTelegramNotification,
  ITelegramNotificationEvent,
  ITelegramSubscriptionStatus,
} from '@types'
import { type Api, GrammyError } from 'grammy'
import { createHash } from 'node:crypto'

const VALID_EVENTS = new Set<string>(Object.values(ITelegramNotificationEvent))

/** Short, stable hash of a Telegram user id for log correlation without leaking the raw id. */
const userHash = (id: number): string => createHash('sha256').update(String(id)).digest('hex').slice(0, 8)

/**
 * Consumes `telegram.notifications` events from RabbitMQ, fans out to every
 * active subscriber for the target DAO, and delivers the rendered message.
 *
 * Rate limits and 429 retries are handled by the `@grammyjs/auto-retry`
 * transformer installed on the bot's API in `bot.ts`. We don't preemptively
 * throttle here; PoC traffic stays well under Telegram's caps.
 */
export class NotificationDispatcher {
  private readonly llo: any

  constructor(
    private readonly api: Api,
    private readonly renderer: NotificationRenderer,
  ) {
    this.llo = logger.logMeta.bind(null, { service: 'telegram:dispatcher' })
  }

  async start(): Promise<void> {
    await RabbitMQHelper.process(EnumQueueName.telegramNotifications, async (data: IQueueTelegramNotification) => {
      await this.handle(data)
    })
  }

  private async handle(msg: IQueueTelegramNotification): Promise<void> {
    if (!this.isValidPayload(msg)) {
      logger.warn('telegram dispatcher: invalid payload', this.llo({ msg }))
      return
    }

    const subscribers = await Models.TelegramSubscription.findActiveSubscribersForDao(
      { network: msg.network, daoAddress: msg.daoAddress },
      msg.event,
    )
    if (subscribers.length === 0) return

    const rendered = await this.renderer.render(msg)
    if (!rendered) return

    await Promise.allSettled(subscribers.map(sub => this.sendToChat(sub.chatId, sub.telegramUserId, rendered)))
  }

  private isValidPayload(msg: IQueueTelegramNotification): boolean {
    return Boolean(msg?.event && VALID_EVENTS.has(msg.event) && msg.network && msg.daoAddress)
  }

  private async sendToChat(chatId: number, telegramUserId: number, rendered: IRenderedNotification): Promise<void> {
    try {
      await this.api.sendMessage(chatId, rendered.text, {
        entities: rendered.entities,
        reply_markup: rendered.keyboard,
        link_preview_options: { is_disabled: true },
      })
    } catch (err) {
      await this.handleSendError(err, telegramUserId)
    }
  }

  private async handleSendError(err: unknown, telegramUserId: number): Promise<void> {
    if (err instanceof GrammyError && err.error_code === 403) {
      const sub = await Models.TelegramSubscription.findByTelegramUserId(telegramUserId)
      await sub?.setStatus(ITelegramSubscriptionStatus.Blocked)
      return
    }
    logger.warn('telegram dispatcher: send failed', this.llo({ err, userHash: userHash(telegramUserId) }))
  }
}
