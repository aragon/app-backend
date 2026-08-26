import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import { listHandler as daoListHandler } from '@services/aragon-telegram/commands/daoCommands'
import {
  COLD_START,
  CONSENT_CANCELLED,
  CONSENT_PROMPT,
  HELP_TEXT,
  SUBSCRIBE_HELP,
  autoSubscribedReply,
  consentSubscribePrompt,
} from '@services/aragon-telegram/commands/templates/onboarding'
import { lloFor, replyFmt, userHash } from '@services/aragon-telegram/commands/util'
import { DaoIdParser, type IParsedDaoRef } from '@services/aragon-telegram/helpers/daoId'
import { ITelegramSubscriptionStatus, TELEGRAM_CONSENT_VERSION, TELEGRAM_DEFAULT_EVENTS } from '@types'
import { type Bot, type CallbackQueryContext, type CommandContext, type Context, InlineKeyboard } from 'grammy'

const llo = lloFor('telegram:onboarding')

// Telegram caps callback_data at 64 bytes: `c:s:` (4) + `<network>-<0xaddr>` (≤59) = ≤63.
const CB = { accept: 'c:a', subscribe: 'c:s:', cancel: 'c:x' } as const

export const hasCurrentConsent = (sub: { consent?: { version?: string } } | null): boolean =>
  sub?.consent?.version === TELEGRAM_CONSENT_VERSION

const buildWelcomeKeyboard = (): InlineKeyboard =>
  new InlineKeyboard()
    .text('🔔 Subscribe to a DAO', 'menu:subscribe')
    .row()
    .text('📋 My DAOs', 'menu:list')
    .row()
    .url('🌐 Open Aragon app', config.SERVICES.ARAGON_TELEGRAM.APP_BASE_URL)
    .text('❔ Help', 'menu:help')

const buildConsentKeyboard = (): InlineKeyboard =>
  new InlineKeyboard().text('✅ Agree', CB.accept).text('Cancel', CB.cancel)

export const buildConsentSubscribeKeyboard = (daoId: string): InlineKeyboard =>
  new InlineKeyboard().text('✅ Agree and subscribe', `${CB.subscribe}${daoId}`).text('Cancel', CB.cancel)

const buildSubscribedKeyboard = (ref: IParsedDaoRef): InlineKeyboard =>
  new InlineKeyboard().text('📋 My DAOs', 'menu:list').url(
    '🔗 Open in Aragon',
    // Aragon app URL form: `/dao/<network>/<address>` (slash, not the dash we use as a Mongo id).
    `${config.SERVICES.ARAGON_TELEGRAM.APP_BASE_URL}/dao/${ref.network}/${ref.daoAddress}`,
  )

/** Find-or-create the user's record and record consent. Called only from an explicit Agree tap. */
const ensureConsentedSub = async (ctx: Context, userId: number) => {
  let sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
  if (!sub) {
    sub = await Models.TelegramSubscription.create({
      telegramUserId: userId,
      chatId: ctx.chat?.id ?? userId,
    })
  } else if (sub.status === ITelegramSubscriptionStatus.Blocked) {
    await sub.setStatus(ITelegramSubscriptionStatus.Active)
  }
  await sub.recordConsent(TELEGRAM_CONSENT_VERSION)
  return sub
}

const subscribeAndReply = async (ctx: Context, sub: any, ref: IParsedDaoRef, daoName: string): Promise<void> => {
  try {
    await sub.addDaoSubscription({
      network: ref.network,
      daoAddress: ref.daoAddress,
      events: TELEGRAM_DEFAULT_EVENTS,
    })
  } catch (err) {
    logger.warn('telegram:onboarding addDaoSubscription failed', llo({ err, userHash: userHash(ctx.from!.id) }))
    await ctx.reply(`Couldn't subscribe: ${(err as Error).message}`)
    return
  }
  await replyFmt(ctx, autoSubscribedReply(daoName), { reply_markup: buildSubscribedKeyboard(ref) })
}

/**
 * `/start [<deep-link>]` — entry point. Until the user has accepted the
 * current privacy disclosure nothing is written: both the bare start and the
 * deep-link path reply with a consent prompt, and the record is created in
 * `consentCallback` on the Agree tap.
 */
export const startHandler = async (ctx: CommandContext<Context>): Promise<void> => {
  const userId = ctx.from?.id
  if (!userId) return

  const payload = (typeof ctx.match === 'string' ? ctx.match : '').trim()
  const daoRef = payload ? DaoIdParser.parse(payload) : null

  const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)

  if (!daoRef) {
    if (!hasCurrentConsent(sub)) {
      await replyFmt(ctx, CONSENT_PROMPT, { reply_markup: buildConsentKeyboard() })
      return
    }
    if (sub!.status === ITelegramSubscriptionStatus.Blocked) {
      await sub!.setStatus(ITelegramSubscriptionStatus.Active)
    }
    await replyFmt(ctx, COLD_START, { reply_markup: buildWelcomeKeyboard() })
    return
  }

  const dao = await Models.Dao.findByAddress(daoRef.daoAddress, daoRef.network)
  if (!dao) {
    await ctx.reply("I couldn't find that DAO. Please check the link and try again.")
    return
  }
  const name = dao.name || `${daoRef.network} DAO`

  if (!hasCurrentConsent(sub)) {
    const daoId = Models.TelegramSubscription.getDaoId(daoRef)
    await replyFmt(ctx, consentSubscribePrompt(name), { reply_markup: buildConsentSubscribeKeyboard(daoId) })
    return
  }

  if (sub!.status === ITelegramSubscriptionStatus.Blocked) {
    await sub!.setStatus(ITelegramSubscriptionStatus.Active)
  }
  await subscribeAndReply(ctx, sub, daoRef, name)
}

export const consentCallback = async (ctx: CallbackQueryContext<Context>): Promise<void> => {
  const userId = ctx.from?.id
  const data = ctx.callbackQuery.data
  if (!userId || !data) {
    await ctx.answerCallbackQuery().catch(() => undefined)
    return
  }

  const [, action, ...rest] = data.split(':')

  switch (action) {
    case 'x': {
      await ctx.answerCallbackQuery().catch(() => undefined)
      await ctx.editMessageText(CONSENT_CANCELLED).catch(() => undefined)
      return
    }
    case 'a': {
      await ensureConsentedSub(ctx, userId)
      await ctx.answerCallbackQuery().catch(() => undefined)
      await replyFmt(ctx, COLD_START, { reply_markup: buildWelcomeKeyboard() }).catch(() => undefined)
      return
    }
    case 's': {
      const ref = DaoIdParser.parse(rest.join(':'))
      if (!ref) {
        await ctx.answerCallbackQuery('Invalid DAO id').catch(() => undefined)
        return
      }
      const dao = await Models.Dao.findByAddress(ref.daoAddress, ref.network)
      if (!dao) {
        await ctx.answerCallbackQuery().catch(() => undefined)
        await ctx.reply("I couldn't find that DAO. Please check the link and try again.").catch(() => undefined)
        return
      }
      const sub = await ensureConsentedSub(ctx, userId)
      await ctx.answerCallbackQuery().catch(() => undefined)
      await subscribeAndReply(ctx, sub, ref, dao.name || `${ref.network} DAO`)
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
  bot.callbackQuery(/^c:/, consentCallback)
}
