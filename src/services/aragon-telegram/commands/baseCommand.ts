import { type FormattedString } from '@grammyjs/parse-mode'
import logger from '@logger'
import { type BotContext, type ITelegramServices } from '@services/aragon-telegram/types'
import { type Bot, type CommandContext, type Context } from 'grammy'

/**
 * Abstract base class for all Telegram command modules.
 *
 * Each module groups a feature-area of commands and callback handlers and
 * registers them on the grammy `Bot` via {@link register}. Modules share
 * services (description cache, etc.) injected at construction time and a
 * pre-bound `llo` for log metadata.
 */
export abstract class BaseCommand {
  protected readonly llo: (extra?: Record<string, any>) => Record<string, any>

  constructor(
    protected readonly services: ITelegramServices,
    serviceName: string,
  ) {
    this.llo = logger.logMeta.bind(null, { service: serviceName })
  }

  /** Wire all commands and callbacks owned by this module on the bot. */
  abstract register(bot: Bot<BotContext>): void

  /** Returns the Telegram user id, or `null` when the update has no user. */
  protected userId(ctx: Context): number | null {
    return ctx.from?.id ?? null
  }

  /** Returns the chat id, falling back to the user id (DM-only context). */
  protected chatId(ctx: Context): number {
    return ctx.chat?.id ?? ctx.from?.id ?? 0
  }

  /** Strip a fixed `prefix:` from a callback `data` string. */
  protected stripPrefix(data: string, prefix: string): string {
    return data.startsWith(prefix) ? data.slice(prefix.length) : data
  }

  /** Get the trimmed argument string passed to a `bot.command(…)` handler. */
  protected commandArg(ctx: CommandContext<BotContext>): string {
    return (typeof ctx.match === 'string' ? ctx.match : '').trim()
  }

  /**
   * Reply with a parse-mode `FormattedString` — sends `text` + `entities`
   * so we don't depend on the (removed) `hydrateReply` middleware.
   */
  protected async replyFmt(ctx: Context, fs: FormattedString, opts: Record<string, any> = {}): Promise<unknown> {
    return ctx.reply(fs.text, { ...opts, entities: fs.entities })
  }

  /** Same as {@link replyFmt} but for editing the message that fired a callback. */
  protected async editMessageFmt(ctx: Context, fs: FormattedString, opts: Record<string, any> = {}): Promise<unknown> {
    return ctx.editMessageText(fs.text, { ...opts, entities: fs.entities })
  }
}
