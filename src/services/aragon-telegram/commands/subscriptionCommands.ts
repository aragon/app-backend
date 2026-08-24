import { fmt } from '@grammyjs/parse-mode'
import { Models } from '@dbModels'
import logger from '@logger'
import {
  SUBSCRIBE_USAGE,
  UNSUBSCRIBE_USAGE,
  subscribedReply,
} from '@services/aragon-telegram/commands/templates/subscription'
import { lloFor, replyFmt, userHash } from '@services/aragon-telegram/commands/util'
import { DaoIdParser } from '@services/aragon-telegram/helpers/daoId'
import { TELEGRAM_CONSENT_VERSION, TELEGRAM_DEFAULT_EVENTS } from '@types'
import { type Bot, type CommandContext, type Context } from 'grammy'

const llo = lloFor('telegram:subscription')

export const subscribeHandler = async (ctx: CommandContext<Context>): Promise<void> => {
  const userId = ctx.from?.id
  if (!userId) return

  const arg = (typeof ctx.match === 'string' ? ctx.match : '').trim()
  if (!arg) {
    await replyFmt(ctx, SUBSCRIBE_USAGE)
    return
  }

  const ref = DaoIdParser.parse(arg)
  if (!ref) {
    await replyFmt(ctx, fmt`I couldn't parse that DAO id. ${SUBSCRIBE_USAGE}`)
    return
  }

  const dao = await Models.Dao.findByAddress(ref.daoAddress, ref.network)
  if (!dao) {
    await ctx.reply("That DAO doesn't exist on our backend. Double-check the network and address.")
    return
  }

  let sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
  if (!sub) {
    sub = await Models.TelegramSubscription.create({
      telegramUserId: userId,
      chatId: ctx.chat?.id ?? userId,
    })
  }

  // the reply carries the current disclosure, so a successful subscribe records consent too
  await sub.recordConsent(TELEGRAM_CONSENT_VERSION)

  try {
    await sub.addDaoSubscription({
      network: ref.network,
      daoAddress: ref.daoAddress,
      events: TELEGRAM_DEFAULT_EVENTS,
    })
  } catch (err) {
    logger.warn('telegram:subscribe failed', llo({ err, userHash: userHash(userId) }))
    await ctx.reply(`Couldn't subscribe: ${(err as Error).message}`)
    return
  }

  const name = dao.name || `${ref.network} DAO`
  await replyFmt(ctx, subscribedReply(name))
}

export const unsubscribeHandler = async (ctx: CommandContext<Context>): Promise<void> => {
  const userId = ctx.from?.id
  if (!userId) return

  const arg = (typeof ctx.match === 'string' ? ctx.match : '').trim()
  if (!arg) {
    await replyFmt(ctx, UNSUBSCRIBE_USAGE)
    return
  }

  const ref = DaoIdParser.parse(arg)
  if (!ref) {
    await replyFmt(ctx, fmt`I couldn't parse that DAO id. ${UNSUBSCRIBE_USAGE}`)
    return
  }

  const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
  if (!sub?.hasDaoSubscription(ref)) {
    await ctx.reply("You're not subscribed to that DAO.")
    return
  }

  await sub.removeDaoSubscription(ref)
  await ctx.reply('🗑 Unsubscribed.')
}

export const registerSubscription = (bot: Bot<Context>): void => {
  bot.command('subscribe', subscribeHandler)
  bot.command('unsubscribe', unsubscribeHandler)
}
