import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import { listHandler as daoListHandler } from '@services/aragon-telegram/commands/daoCommands'
import {
  COLD_START,
  HELP_TEXT,
  SUBSCRIBE_HELP,
  autoSubscribedReply,
} from '@services/aragon-telegram/commands/templates/onboarding'
import { lloFor, replyFmt, userHash } from '@services/aragon-telegram/commands/util'
import { DaoIdParser } from '@services/aragon-telegram/helpers/daoId'
import { ITelegramSubscriptionStatus, TELEGRAM_DEFAULT_EVENTS } from '@types'
import { type Bot, type CallbackQueryContext, type CommandContext, type Context, InlineKeyboard } from 'grammy'

const llo = lloFor('telegram:onboarding')

const buildWelcomeKeyboard = (): InlineKeyboard =>
  new InlineKeyboard()
    .text('🔔 Subscribe to a DAO', 'menu:subscribe')
    .row()
    .text('📋 My DAOs', 'menu:list')
    .row()
    .url('🌐 Open Aragon app', config.SERVICES.ARAGON_TELEGRAM.APP_BASE_URL)
    .text('❔ Help', 'menu:help')

/**
 * `/start [<deep-link>]` — entry point. When the Aragon app sends
 * `t.me/<bot>?start=<network>-<daoAddress>`, the payload auto-subscribes
 * the caller to that DAO. Without a payload, replies with the welcome menu.
 */
export const startHandler = async (ctx: CommandContext<Context>): Promise<void> => {
  const userId = ctx.from?.id
  if (!userId) return

  const payload = (typeof ctx.match === 'string' ? ctx.match : '').trim()
  const daoRef = payload ? DaoIdParser.parse(payload) : null

  let sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
  if (!sub) {
    sub = await Models.TelegramSubscription.create({
      telegramUserId: userId,
      chatId: ctx.chat?.id ?? userId,
    })
  } else if (sub.status === ITelegramSubscriptionStatus.Blocked) {
    await sub.setStatus(ITelegramSubscriptionStatus.Active)
  }

  if (!daoRef) {
    await replyFmt(ctx, COLD_START, { reply_markup: buildWelcomeKeyboard() })
    return
  }

  const dao = await Models.Dao.findByAddress(daoRef.daoAddress, daoRef.network)
  if (!dao) {
    await ctx.reply("I couldn't find that DAO. Please check the link and try again.")
    return
  }

  try {
    await sub.addDaoSubscription({
      network: daoRef.network,
      daoAddress: daoRef.daoAddress,
      events: TELEGRAM_DEFAULT_EVENTS,
    })
  } catch (err) {
    logger.warn('telegram:start addDaoSubscription failed', llo({ err, userHash: userHash(userId) }))
    await ctx.reply(`Couldn't subscribe: ${(err as Error).message}`)
    return
  }

  const name = dao.name || `${daoRef.network} DAO`
  const keyboard = new InlineKeyboard().text('📋 My DAOs', 'menu:list').url(
    '🔗 Open in Aragon',
    // Aragon app URL form: `/dao/<network>/<address>` (slash, not the dash we use as a Mongo id).
    `${config.SERVICES.ARAGON_TELEGRAM.APP_BASE_URL}/dao/${daoRef.network}/${daoRef.daoAddress}`,
  )

  await replyFmt(ctx, autoSubscribedReply(name), { reply_markup: keyboard })
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
}
