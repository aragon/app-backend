import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import {
  type IRenderedNotification,
  NotificationRenderer,
} from '@services/aragon-telegram/helpers/notificationRenderer'
import { UserIdHash } from '@services/aragon-telegram/helpers/userIdHash'
import {
  EnumQueueName,
  type IQueueTelegramNotification,
  ITelegramNotificationEvent,
  ITelegramSubscriptionStatus,
} from '@types'
import Bottleneck from 'bottleneck'
import { type Api, GrammyError, HttpError } from 'grammy'

const VALID_EVENTS = new Set<string>(Object.values(ITelegramNotificationEvent))

/**
 * Consumes `telegram.notifications` events from RabbitMQ, fans out to every
 * active subscriber for the target DAO, and delivers the message under the
 * Telegram Bot API rate limits (≤30 msg/s globally, ≤1 msg/s per chat).
 *
 * Why a `pauseUntil` barrier exists in addition to Bottleneck:
 *   The static cap of 30 msg/s isn't a guarantee — Telegram dynamically lowers
 *   the budget if it deems traffic abusive. When that happens we get HTTP 429
 *   with `parameters.retry_after`, and Telegram blocks **all** API calls from
 *   the bot for that window — not just the offending recipient. Bottleneck
 *   doesn't know about Telegram's dynamic budget, so without a barrier it
 *   keeps shoving sends out, each one bouncing off another 429 and extending
 *   the lockout. The barrier suspends every send (including ones already
 *   queued in Bottleneck) until `retry_after + 1s` has elapsed.
 */
export class NotificationDispatcher {
  private readonly llo: any
  private readonly globalLimiter: Bottleneck
  private readonly perChatLimiters = new Map<number, Bottleneck>()
  private pauseUntil = 0

  constructor(
    private readonly api: Api,
    private readonly renderer: NotificationRenderer,
  ) {
    this.llo = logger.logMeta.bind(null, { service: 'telegram:dispatcher' })
    const cfg = config.SERVICES.ARAGON_TELEGRAM.RATE_LIMIT
    this.globalLimiter = new Bottleneck({
      maxConcurrent: cfg.GLOBAL_MAX_CONCURRENT,
      minTime: cfg.GLOBAL_MIN_TIME,
    })
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
    const ttlSeconds = config.SERVICES.ARAGON_TELEGRAM.DEDUP_TTL_SECONDS

    await Promise.all(subscribers.map(sub => this.fanOutToSubscriber(msg.id, sub, rendered, ttlSeconds)))
  }

  private async fanOutToSubscriber(
    eventId: string,
    sub: { chatId: number; telegramUserId: number },
    rendered: IRenderedNotification,
    ttlSeconds: number,
  ): Promise<void> {
    const isFirstTime = await Models.NotificationDispatched.claim(eventId, sub.telegramUserId, ttlSeconds)
    if (!isFirstTime) return

    try {
      await this.sendToChat(sub.chatId, sub.telegramUserId, rendered)
    } catch (err) {
      logger.warn('telegram dispatcher: send failed', this.llo({ err, userHash: UserIdHash.of(sub.telegramUserId) }))
    }
  }

  private isValidPayload(msg: IQueueTelegramNotification): boolean {
    return Boolean(msg?.event && VALID_EVENTS.has(msg.event) && msg.network && msg.daoAddress)
  }

  private async sendToChat(chatId: number, telegramUserId: number, rendered: IRenderedNotification): Promise<void> {
    const send = async () => {
      await this.waitForPause()
      return this.api.sendMessage(chatId, rendered.text, {
        parse_mode: 'MarkdownV2',
        reply_markup: rendered.keyboard,
        link_preview_options: { is_disabled: true },
      })
    }

    await this.waitForPause()
    try {
      await this.getChatLimiter(chatId).schedule(() => this.globalLimiter.schedule(send))
    } catch (err) {
      await this.handleSendError(err, telegramUserId)
      throw err
    }
  }

  private getChatLimiter(chatId: number): Bottleneck {
    let limiter = this.perChatLimiters.get(chatId)
    if (!limiter) {
      limiter = new Bottleneck({
        maxConcurrent: 1,
        minTime: config.SERVICES.ARAGON_TELEGRAM.RATE_LIMIT.PER_CHAT_MIN_TIME,
      })
      this.perChatLimiters.set(chatId, limiter)
    }
    return limiter
  }

  private async waitForPause(): Promise<void> {
    const remainingMs = this.pauseUntil - Date.now()
    if (remainingMs > 0) {
      await new Promise(resolve => setTimeout(resolve, remainingMs))
    }
  }

  private async handleSendError(err: unknown, telegramUserId: number): Promise<void> {
    if (err instanceof GrammyError) {
      if (err.error_code === 403) {
        const sub = await Models.TelegramSubscription.findByTelegramUserId(telegramUserId)
        await sub?.setStatus(ITelegramSubscriptionStatus.Blocked)
        return
      }

      if (err.error_code === 429) {
        const retryAfter = err.parameters?.retry_after ?? 1
        const horizon = Date.now() + (retryAfter + 1) * 1000
        if (horizon > this.pauseUntil) this.pauseUntil = horizon
        logger.warn(
          'telegram dispatcher: 429 — pausing all sends for retry_after',
          this.llo({ retry_after: retryAfter, pauseUntil: this.pauseUntil }),
        )
        return
      }
      logger.warn(
        'telegram dispatcher: telegram api error',
        this.llo({ code: err.error_code, description: err.description }),
      )
      return
    }
    if (err instanceof HttpError) {
      logger.warn('telegram dispatcher: network error', this.llo({ err: err.message }))
    }
  }
}
