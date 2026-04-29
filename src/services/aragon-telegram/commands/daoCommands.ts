import { bold, fmt } from '@grammyjs/parse-mode'
import { Models } from '@dbModels'
import { BaseCommand } from '@services/aragon-telegram/commands/baseCommand'
import { DaoIdParser } from '@services/aragon-telegram/helpers/daoId'
import { type BotContext } from '@services/aragon-telegram/types'
import { ITelegramSubscriptionStatus, TELEGRAM_DEFAULT_EVENTS } from '@types'
import { type Bot, InlineKeyboard } from 'grammy'

interface ISubscriptionRow {
  daoId: string
  label: string
  muted: boolean
}

// Telegram caps callback_data at 64 bytes. Keep the prefix tiny so the longest
// network name + 0x-address still fits: `d:o:` (4) + `<network>-<0xaddr>` (≤59) = ≤63.
const CB = { open: 'd:o:', mute: 'd:m:', remove: 'd:r:' } as const

const HEADER = fmt`${bold('Your DAOs')} — tap 🔔 to mute/unmute, ❌ to unsubscribe:`
const NO_DAOS_HEADER = "You're not following any DAOs yet."

/**
 * The DAO management surface: `/dao` (list with action buttons), the inline
 * callbacks behind those buttons, and global `/pause` / `/resume`.
 */
export class DaoCommands extends BaseCommand {
  constructor(services: ConstructorParameters<typeof BaseCommand>[0]) {
    super(services, 'telegram:dao')
  }

  register(bot: Bot<BotContext>): void {
    bot.command('dao', ctx => this.list(ctx))
    bot.command('pause', ctx => this.pause(ctx))
    bot.command('resume', ctx => this.resume(ctx))
    bot.callbackQuery(/^d:[omr]:/, ctx => this.callback(ctx))
  }

  /** Public so the menu router can forward `[📋 My DAOs]` to it. */
  async list(ctx: BotContext): Promise<void> {
    const userId = this.userId(ctx)
    if (!userId) return

    const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
    await sub?.touchInteraction()

    if (!sub || sub.subscriptions.length === 0) {
      await ctx.reply(NO_DAOS_HEADER, { reply_markup: this.buildEmptyKeyboard() })
      return
    }

    const rows = await this.enrichSubs(sub.subscriptions)
    await ctx.replyFmt(HEADER, { reply_markup: this.buildKeyboard(rows) })
  }

  private async pause(ctx: BotContext): Promise<void> {
    const userId = this.userId(ctx)
    const sub = userId ? await Models.TelegramSubscription.findByTelegramUserId(userId) : null
    if (!sub) {
      await ctx.reply('Nothing to pause — run /start first.')
      return
    }
    await sub.setStatus(ITelegramSubscriptionStatus.Paused)
    await ctx.reply('⏸ Notifications paused. Run /resume to turn them back on.')
  }

  private async resume(ctx: BotContext): Promise<void> {
    const userId = this.userId(ctx)
    const sub = userId ? await Models.TelegramSubscription.findByTelegramUserId(userId) : null
    if (!sub) {
      await ctx.reply('Nothing to resume — run /start first.')
      return
    }
    await sub.setStatus(ITelegramSubscriptionStatus.Active)
    await ctx.reply('▶️ Notifications resumed.')
  }

  private async callback(ctx: BotContext): Promise<void> {
    const userId = this.userId(ctx)
    const data = ctx.callbackQuery?.data
    if (!userId || !data) {
      await ctx.answerCallbackQuery()
      return
    }

    const [, action, ...rest] = data.split(':')
    const daoId = rest.join(':')
    const ref = DaoIdParser.parse(daoId)
    if (!ref) {
      await ctx.answerCallbackQuery('Invalid DAO id')
      return
    }

    const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
    if (!sub) {
      await ctx.answerCallbackQuery('No subscription found')
      return
    }

    switch (action) {
      case 'm': {
        const existing = sub.subscriptions.find(s => s.daoId === daoId)
        const muted = !existing || existing.events.length === 0
        const events = muted ? TELEGRAM_DEFAULT_EVENTS : []
        await sub.setEvents(ref, events)
        await ctx.answerCallbackQuery(muted ? 'Notifications enabled' : 'Notifications muted')
        await this.refreshKeyboard(ctx)
        return
      }
      case 'r': {
        await sub.removeDaoSubscription(ref)
        await ctx.answerCallbackQuery('Unsubscribed')
        await this.refreshKeyboard(ctx)
        return
      }
      case 'o': {
        const dao = await Models.Dao.findByAddress(ref.daoAddress, ref.network)
        const name = dao?.name || daoId
        const muted = sub.subscriptions.find(s => s.daoId === daoId)?.events.length === 0
        await ctx.answerCallbackQuery(`Active: ${name}`)
        await ctx
          .replyFmt(fmt`${bold(name)}\n\n${muted ? '🔕 Notifications are muted.' : '🔔 Notifications are on.'}`)
          .catch(() => undefined)
        return
      }
      default:
        await ctx.answerCallbackQuery()
    }
  }

  private async refreshKeyboard(ctx: BotContext): Promise<void> {
    const userId = this.userId(ctx)
    if (!userId) return
    const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
    if (!sub || sub.subscriptions.length === 0) {
      await ctx.editMessageText(NO_DAOS_HEADER, { reply_markup: this.buildEmptyKeyboard() }).catch(() => undefined)
      return
    }
    const rows = await this.enrichSubs(sub.subscriptions)
    await ctx.editMessageReplyMarkup({ reply_markup: this.buildKeyboard(rows) }).catch(() => undefined)
  }

  private async enrichSubs(subs: { daoId: string; events: unknown[] }[]): Promise<ISubscriptionRow[]> {
    if (subs.length === 0) return []
    return await Promise.all(
      subs.map(async s => {
        const ref = DaoIdParser.parse(s.daoId)
        const muted = s.events.length === 0
        if (!ref) return { daoId: s.daoId, label: s.daoId, muted }
        const dao = await Models.Dao.findByAddress(ref.daoAddress, ref.network)
        return { daoId: s.daoId, label: dao?.name || s.daoId, muted }
      }),
    )
  }

  private buildKeyboard(rows: ISubscriptionRow[]): InlineKeyboard {
    const kb = new InlineKeyboard()
    for (const row of rows) {
      const bell = row.muted ? '🔕' : '🔔'
      kb.text(this.truncateLabel(row.label), `${CB.open}${row.daoId}`)
        .text(bell, `${CB.mute}${row.daoId}`)
        .text('❌', `${CB.remove}${row.daoId}`)
        .row()
    }
    kb.text('🔔 Subscribe to another DAO', 'menu:subscribe')
    return kb
  }

  private buildEmptyKeyboard(): InlineKeyboard {
    return new InlineKeyboard().text('🔔 Subscribe to a DAO', 'menu:subscribe').text('❔ Help', 'menu:help')
  }

  private truncateLabel(s: string): string {
    return s.length > 30 ? `${s.slice(0, 28)}…` : s
  }
}
