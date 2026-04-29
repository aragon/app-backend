import { b, fmt } from '@grammyjs/parse-mode'
import { Models } from '@dbModels'
import { DAO_LIST_HEADER, NO_DAOS_HEADER } from '@services/aragon-telegram/commands/templates/dao'
import { replyFmt } from '@services/aragon-telegram/commands/util'
import { DaoIdParser } from '@services/aragon-telegram/helpers/daoId'
import { ITelegramSubscriptionStatus, TELEGRAM_DEFAULT_EVENTS } from '@types'
import { type Bot, type CallbackQueryContext, type Context, InlineKeyboard } from 'grammy'

interface ISubscriptionRow {
  daoId: string
  label: string
  muted: boolean
}

// Telegram caps callback_data at 64 bytes. Keep the prefix tiny so the longest
// network name + 0x-address still fits: `d:o:` (4) + `<network>-<0xaddr>` (≤59) = ≤63.
const CB = { open: 'd:o:', mute: 'd:m:', remove: 'd:r:' } as const

const truncateLabel = (s: string): string => (s.length > 30 ? `${s.slice(0, 28)}…` : s)

const buildEmptyKeyboard = (): InlineKeyboard =>
  new InlineKeyboard().text('🔔 Subscribe to a DAO', 'menu:subscribe').text('❔ Help', 'menu:help')

const buildKeyboard = (rows: ISubscriptionRow[]): InlineKeyboard => {
  const kb = new InlineKeyboard()
  for (const row of rows) {
    const bell = row.muted ? '🔕' : '🔔'
    kb.text(truncateLabel(row.label), `${CB.open}${row.daoId}`)
      .text(bell, `${CB.mute}${row.daoId}`)
      .text('❌', `${CB.remove}${row.daoId}`)
      .row()
  }
  kb.text('🔔 Subscribe to another DAO', 'menu:subscribe')
  return kb
}

const enrichSubs = async (subs: { daoId: string; events: unknown[] }[]): Promise<ISubscriptionRow[]> => {
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

const refreshKeyboard = async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id
  if (!userId) return
  const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
  if (!sub || sub.subscriptions.length === 0) {
    await ctx.editMessageText(NO_DAOS_HEADER, { reply_markup: buildEmptyKeyboard() }).catch(() => undefined)
    return
  }
  const rows = await enrichSubs(sub.subscriptions)
  await ctx.editMessageReplyMarkup({ reply_markup: buildKeyboard(rows) }).catch(() => undefined)
}

/** `/dao` — list subscriptions with mute/unsubscribe inline buttons. Exported so the menu router can forward `[📋 My DAOs]`. */
export const listHandler = async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id
  if (!userId) return

  const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
  if (!sub || sub.subscriptions.length === 0) {
    await ctx.reply(NO_DAOS_HEADER, { reply_markup: buildEmptyKeyboard() })
    return
  }

  const rows = await enrichSubs(sub.subscriptions)
  await replyFmt(ctx, DAO_LIST_HEADER, { reply_markup: buildKeyboard(rows) })
}

const pauseHandler = async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id
  const sub = userId ? await Models.TelegramSubscription.findByTelegramUserId(userId) : null
  if (!sub) {
    await ctx.reply('Nothing to pause — run /start first.')
    return
  }
  await sub.setStatus(ITelegramSubscriptionStatus.Paused)
  await ctx.reply('⏸ Notifications paused. Run /resume to turn them back on.')
}

const resumeHandler = async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id
  const sub = userId ? await Models.TelegramSubscription.findByTelegramUserId(userId) : null
  if (!sub) {
    await ctx.reply('Nothing to resume — run /start first.')
    return
  }
  await sub.setStatus(ITelegramSubscriptionStatus.Active)
  await ctx.reply('▶️ Notifications resumed.')
}

const daoCallback = async (ctx: CallbackQueryContext<Context>): Promise<void> => {
  const userId = ctx.from?.id
  const data = ctx.callbackQuery.data
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
      await refreshKeyboard(ctx)
      return
    }
    case 'r': {
      await sub.removeDaoSubscription(ref)
      await ctx.answerCallbackQuery('Unsubscribed')
      await refreshKeyboard(ctx)
      return
    }
    case 'o': {
      const dao = await Models.Dao.findByAddress(ref.daoAddress, ref.network)
      const name = dao?.name || daoId
      const muted = sub.subscriptions.find(s => s.daoId === daoId)?.events.length === 0
      await ctx.answerCallbackQuery(`Active: ${name}`)
      await replyFmt(
        ctx,
        fmt`${b}${name}${b}\n\n${muted ? '🔕 Notifications are muted.' : '🔔 Notifications are on.'}`,
      ).catch(() => undefined)
      return
    }
    default:
      await ctx.answerCallbackQuery()
  }
}

export const registerDao = (bot: Bot<Context>): void => {
  bot.command('dao', listHandler)
  bot.command('pause', pauseHandler)
  bot.command('resume', resumeHandler)
  bot.callbackQuery(/^d:[omr]:/, daoCallback)
}
