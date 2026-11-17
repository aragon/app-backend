import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import { listHandler as daoListHandler, replyDaoDetail } from '@services/aragon-telegram/commands/daoCommands'
import {
  COLD_START,
  HELP_TEXT,
  SUBSCRIBE_HELP,
  SUBSCRIPTION_CONFIRMATION_CANCELLED,
  subscriptionConfirmationPrompt,
} from '@services/aragon-telegram/commands/templates/onboarding'
import {
  alreadySubscribedReply,
  searchSubscribedReply,
  subscribedReply,
} from '@services/aragon-telegram/commands/templates/subscription'
import { daoAppUrl, lloFor, replyFmt, userHash } from '@services/aragon-telegram/commands/util'
import { appBaseUrl, knownAppCode } from '@services/aragon-telegram/helpers/appUrl'
import { APP_CODE_SUFFIX_RE, DaoIdParser, type IParsedDaoRef } from '@services/aragon-telegram/helpers/daoId'
import {
  ITelegramSubscriptionStatus,
  TELEGRAM_CONFIRMATION_ACTIONS,
  TELEGRAM_CONSENT_VERSION,
  TELEGRAM_DEFAULT_EVENTS,
} from '@types'
import { type Bot, type CallbackQueryContext, type CommandContext, type Context, InlineKeyboard } from 'grammy'

const llo = lloFor('telegram:onboarding')

const ACTION = TELEGRAM_CONFIRMATION_ACTIONS

// Telegram caps callback_data at 64 bytes: `c:s:` (4) + `<network>-<0xaddr>` (≤60) = ≤64.
// `c:q:` marks a confirmation that started from a search pick, so the reply after
// consent can still echo the organization id the way a direct pick does.
const CB = { subscribe: `c:${ACTION.subscribe}:`, searchSubscribe: `c:${ACTION.searchSubscribe}:` } as const

// The app of a direct pick rides in the action letter, so the data never outgrows the default one:
// `c:s:` is the default app, `c:<code>:` (e.g. `c:o:`) an alternate app. A search pick never names an app.
const confirmationAction = (appCode: string | undefined, fromSearch: boolean): string => {
  if (fromSearch) return CB.searchSubscribe
  return appCode ? `c:${appCode}:` : CB.subscribe
}

const decodeConfirmationAction = (action: string): { appCode?: string; fromSearch: boolean } | null => {
  if (action === ACTION.subscribe) return { fromSearch: false }
  if (action === ACTION.searchSubscribe) return { fromSearch: true }
  if (action === ACTION.cancel || !/^[a-z]$/.test(action)) return null
  return { appCode: knownAppCode(action), fromSearch: false }
}

const buildWelcomeKeyboard = (appCode?: string): InlineKeyboard =>
  new InlineKeyboard()
    .text('Subscribe to an organization', 'menu:subscribe')
    .row()
    .text('Manage notifications', 'menu:list')
    .row()
    .url('Open Aragon', appBaseUrl(appCode))
    .text('Help', 'menu:help')

export const buildSubscriptionConfirmationKeyboard = (
  daoId: string,
  fromSearch = false,
  appCode?: string,
): InlineKeyboard =>
  new InlineKeyboard()
    .url('Privacy policy', config.SERVICES.ARAGON_TELEGRAM.PRIVACY_URL)
    .row()
    .text('Agree and subscribe', `${confirmationAction(appCode, fromSearch)}${daoId}`)

const buildSubscribedKeyboard = (ref: IParsedDaoRef): InlineKeyboard =>
  new InlineKeyboard().text('Manage notifications', 'menu:list').url('Open in Aragon', daoAppUrl(ref))

/** A search pick already showed the organization; the reply only needs the app link. */
const buildSearchSubscribedKeyboard = (ref: IParsedDaoRef): InlineKeyboard =>
  new InlineKeyboard().url('Open in Aragon', daoAppUrl(ref))

