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
 */
export class NotificationDispatcher {
  private readonly llo: any
  private readonly globalLimiter: Bottleneck
  private readonly perChatLimiters = new Map<number, Bottleneck>()

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
      try {
        await this.handle(data)
      } catch (err) {
        logger.error('telegram dispatcher: failed to handle message', this.llo({ err, id: data?.id }))
      }
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

    const rendered = this.renderer.render(msg)
    const ttlSeconds = config.SERVICES.ARAGON_TELEGRAM.DEDUP_TTL_SECONDS

    await Promise.all(
      subscribers.map(async sub => {
        try {
          // Claim the (eventId, user) pair first; on RabbitMQ redelivery this
          // returns false and we skip the duplicate send.
          const isFirstTime = await Models.NotificationDispatched.claim(msg.id, sub.telegramUserId, ttlSeconds)
          if (!isFirstTime) return

          await this.sendToChat(sub.chatId, sub.telegramUserId, rendered)
        } catch (err) {
          logger.warn(
            'telegram dispatcher: send failed',
            this.llo({ err, userHash: UserIdHash.of(sub.telegramUserId) }),
          )
        }
      }),
    )
  }

  private isValidPayload(msg: IQueueTelegramNotification): boolean {
    return Boolean(msg?.event && VALID_EVENTS.has(msg.event) && msg.network && msg.daoAddress)
  }

  private async sendToChat(chatId: number, telegramUserId: number, rendered: IRenderedNotification): Promise<void> {
    const send = () =>
      this.api.sendMessage(chatId, rendered.text, {
        parse_mode: 'MarkdownV2',
        reply_markup: rendered.keyboard,
        link_preview_options: { is_disabled: true },
      })

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

  private async handleSendError(err: unknown, telegramUserId: number): Promise<void> {
    if (err instanceof GrammyError) {
      // 403 = user blocked the bot or deactivated the chat
      if (err.error_code === 403) {
        const sub = await Models.TelegramSubscription.findByTelegramUserId(telegramUserId)
        await sub?.setStatus(ITelegramSubscriptionStatus.Blocked)
        return
      }
      // 429 — the global+per-chat Bottleneck queues keep us under the cap by construction.
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
