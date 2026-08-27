import { Models } from '@dbModels'
import { daoDetail, DAO_LIST_HEADER, NO_DAOS_TEXT } from '@services/aragon-telegram/commands/templates/dao'
import { replyFmt } from '@services/aragon-telegram/commands/util'
import { DaoIdParser } from '@services/aragon-telegram/helpers/daoId'
import { removeDaoSubscriptionAndCleanUp } from '@services/aragon-telegram/helpers/userData'
import { ITelegramSubscriptionStatus, TELEGRAM_DEFAULT_EVENTS } from '@types'
import { type Bot, type CallbackQueryContext, type Context, InlineKeyboard } from 'grammy'

interface ISubscriptionRow {
  daoId: string
  label: string
  paused: boolean
}

// Telegram caps callback_data at 64 bytes. Keep the prefix tiny so the longest
// network name + 0x-address still fits: `d:o:` (4) + `<network>-<0xaddr>` (≤59) = ≤63.
// o = open detail view, m = pause/resume toggle, r = unsubscribe, l = back to list.
const CB = { open: 'd:o:', mute: 'd:m:', remove: 'd:r:', list: 'd:l' } as const

const truncateLabel = (s: string): string => (s.length > 30 ? `${s.slice(0, 28)}…` : s)

const buildEmptyKeyboard = (): InlineKeyboard =>
  new InlineKeyboard().text('Subscribe to an organization', 'menu:subscribe')

const buildListKeyboard = (rows: ISubscriptionRow[]): InlineKeyboard => {
  const kb = new InlineKeyboard()
  for (const row of rows) {
    kb.text(truncateLabel(row.label), `${CB.open}${row.daoId}`).row()
  }
  kb.text('Subscribe to another organization', 'menu:subscribe')
  return kb
}

const buildDetailKeyboard = (daoId: string, paused: boolean): InlineKeyboard =>
  new InlineKeyboard()
    .text(paused ? 'Resume notifications' : 'Pause notifications', `${CB.mute}${daoId}`)
    .row()
    .text('Unsubscribe', `${CB.remove}${daoId}`)
    .row()
    .text('Back to notifications', CB.list)

const enrichSubs = async (subs: { daoId: string; events: unknown[] }[]): Promise<ISubscriptionRow[]> => {
  if (subs.length === 0) return []
  return await Promise.all(
    subs.map(async s => {
      const ref = DaoIdParser.parse(s.daoId)
      const paused = s.events.length === 0
      if (!ref) return { daoId: s.daoId, label: s.daoId, paused }
      const dao = await Models.Dao.findByAddress(ref.daoAddress, ref.network)
      return { daoId: s.daoId, label: dao?.name || s.daoId, paused }
    }),
  )
}

/** Render the list into an existing message (after a callback) or as a new reply. */
const renderList = async (ctx: Context, edit: boolean): Promise<void> => {
  const userId = ctx.from?.id
  if (!userId) return
  const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
  const empty = !sub || sub.subscriptions.length === 0

  const text = empty ? NO_DAOS_TEXT : DAO_LIST_HEADER
  const keyboard = empty ? buildEmptyKeyboard() : buildListKeyboard(await enrichSubs(sub!.subscriptions))

  if (edit) {
    await ctx.editMessageText(text.text, { entities: text.entities, reply_markup: keyboard }).catch(() => undefined)
    return
  }
  await replyFmt(ctx, text, { reply_markup: keyboard })
}

/** `/dao` — list subscriptions; selecting one opens its detail view. Exported so the menu router can forward `[Manage notifications]`. */
export const listHandler = async (ctx: Context): Promise<void> => {
  await renderList(ctx, false)
}

const renderDetail = async (ctx: Context, daoId: string, label: string, paused: boolean): Promise<void> => {
  const text = daoDetail(label, paused)
  await ctx
    .editMessageText(text.text, { entities: text.entities, reply_markup: buildDetailKeyboard(daoId, paused) })
    .catch(() => undefined)
}

const pauseHandler = async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id
  const sub = userId ? await Models.TelegramSubscription.findByTelegramUserId(userId) : null
  if (!sub) {
    await ctx.reply('Nothing to pause. Run /start first.')
    return
  }
  await sub.setStatus(ITelegramSubscriptionStatus.Paused)
  await ctx.reply('All notifications are paused. Use /resume to turn them back on.')
}

const resumeHandler = async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id
  const sub = userId ? await Models.TelegramSubscription.findByTelegramUserId(userId) : null
  if (!sub) {
    await ctx.reply('Nothing to resume. Run /start first.')
    return
  }
  await sub.setStatus(ITelegramSubscriptionStatus.Active)
  await ctx.reply('All notifications are on.')
}

const daoCallback = async (ctx: CallbackQueryContext<Context>): Promise<void> => {
  const userId = ctx.from?.id
  const data = ctx.callbackQuery.data
  if (!userId || !data) {
    await ctx.answerCallbackQuery()
    return
  }

  const [, action, ...rest] = data.split(':')

  if (action === 'l') {
    await ctx.answerCallbackQuery()
    await renderList(ctx, true)
    return
  }

  const daoId = rest.join(':')
  const ref = DaoIdParser.parse(daoId)
  if (!ref) {
    await ctx.answerCallbackQuery('Invalid organization ID')
    return
  }

  const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
  if (!sub) {
    await ctx.answerCallbackQuery('No subscription found')
    return
  }

  const existing = sub.subscriptions.find(s => s.daoId === daoId)
  if (!existing) {
    await ctx.answerCallbackQuery('No subscription found')
    return
  }

  const dao = await Models.Dao.findByAddress(ref.daoAddress, ref.network)
  const label = dao?.name || daoId

  switch (action) {
    case 'o': {
      await ctx.answerCallbackQuery()
      await renderDetail(ctx, daoId, label, existing.events.length === 0)
      return
    }
    case 'm': {
      const paused = existing.events.length === 0
      const events = paused ? TELEGRAM_DEFAULT_EVENTS : []
      await sub.setEvents(ref, events)
      await ctx.answerCallbackQuery(
        paused ? `Notifications are on for ${label}` : `Notifications are paused for ${label}`,
      )
      await renderDetail(ctx, daoId, label, !paused)
      return
    }
    case 'r': {
      await removeDaoSubscriptionAndCleanUp(sub, ref, userId)
      await ctx.answerCallbackQuery(`You're no longer subscribed to ${label}`)
      await renderList(ctx, true)
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
  bot.callbackQuery(/^d:(l$|[omr]:)/, daoCallback)
}
