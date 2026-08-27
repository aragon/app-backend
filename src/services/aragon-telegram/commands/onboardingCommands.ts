import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import { listHandler as daoListHandler } from '@services/aragon-telegram/commands/daoCommands'
import {
  COLD_START,
  HELP_TEXT,
  SUBSCRIBE_HELP,
  SUBSCRIPTION_CONFIRMATION_CANCELLED,
  subscriptionConfirmationPrompt,
} from '@services/aragon-telegram/commands/templates/onboarding'
import { alreadySubscribedReply, subscribedReply } from '@services/aragon-telegram/commands/templates/subscription'
import { lloFor, replyFmt, userHash } from '@services/aragon-telegram/commands/util'
import { DaoIdParser, type IParsedDaoRef } from '@services/aragon-telegram/helpers/daoId'
import { ITelegramSubscriptionStatus, TELEGRAM_CONSENT_VERSION, TELEGRAM_DEFAULT_EVENTS } from '@types'
import { type Bot, type CallbackQueryContext, type CommandContext, type Context, InlineKeyboard } from 'grammy'

const llo = lloFor('telegram:onboarding')

// Telegram caps callback_data at 64 bytes: `c:s:` (4) + `<network>-<0xaddr>` (≤59) = ≤63.
const CB = { subscribe: 'c:s:', cancel: 'c:x' } as const

const buildWelcomeKeyboard = (): InlineKeyboard =>
  new InlineKeyboard()
    .text('Subscribe to an organization', 'menu:subscribe')
    .row()
    .text('Manage notifications', 'menu:list')
    .row()
    .url('Open Aragon', config.SERVICES.ARAGON_TELEGRAM.APP_BASE_URL)
    .text('Help', 'menu:help')

export const buildSubscriptionConfirmationKeyboard = (daoId: string): InlineKeyboard =>
  new InlineKeyboard()
    .url('Privacy policy', config.SERVICES.ARAGON_TELEGRAM.PRIVACY_URL)
    .row()
    .text('Confirm subscription', `${CB.subscribe}${daoId}`)
    .text('Cancel', CB.cancel)

const buildSubscribedKeyboard = (ref: IParsedDaoRef): InlineKeyboard =>
  new InlineKeyboard().text('Manage notifications', 'menu:list').url(
    'Open in Aragon',
    // Aragon app URL form: `/dao/<network>/<address>` (slash, not the dash we use as a Mongo id).
    `${config.SERVICES.ARAGON_TELEGRAM.APP_BASE_URL}/dao/${ref.network}/${ref.daoAddress}`,
  )

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

const subscribeAndReply = async (ctx: Context, sub: any, ref: IParsedDaoRef, daoName: string): Promise<void> => {
  if (sub.hasDaoSubscription(ref)) {
    await replyFmt(ctx, alreadySubscribedReply(daoName))
    return
  }
  try {
    await sub.addDaoSubscription({
      network: ref.network,
      daoAddress: ref.daoAddress,
      events: TELEGRAM_DEFAULT_EVENTS,
    })
  } catch (err) {
    logger.warn('telegram:onboarding addDaoSubscription failed', llo({ err, userHash: userHash(ctx.from!.id) }))
    await ctx.reply(`Couldn't subscribe to this organization: ${(err as Error).message}`)
    return
  }
  await replyFmt(ctx, subscribedReply(daoName), { reply_markup: buildSubscribedKeyboard(ref) })
}

/** Shows the disclosure and confirmation action without creating or modifying a subscription record. */
export const requestSubscriptionConfirmation = async (
  ctx: Context,
  ref: IParsedDaoRef,
  daoName: string,
): Promise<void> => {
  const daoId = Models.TelegramSubscription.getDaoId(ref)
  await replyFmt(ctx, subscriptionConfirmationPrompt(daoName), {
    reply_markup: buildSubscriptionConfirmationKeyboard(daoId),
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
  const daoRef = payload ? DaoIdParser.parse(payload) : null

  if (!daoRef) {
    const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
    if (sub?.status === ITelegramSubscriptionStatus.Blocked) {
      await sub.setStatus(ITelegramSubscriptionStatus.Active)
    }
    await replyFmt(ctx, COLD_START, { reply_markup: buildWelcomeKeyboard() })
    return
  }

  const dao = await Models.Dao.findByAddress(daoRef.daoAddress, daoRef.network)
  if (!dao) {
    await ctx.reply('Organization not found. Check the link and try again.')
    return
  }
  const name = dao.name || `${daoRef.network} DAO`
  await requestSubscriptionConfirmation(ctx, daoRef, name)
}

export const subscriptionConfirmationCallback = async (ctx: CallbackQueryContext<Context>): Promise<void> => {
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
      await ctx.editMessageText(SUBSCRIPTION_CONFIRMATION_CANCELLED).catch(() => undefined)
      return
    }
    case 's': {
      const ref = DaoIdParser.parse(rest.join(':'))
      if (!ref) {
        await ctx.answerCallbackQuery('Invalid organization ID').catch(() => undefined)
        return
      }
      const dao = await Models.Dao.findByAddress(ref.daoAddress, ref.network)
      if (!dao) {
        await ctx.answerCallbackQuery().catch(() => undefined)
        await ctx.reply('Organization not found. Check the link and try again.').catch(() => undefined)
        return
      }
      const sub = await ensureSubscriptionRecipient(ctx, userId)
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
  bot.callbackQuery(/^c:/, subscriptionConfirmationCallback)
}