/** Find-or-create the recipient only after a user confirms a subscription. */
const ensureSubscriptionRecipient = async (ctx: Context, userId: number) => {
  let sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
  if (!sub) {
    try {
      sub = await Models.TelegramSubscription.create({
        telegramUserId: userId,
        chatId: ctx.chat?.id ?? userId,
      })
    } catch (err) {
      // Concurrent callback deliveries can both observe no record. The unique
      // recipient index elects a winner; reload it rather than creating twice.
      if ((err as { code?: number }).code !== 11000) throw err
      sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
      if (!sub) throw err
    }
  } else if (sub.status === ITelegramSubscriptionStatus.Blocked) {
    await sub.setStatus(ITelegramSubscriptionStatus.Active)
  }
  await sub.recordConsent(TELEGRAM_CONSENT_VERSION)
  return sub
}

export interface ISubscribeOptions {
  /** The request came from a search-result pick: echo the id so the user can verify the choice. */
  fromSearch?: boolean
  /** The request names an app (`ref.appCode`, none = the default app): an existing subscription moves to it. */
  updateApp?: boolean
}

const subscribeAndReply = async (
  ctx: Context,
  sub: any,
  ref: IParsedDaoRef,
  daoName: string,
  opts: ISubscribeOptions = {},
): Promise<void> => {
  if (sub.hasDaoSubscription(ref)) {
    // Only a named alternate app moves an existing subscription; the default app is never named here.
    const appCode = knownAppCode(ref.appCode)
    if (opts.updateApp && appCode) await sub.setAppCode(ref, appCode)
    await replyFmt(ctx, alreadySubscribedReply(daoName))
    return
  }
  try {
    await sub.addDaoSubscription({
      network: ref.network,
      daoAddress: ref.daoAddress,
      events: TELEGRAM_DEFAULT_EVENTS,
      appCode: knownAppCode(ref.appCode),
    })
  } catch (err) {
    logger.warn('telegram:onboarding addDaoSubscription failed', llo({ err, userHash: userHash(ctx.from!.id) }))
    await ctx.reply(`Couldn't subscribe to this organization: ${(err as Error).message}`)
    return
  }
  if (opts.fromSearch) {
    const daoId = Models.TelegramSubscription.getDaoId(ref)
    await replyFmt(ctx, searchSubscribedReply(daoName, daoId), { reply_markup: buildSearchSubscribedKeyboard(ref) })
    return
  }
  await replyFmt(ctx, subscribedReply(daoName), { reply_markup: buildSubscribedKeyboard(ref) })
}

/**
 * Entry point for every subscribe request (deep link, /subscribe, search pick,
 * pasted reference). Consent is collected once: a user without a record, or
 * with a stale consent version, sees the disclosure and must agree before
 * anything is written. A consented user is subscribed immediately, and one who
 * already follows the organization gets its detail view so a repeat request
 * cannot quietly re-enable notifications they paused.
 */
export const requestSubscriptionConfirmation = async (
  ctx: Context,
  ref: IParsedDaoRef,
  daoName: string,
  opts: ISubscribeOptions = {},
): Promise<void> => {
  const daoId = Models.TelegramSubscription.getDaoId(ref)
  const userId = ctx.from?.id
  const sub = userId ? await Models.TelegramSubscription.findByTelegramUserId(userId) : null

  if (sub?.consent?.version === TELEGRAM_CONSENT_VERSION) {
    // Asking for an organization is a comeback signal from a user who blocked us.
    if (sub.status === ITelegramSubscriptionStatus.Blocked) {
      await sub.setStatus(ITelegramSubscriptionStatus.Active)
    }
    const existing = sub.subscriptions.find(s => s.daoId === daoId)
    if (existing) {
      const accountPaused = sub.status === ITelegramSubscriptionStatus.Paused
      const appCode = opts.updateApp ? knownAppCode(ref.appCode) : existing.appCode
      if (appCode !== existing.appCode) await sub.setAppCode(ref, appCode)
      await replyDaoDetail(ctx, daoId, daoName, existing.events.length === 0, accountPaused, appCode)
      return
    }
    await subscribeAndReply(ctx, sub, ref, daoName, opts)
    return
  }

  await replyFmt(ctx, subscriptionConfirmationPrompt(daoName), {
    reply_markup: buildSubscriptionConfirmationKeyboard(daoId, opts.fromSearch, ref.appCode),
  })
}

/**
 * `/start [<deep-link>]` — entry point. A bare start shows the welcome menu
 * without persisting data; deep-link subscriptions present their disclosure
 * before the user can confirm.
 */
