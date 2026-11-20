import { Models } from '@dbModels'
import { fmt } from '@grammyjs/parse-mode'
import { requestSubscriptionConfirmation } from '@services/aragon-telegram/commands/onboardingCommands'
import { lastSubscriptionRemoved } from '@services/aragon-telegram/commands/templates/shared'
import {
  SEARCH_BUSY,
  SEARCH_TOO_SHORT,
  SUBSCRIBE_USAGE,
  searchNoMatches,
  searchResultsHeader,
  UNSUBSCRIBE_USAGE,
} from '@services/aragon-telegram/commands/templates/subscription'
import { replyFmt } from '@services/aragon-telegram/commands/util'
import { appCodeFromUrl, isAppUrl } from '@services/aragon-telegram/helpers/appUrl'
import { DaoIdParser, type IParsedDaoRef } from '@services/aragon-telegram/helpers/daoId'
import {
  DAO_SEARCH_LIMIT,
  resolveExplicitDaoRef,
  searchDaosByName,
} from '@services/aragon-telegram/helpers/daoResolver'
import { removeDaoSubscriptionAndCleanUp } from '@services/aragon-telegram/helpers/userData'
import { TELEGRAM_SEARCH_MIN_LENGTH } from '@types'
import { type Bot, type CallbackQueryContext, type CommandContext, type Context, InlineKeyboard } from 'grammy'

// Telegram caps callback_data at 64 bytes: `s:p:` (4) + `<network>-<0xaddr>` (≤60) = ≤64.
const CB = { pick: 's:p:' } as const

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
    // A pasted link from one of our apps picks that app; any other input leaves the app as it is.
    const appCode = appCodeFromUrl(arg)
    await requestSubscriptionConfirmation(ctx, { ...resolved.ref, appCode }, resolved.name, {
      updateApp: isAppUrl(arg),
    })
    return
  }

  if (arg.length < TELEGRAM_SEARCH_MIN_LENGTH) {
    await ctx.reply(SEARCH_TOO_SHORT)
    return
  }
  const results = await searchDaosByName(arg)
  if (results === 'busy') {
    await ctx.reply(SEARCH_BUSY)
    return
  }
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
  await requestSubscriptionConfirmation(
    ctx,
    { network: ref.network, daoAddress: ref.daoAddress },
    dao.name || `${ref.network} DAO`,
    { fromSearch: true },
  )
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

  const deletedUserData = await removeDaoSubscriptionAndCleanUp(sub, ref, userId)
  if (deletedUserData) {
    const dao = await Models.Dao.findByAddress(ref.daoAddress, ref.network)
    await ctx.reply(lastSubscriptionRemoved(dao?.name || `${ref.network} DAO`))
    return
  }
  await ctx.reply("You're no longer subscribed to that organization.")
}

export const registerSubscription = (bot: Bot<Context>): void => {
  bot.command('subscribe', subscribeHandler)
  bot.command('unsubscribe', unsubscribeHandler)
  bot.callbackQuery(/^s:p:/, searchPickCallback)
}
