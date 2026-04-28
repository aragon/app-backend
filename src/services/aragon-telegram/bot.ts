import { limit as ratelimit } from '@grammyjs/ratelimiter'
import logger from '@logger'
import {
  type BaseCommand,
  DaoCommands,
  OnboardingCommands,
  PrivacyCommands,
  SubscriptionCommands,
} from '@services/aragon-telegram/commands'
import { DescriptionCache } from '@services/aragon-telegram/helpers/descriptionCache'
import { type BotContext, type ITelegramServices } from '@services/aragon-telegram/types'
import { Bot, GrammyError } from 'grammy'
import * as fs from 'node:fs/promises'

const HEARTBEAT_PATH = '/tmp/telegram-heartbeat'
const HEARTBEAT_INTERVAL_MS = 30_000

export class TelegramBotApp {
  private readonly llo = logger.logMeta.bind(null, { service: 'telegram:bot' })
  private readonly bot: Bot<BotContext>
  private readonly services: ITelegramServices
  private readonly commandModules: BaseCommand[]
  private heartbeatTimer: NodeJS.Timeout | null = null

  constructor(token: string) {
    this.bot = new Bot<BotContext>(token)
    this.services = {
      descriptionCache: new DescriptionCache(),
    }
    this.commandModules = [
      new OnboardingCommands(this.services),
      new SubscriptionCommands(this.services),
      new DaoCommands(this.services),
      new PrivacyCommands(this.services),
    ]
    this.installMiddleware()
    this.installCommands()
    this.installCallbacks()
    this.installErrorHandler()
  }

  /** Returns the underlying grammy api — used by the dispatcher to send DMs. */
  getApi(): Bot<BotContext>['api'] {
    return this.bot.api
  }

  /** Returns the dependency container so other modules can grab the description cache. */
  getServices(): ITelegramServices {
    return this.services
  }

  /** Register the BotFather command menu so Telegram clients can autocomplete. */
  async registerMenu(): Promise<void> {
    await this.bot.api.setMyCommands([
      { command: 'start', description: 'Start the bot / follow a DAO' },
      { command: 'subscribe', description: 'Subscribe to a DAO by id' },
      { command: 'unsubscribe', description: 'Unsubscribe from a DAO by id' },
      { command: 'dao', description: 'List your DAOs and toggle notifications' },
      { command: 'pause', description: 'Pause all notifications' },
      { command: 'resume', description: 'Resume notifications' },
      { command: 'mydata', description: 'Show what data we store on you' },
      { command: 'forget', description: 'Delete all your data' },
      { command: 'help', description: 'Show help' },
    ])
  }

  /** Begin long-polling. Returns when the bot has connected. */
  async startPolling(): Promise<void> {
    this.startHeartbeat()
    await this.bot.start({
      drop_pending_updates: true,
      onStart: info => {
        logger.info('Telegram bot polling started', this.llo({ username: info.username }))
      },
    })
  }

  async stop(): Promise<void> {
    this.stopHeartbeat()
    await this.bot.stop()
  }

  /**
   * Periodically pings Telegram (`getMe`) and touches a heartbeat file. The
   * docker-compose healthcheck reads that file's mtime; if it falls behind,
   * the container is restarted. This catches both polling-loop stalls and
   * `401 Unauthorized` from a rotated/invalid token, neither of which a plain
   * `pgrep` healthcheck would notice.
   */
  private startHeartbeat(): void {
    if (this.heartbeatTimer) return
    const tick = async () => {
      try {
        await this.bot.api.getMe()
        await fs.writeFile(HEARTBEAT_PATH, String(Date.now()))
      } catch (err) {
        if (err instanceof GrammyError && err.error_code === 429) {
          await fs.writeFile(HEARTBEAT_PATH, String(Date.now())).catch(() => undefined)
          logger.warn(
            'telegram heartbeat: 429 (bot-wide rate limit) — still healthy',
            this.llo({ retry_after: err.parameters?.retry_after }),
          )
          return
        }
        logger.warn('telegram heartbeat: getMe failed', this.llo({ err: (err as Error).message }))
      }
    }
    void tick()
    this.heartbeatTimer = setInterval(tick, HEARTBEAT_INTERVAL_MS)
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer)
      this.heartbeatTimer = null
    }
  }

  private installMiddleware(): void {
    this.bot.use((ctx, next) => {
      ctx.services = this.services
      return next()
    })

    this.bot.use(async (ctx, next) => {
      if (ctx.chat && ctx.chat.type !== 'private') {
        await ctx.reply('Hi! I only work in direct messages. Please DM me to follow your DAOs.').catch(() => undefined)
        return
      }
      return next()
    })

    this.bot.use(
      ratelimit({
        timeFrame: 2000,
        limit: 5,
        onLimitExceeded: async ctx => {
          await ctx.reply('Slow down a sec — try again in a moment.').catch(() => undefined)
        },
        keyGenerator: ctx => ctx.from?.id?.toString(),
      }),
    )
  }

  private installCommands(): void {
    for (const module of this.commandModules) module.register(this.bot)
  }

  private installCallbacks(): void {
    this.bot.callbackQuery(/^pd:/, async ctx => {
      const token = (ctx.callbackQuery.data ?? '').replace(/^pd:/, '')
      const description = this.services.descriptionCache.get(token)
      if (!description) {
        await ctx.answerCallbackQuery('Details no longer available — open the proposal in the app.')
        return
      }
      await ctx.answerCallbackQuery()
      await ctx.reply(description.slice(0, 4000)).catch(() => undefined)
    })
  }

  private installErrorHandler(): void {
    this.bot.catch(err => {
      logger.error('telegram bot error', this.llo({ err: err.error, update: err.ctx?.update?.update_id }))
      err.ctx?.reply?.('Something went wrong on my end. Please try again.').catch(() => undefined)
    })
  }
}
