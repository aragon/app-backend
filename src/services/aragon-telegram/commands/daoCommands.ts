import { Models } from '@dbModels'
import { daoDetail, daoListHeader, NO_DAOS_TEXT } from '@services/aragon-telegram/commands/templates/dao'
import { LAST_SUBSCRIPTION_REMOVED } from '@services/aragon-telegram/commands/templates/shared'
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
// o = open detail view, m = pause/resume toggle, r = unsubscribe, l = back to list, g = go to list page.
const CB = { open: 'd:o:', mute: 'd:m:', remove: 'd:r:', list: 'd:l', page: 'd:g:' } as const

/** Rows per list page — the cap allows 200 subscriptions, far past a usable single keyboard. */
export const DAO_LIST_PAGE_SIZE = 10

const truncateLabel = (s: string): string => (s.length > 30 ? `${s.slice(0, 28)}…` : s)

const buildEmptyKeyboard = (): InlineKeyboard =>
  new InlineKeyboard().text('Subscribe to an organization', 'menu:subscribe')

const buildListKeyboard = (rows: ISubscriptionRow[], page: number, pageCount: number): InlineKeyboard => {
  const kb = new InlineKeyboard()
  for (const row of rows) {
    kb.text(truncateLabel(row.label), `${CB.open}${row.daoId}`).row()
  }
  if (pageCount > 1) {
    if (page > 0) kb.text('Previous', `${CB.page}${page - 1}`)
    if (page < pageCount - 1) kb.text('Next', `${CB.page}${page + 1}`)
    kb.row()
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

/** Resolve organization names for one page of subscriptions with a single query. */
const enrichSubs = async (subs: { daoId: string; events: unknown[] }[]): Promise<ISubscriptionRow[]> => {
  if (subs.length === 0) return []
  const refs = subs
    .map(s => ({ daoId: s.daoId, ref: DaoIdParser.parse(s.daoId) }))
    .filter((r): r is { daoId: string; ref: NonNullable<ReturnType<typeof DaoIdParser.parse>> } => r.ref !== null)
  const daos =
    refs.length === 0
      ? []
      : await Models.Dao.find(
          { $or: refs.map(({ ref }) => ({ address: ref.daoAddress, network: ref.network })) },
          { _id: 0, address: 1, network: 1, name: 1 },
        )
  const names = new Map<string, string>(daos.map(dao => [`${dao.network}-${dao.address}`, dao.name]))
  return subs.map(s => ({ daoId: s.daoId, label: names.get(s.daoId) || s.daoId, paused: s.events.length === 0 }))
}

/** Render one list page into an existing message (after a callback) or as a new reply. */
const renderList = async (ctx: Context, edit: boolean, page = 0): Promise<void> => {
  const userId = ctx.from?.id
  if (!userId) return
  const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
  const empty = !sub || sub.subscriptions.length === 0

  let text = NO_DAOS_TEXT
  let keyboard = buildEmptyKeyboard()
  if (!empty) {
    const pageCount = Math.ceil(sub!.subscriptions.length / DAO_LIST_PAGE_SIZE)
    // Clamp: a stale Next button can point past the end after unsubscribes.
    const current = Math.min(Math.max(page, 0), pageCount - 1)
    const rows = await enrichSubs(
      sub!.subscriptions.slice(current * DAO_LIST_PAGE_SIZE, (current + 1) * DAO_LIST_PAGE_SIZE),
    )
    text = daoListHeader(current, pageCount)
    keyboard = buildListKeyboard(rows, current, pageCount)
  }

  if (edit) {
    await ctx.editMessageText(text.text, { entities: text.entities, reply_markup: keyboard }).catch(() => undefined)
    return
  }
  await replyFmt(ctx, text, { reply_markup: keyboard })
}

/** `/subscriptions` — list subscriptions; selecting one opens its detail view. Exported so the menu router can forward `[Manage notifications]`. */
export const listHandler = async (ctx: Context): Promise<void> => {
  await renderList(ctx, false)
}

interface IDetailView {
  paused: boolean
  accountPaused: boolean
  edit: boolean
}

const renderDetail = async (ctx: Context, daoId: string, label: string, view: IDetailView): Promise<void> => {
  const text = daoDetail(label, view.paused, view.accountPaused)
  const keyboard = buildDetailKeyboard(daoId, view.paused)
  if (view.edit) {
    await ctx.editMessageText(text.text, { entities: text.entities, reply_markup: keyboard }).catch(() => undefined)
    return
  }
  await replyFmt(ctx, text, { reply_markup: keyboard })
}

/**
 * Open the detail view as a new message. Used when a subscribe request names an
 * organization the user already follows, so a repeat subscribe cannot quietly
 * re-enable notifications the user had paused.
 */
export const replyDaoDetail = async (
  ctx: Context,
  daoId: string,
  label: string,
  paused: boolean,
  accountPaused: boolean,
): Promise<void> => {
  await renderDetail(ctx, daoId, label, { paused, accountPaused, edit: false })
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

  if (action === 'g') {
    await ctx.answerCallbackQuery()
    await renderList(ctx, true, Number.parseInt(rest[0], 10) || 0)
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
  const accountPaused = sub.status === ITelegramSubscriptionStatus.Paused

  switch (action) {
    case 'o': {
      await ctx.answerCallbackQuery()
      await renderDetail(ctx, daoId, label, { paused: existing.events.length === 0, accountPaused, edit: true })
      return
    }
    case 'm': {
      const paused = existing.events.length === 0
      const events = paused ? TELEGRAM_DEFAULT_EVENTS : []
      await sub.setEvents(ref, events)
      // A resume during the account-wide /pause enables the organization but delivers
      // nothing yet — a bare "on" toast would claim otherwise.
      const resumedToast = accountPaused
        ? `Notifications are on for ${label}, but all notifications are paused for your account`
        : `Notifications are on for ${label}`
      await ctx.answerCallbackQuery(paused ? resumedToast : `Notifications are paused for ${label}`)
      await renderDetail(ctx, daoId, label, { paused: !paused, accountPaused, edit: true })
      return
    }
    case 'r': {
      const deletedUserData = await removeDaoSubscriptionAndCleanUp(sub, ref, userId)
      await ctx.answerCallbackQuery(`You're no longer subscribed to ${label}`)
      await renderList(ctx, true)
      // The last subscription takes the whole record with it, consent included.
      if (deletedUserData) await ctx.reply(LAST_SUBSCRIPTION_REMOVED)
      return
    }
    default:
      await ctx.answerCallbackQuery()
  }
}

export const registerDao = (bot: Bot<Context>): void => {
  bot.command('subscriptions', listHandler)
  bot.command('pause', pauseHandler)
  bot.command('resume', resumeHandler)
  bot.callbackQuery(/^d:(l$|g:|[omr]:)/, daoCallback)
}