export const startHandler = async (ctx: CommandContext<Context>): Promise<void> => {
  const userId = ctx.from?.id
  if (!userId) return

  const payload = (typeof ctx.match === 'string' ? ctx.match : '').trim()
  const parsedRef = payload ? DaoIdParser.parse(payload) : null
  // A payload may carry only an app code (`_<code>`). An unknown code subscribes to the default app
  // but never moves an existing subscription.
  const payloadCode = parsedRef ? parsedRef.appCode : APP_CODE_SUFFIX_RE.exec(payload)?.[1]
  const appCode = knownAppCode(payloadCode)

  if (!parsedRef) {
    const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
    if (sub?.status === ITelegramSubscriptionStatus.Blocked) {
      await sub.setStatus(ITelegramSubscriptionStatus.Active)
    }
    await replyFmt(ctx, COLD_START, { reply_markup: buildWelcomeKeyboard(appCode) })
    return
  }

  const daoRef = { network: parsedRef.network, daoAddress: parsedRef.daoAddress, appCode }
  const dao = await Models.Dao.findByAddress(daoRef.daoAddress, daoRef.network)
  if (!dao) {
    await ctx.reply('Organization not found. Check the link and try again.')
    return
  }
  const name = dao.name || `${daoRef.network} DAO`
  await requestSubscriptionConfirmation(ctx, daoRef, name, { updateApp: !payloadCode || appCode !== undefined })
}

export const subscriptionConfirmationCallback = async (ctx: CallbackQueryContext<Context>): Promise<void> => {
  const userId = ctx.from?.id
  const data = ctx.callbackQuery.data
  if (!userId || !data) {
    await ctx.answerCallbackQuery().catch(() => undefined)
    return
  }

  const [, action, ...rest] = data.split(':')
  const confirmation = decodeConfirmationAction(action)

  if (confirmation) {
    const parsed = DaoIdParser.parse(rest.join(':'))
    if (!parsed) {
      await ctx.answerCallbackQuery('Invalid organization ID').catch(() => undefined)
      return
    }
    const ref = { network: parsed.network, daoAddress: parsed.daoAddress, appCode: confirmation.appCode }
    const dao = await Models.Dao.findByAddress(ref.daoAddress, ref.network)
    if (!dao) {
      await ctx.answerCallbackQuery().catch(() => undefined)
      await ctx.reply('Organization not found. Check the link and try again.').catch(() => undefined)
      return
    }
    const sub = await ensureSubscriptionRecipient(ctx, userId)
    await ctx.answerCallbackQuery().catch(() => undefined)
    await subscribeAndReply(ctx, sub, ref, dao.name || `${ref.network} DAO`, {
      fromSearch: confirmation.fromSearch,
      updateApp: Boolean(ref.appCode),
    })
    return
  }

  switch (action) {
    // New keyboards carry no Cancel button, but ones sent before it was retired
    // live in chat history indefinitely and must keep answering.
    case ACTION.cancel: {
      await ctx.answerCallbackQuery().catch(() => undefined)
      await ctx.editMessageText(SUBSCRIPTION_CONFIRMATION_CANCELLED).catch(() => undefined)
      return
    }
    default:
      await ctx.answerCallbackQuery().catch(() => undefined)
  }
}

export const helpHandler = async (ctx: Context): Promise<void> => {
  await replyFmt(ctx, HELP_TEXT)
}

export const menuCallback = async (ctx: CallbackQueryContext<Context>): Promise<void> => {
  const action = (ctx.callbackQuery.data ?? '').replace(/^menu:/, '')
  await ctx.answerCallbackQuery().catch(() => undefined)

  switch (action) {
    case 'subscribe':
      await replyFmt(ctx, SUBSCRIBE_HELP).catch(() => undefined)
      return
    case 'list':
      await daoListHandler(ctx)
      return
    case 'help':
      await helpHandler(ctx)
      return
  }
}

export const registerOnboarding = (bot: Bot<Context>): void => {
  bot.command('start', startHandler)
  bot.command('help', helpHandler)
  bot.callbackQuery(/^menu:/, menuCallback)
  bot.callbackQuery(/^c:/, subscriptionConfirmationCallback)
}
