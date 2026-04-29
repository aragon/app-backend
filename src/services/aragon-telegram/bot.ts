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
import { DescriptionCache } from '@services/aragon-telegram/helpers/descriptionCache'
import { type BotContext, type ITelegramServices } from '@services/aragon-telegram/types'
import { Bot } from 'grammy'

export class TelegramBotApp {
  private readonly llo = logger.logMeta.bind(null, { service: 'telegram:bot' })
  private readonly bot: Bot<BotContext>
  private readonly services: ITelegramServices
  private readonly commandModules: BaseCommand[]
  private runnerHandle: RunnerHandle | null = null

  constructor(token: string) {
    this.bot = new Bot<BotContext>(token)
    this.bot.api.config.use(apiThrottler())
    this.bot.api.config.use(autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 60 }))
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
    this.bot.use((ctx, next) => {
      ctx.services = this.services
      return next()
    })

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
