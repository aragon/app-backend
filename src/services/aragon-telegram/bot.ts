import { autoRetry } from '@grammyjs/auto-retry'
import { limit as ratelimit } from '@grammyjs/ratelimiter'
import { run, type RunnerHandle } from '@grammyjs/runner'
import { apiThrottler } from '@grammyjs/transformer-throttler'
import logger from '@logger'
import {
  type BaseCommand,
  DaoCommands,
  OnboardingCommands,
  PrivacyCommands,
  SubscriptionCommands,
} from '@services/aragon-telegram/commands'
import { type BotContext } from '@services/aragon-telegram/types'
import { Bot } from 'grammy'

export class TelegramBotApp {
  private readonly llo = logger.logMeta.bind(null, { service: 'telegram:bot' })
  private readonly bot: Bot<BotContext>
  private readonly commandModules: BaseCommand[]
  private runnerHandle: RunnerHandle | null = null

  constructor(token: string) {
    this.bot = new Bot<BotContext>(token)
    // API transformers run on every outbound call.
    // - apiThrottler: preemptive Bottleneck queue aligned with Telegram's documented caps.
    // - autoRetry: catches 429s with retry_after + 5xx + network errors with exponential backoff.
    this.bot.api.config.use(apiThrottler())
    this.bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 60 }))
    this.commandModules = [
      new OnboardingCommands(),
      new SubscriptionCommands(),
      new DaoCommands(),
      new PrivacyCommands(),
    ]
    this.installMiddleware()
    this.installCommands()
    this.installErrorHandler()
  }

  /** Returns the underlying grammy api — used by the dispatcher to send DMs. */
  getApi(): Bot<BotContext>['api'] {
    return this.bot.api
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

  private installMiddleware(): void {
    this.bot.use(async (ctx, next) => {
      // Bot is DM-only. Silently ignore group/channel updates rather than
      // replying — replying into a group some admin added us to looks spammy.
      if (ctx.chat && ctx.chat.type !== 'private') return
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

  private installErrorHandler(): void {
    this.bot.catch(err => {
      logger.error('telegram bot error', this.llo({ err: err.error, update: err.ctx?.update?.update_id }))
      err.ctx?.reply?.('Something went wrong on my end. Please try again.').catch(() => undefined)
    })
  }
}
