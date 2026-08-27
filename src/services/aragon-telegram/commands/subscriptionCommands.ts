import { Models } from '@dbModels'
import { fmt } from '@grammyjs/parse-mode'
import { requestSubscriptionConfirmation } from '@services/aragon-telegram/commands/onboardingCommands'
import {
  SUBSCRIBE_USAGE,
  searchNoMatches,
  searchResultsHeader,
  UNSUBSCRIBE_USAGE,
} from '@services/aragon-telegram/commands/templates/subscription'
import { replyFmt } from '@services/aragon-telegram/commands/util'
import { DaoIdParser, type IParsedDaoRef } from '@services/aragon-telegram/helpers/daoId'
import {
  DAO_SEARCH_LIMIT,
  resolveExplicitDaoRef,
  searchDaosByName,
} from '@services/aragon-telegram/helpers/daoResolver'
import { type Bot, type CallbackQueryContext, type CommandContext, type Context, InlineKeyboard } from 'grammy'

// Telegram caps callback_data at 64 bytes: `s:p:` (4) + `<network>-<0xaddr>` (≤59) = ≤63.
const CB = { pick: 's:p:' } as const

/** A resolved organization is always disclosed and explicitly confirmed before it is subscribed. */
const subscribeResolved = async (ctx: Context, ref: IParsedDaoRef, name: string): Promise<void> =>
  await requestSubscriptionConfirmation(ctx, ref, name)

const buildSearchKeyboard = (results: { name: string; ref: IParsedDaoRef }[]): InlineKeyboard => {
  const kb = new InlineKeyboard()
  results.forEach((result, i) => {
    if (i > 0) kb.row()
    const daoId = Models.TelegramSubscription.getDaoId(result.ref)
    kb.text(`${result.name} · ${result.ref.network}`, `${CB.pick}${daoId}`)
  })
  return kb
}

/**
 * Handle any organization argument: explicit reference (URL, id, ENS name)
 * first, then name search. Shared by `/subscribe <arg>` and pasted text.
 */
export const handleSubscribeArgument = async (ctx: Context, arg: string): Promise<void> => {
  const resolved = await resolveExplicitDaoRef(arg)
  if (resolved === 'not-found') {
    await ctx.reply('Organization not found. Check the network and address, then try again.')
    return
  }
  if (resolved) {
    await subscribeResolved(ctx, resolved.ref, resolved.name)
    return
  }

  const results = await searchDaosByName(arg)
  if (results.length === 0) {
    await ctx.reply(searchNoMatches(arg))
    return
  }
  const truncated = results.length > DAO_SEARCH_LIMIT
  await ctx.reply(searchResultsHeader(arg, truncated), {
    reply_markup: buildSearchKeyboard(results.slice(0, DAO_SEARCH_LIMIT)),
  })
}

export const subscribeHandler = async (ctx: CommandContext<Context>): Promise<void> => {
  const userId = ctx.from?.id
  if (!userId) return

  const arg = (typeof ctx.match === 'string' ? ctx.match : '').trim()
  if (!arg) {
    await replyFmt(ctx, SUBSCRIBE_USAGE)
    return
  }

  await handleSubscribeArgument(ctx, arg)
}

/** A search-result button was selected — show the normal confirmation flow. */
const searchPickCallback = async (ctx: CallbackQueryContext<Context>): Promise<void> => {
  const userId = ctx.from?.id
  const data = ctx.callbackQuery.data
  if (!userId || !data) {
    await ctx.answerCallbackQuery().catch(() => undefined)
    return
  }

  const ref = DaoIdParser.parse(data.slice(CB.pick.length))
  if (!ref) {
    await ctx.answerCallbackQuery('Invalid organization ID').catch(() => undefined)
    return
  }

  const dao = await Models.Dao.findByAddress(ref.daoAddress, ref.network)
  if (!dao) {
    await ctx.answerCallbackQuery().catch(() => undefined)
    await ctx.reply('Organization not found. Check the network and address, then try again.').catch(() => undefined)
    return
  }

  await ctx.answerCallbackQuery().catch(() => undefined)
  await subscribeResolved(ctx, ref, dao.name || `${ref.network} DAO`)
}

export const unsubscribeHandler = async (ctx: CommandContext<Context>): Promise<void> => {
  const userId = ctx.from?.id
  if (!userId) return

  const arg = (typeof ctx.match === 'string' ? ctx.match : '').trim()
  if (!arg) {
    await replyFmt(ctx, UNSUBSCRIBE_USAGE)
    return
  }

  // Address forms resolve without a DB lookup; ENS forms need the Dao record.
  let ref = DaoIdParser.parse(arg)
  if (!ref) {
    const resolved = await resolveExplicitDaoRef(arg)
    if (resolved === 'not-found') {
      await ctx.reply("You aren't subscribed to that organization.")
      return
    }
    if (!resolved) {
      await replyFmt(ctx, fmt`That format isn't recognized. ${UNSUBSCRIBE_USAGE}`)
      return
    }
    ref = resolved.ref
  }

  const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
  if (!sub?.hasDaoSubscription(ref)) {
    await ctx.reply("You aren't subscribed to that organization.")
    return
  }

  await sub.removeDaoSubscription(ref)
  if (sub.subscriptions.length === 0) {
    await ctx.reply(
      "You're no longer subscribed to that organization. That was your last subscription, so the data stored by this bot was deleted. Send /start to set up notifications again.",
    )
    return
  }
  await ctx.reply("You're no longer subscribed to that organization.")
}

export const registerSubscription = (bot: Bot<Context>): void => {
  bot.command('subscribe', subscribeHandler)
  bot.command('unsubscribe', unsubscribeHandler)
  bot.callbackQuery(/^s:p:/, searchPickCallback)
}
