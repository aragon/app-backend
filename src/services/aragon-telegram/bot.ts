import { autoRetry } from '@grammyjs/auto-retry'
import { limit as ratelimit } from '@grammyjs/ratelimiter'
import { run, type RunnerHandle } from '@grammyjs/runner'
import { apiThrottler } from '@grammyjs/transformer-throttler'
import logger from '@logger'
import { registerDao } from '@services/aragon-telegram/commands/daoCommands'
import { registerOnboarding } from '@services/aragon-telegram/commands/onboardingCommands'
import { registerPrivacy } from '@services/aragon-telegram/commands/privacyCommands'
import { registerSubscription } from '@services/aragon-telegram/commands/subscriptionCommands'
import { Bot, type Context } from 'grammy'

export class TelegramBotApp {
  private readonly llo = logger.logMeta.bind(null, { service: 'telegram:bot' })
  private readonly bot: Bot<Context>
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
          await ctx.reply('Slow down a sec — try again in a moment.').catch(() => undefined)
        },
        keyGenerator: ctx => ctx.from?.id?.toString(),
      }),
    )

    registerOnboarding(this.bot)
    registerSubscription(this.bot)
    registerDao(this.bot)
    registerPrivacy(this.bot)

    this.bot.catch(err => {
      logger.error('telegram bot error', this.llo({ err: err.error, update: err.ctx?.update?.update_id }))
      err.ctx?.reply?.('Something went wrong on my end. Please try again.').catch(() => undefined)
    })
  }

  /** Returns the underlying grammy api — used by the dispatcher to send DMs. */
  getApi(): Bot<Context>['api'] {
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
      { command: 'privacy', description: 'Privacy & data policy' },
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
}
