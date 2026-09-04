import config from '@config'
import { autoRetry } from '@grammyjs/auto-retry'
import { limit as ratelimit } from '@grammyjs/ratelimiter'
import { type RunnerHandle, run } from '@grammyjs/runner'
import { apiThrottler } from '@grammyjs/transformer-throttler'
import logger from '@logger'
import { registerDao } from '@services/aragon-telegram/commands/daoCommands'
import { registerOnboarding } from '@services/aragon-telegram/commands/onboardingCommands'
import { registerPrivacy } from '@services/aragon-telegram/commands/privacyCommands'
import { handleSubscribeArgument, registerSubscription } from '@services/aragon-telegram/commands/subscriptionCommands'
import { DaoIdParser } from '@services/aragon-telegram/helpers/daoId'
import { NoticeCooldown } from '@services/aragon-telegram/helpers/noticeCooldown'
import { telegramErrorMeta } from '@services/aragon-telegram/helpers/telegramError'
import { Bot, type Context } from 'grammy'

export class TelegramBotApp {
  private readonly llo = logger.logMeta.bind(null, { service: 'telegram:bot' })
  private readonly bot: Bot<Context>
  private readonly notices = new NoticeCooldown(config.SERVICES.ARAGON_TELEGRAM.NOTICE_COOLDOWN_MS)
  private runnerHandle: RunnerHandle | null = null

  constructor(token: string) {
    this.bot = new Bot<Context>(token)
    this.bot.api.config.use(apiThrottler())
    this.bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 60 }))

    this.bot.use(async (ctx, next) => {
      if (ctx.chat && ctx.chat.type !== 'private') return
      return next()
    })

    this.bot.use(
      ratelimit({
        timeFrame: 2000,
        limit: 5,
        onLimitExceeded: async ctx => {
          const userId = ctx.from?.id
          if (userId && !this.notices.shouldNotify(userId)) return
          await ctx.reply('Too many messages. Try again in a moment.').catch(() => undefined)
        },
        keyGenerator: ctx => ctx.from?.id?.toString(),
      }),
    )

    registerOnboarding(this.bot)
    registerSubscription(this.bot)
    registerDao(this.bot)
    registerPrivacy(this.bot)

    // Runs after every command handler: a pasted organization reference is
    // treated as a subscribe request; anything else gets a pointer to /help
    // instead of silence. Name search stays behind /subscribe on purpose.
    this.bot.on('message:text', async ctx => {
      const userId = ctx.from?.id
      const text = ctx.message.text.trim()
      if (!userId || !text) return
      if (!text.startsWith('/') && (DaoIdParser.parse(text) || DaoIdParser.parseEns(text))) {
        await handleSubscribeArgument(ctx, text)
        return
      }
      if (!this.notices.shouldNotify(userId)) return
      await ctx
        .reply("That isn't a command this bot recognizes. Use /help to see what it can do.")
        .catch(() => undefined)
    })

    this.bot.catch(err => {
      logger.error(
        'telegram bot error',
        this.llo({ err: telegramErrorMeta(err.error), update: err.ctx?.update?.update_id }),
      )
      const userId = err.ctx?.from?.id
      if (userId && !this.notices.shouldNotify(userId)) return
      err.ctx?.reply?.('Something went wrong. Try again.').catch(() => undefined)
    })
  }

  /** Returns the underlying grammy api — used by the dispatcher to send DMs. */
  getApi(): Bot<Context>['api'] {
    return this.bot.api
  }

  /** True while the runner's getUpdates loop is alive. */
  isRunning(): boolean {
    return this.runnerHandle?.isRunning() ?? false
  }

  /** Register the BotFather command menu so Telegram clients can autocomplete. */
  async registerMenu(): Promise<void> {
    await this.bot.api.setMyCommands([
      { command: 'start', description: 'Set up notifications' },
      { command: 'subscribe', description: 'Subscribe to an organization' },
      { command: 'unsubscribe', description: 'Unsubscribe from an organization' },
      { command: 'subscriptions', description: 'Manage your notifications' },
      { command: 'pause', description: 'Pause all notifications' },
      { command: 'resume', description: 'Resume all notifications' },
      { command: 'mydata', description: 'View the data stored by this bot' },
      { command: 'forget', description: 'Delete the data stored by this bot' },
      { command: 'privacy', description: 'View the privacy policy' },
      { command: 'help', description: 'View this help message' },
    ])
  }

  /**
   * Begin polling via the grammy runner — concurrent update processing.
   * Returns immediately; the runner drives the getUpdates loop in the background.
   */
  start(): void {
    this.runnerHandle = run(this.bot)
    logger.info('Telegram bot runner started', this.llo({}))
  }

  async stop(): Promise<void> {
    if (this.runnerHandle) {
      await this.runnerHandle.stop()
      this.runnerHandle = null
    }
  }
}
