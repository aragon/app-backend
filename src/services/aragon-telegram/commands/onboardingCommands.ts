import { b, code, fmt } from '@grammyjs/parse-mode'
import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import { listHandler as daoListHandler } from '@services/aragon-telegram/commands/daoCommands'
import { lloFor, replyFmt, userHash } from '@services/aragon-telegram/commands/util'
import { DaoIdParser } from '@services/aragon-telegram/helpers/daoId'
import { ITelegramSubscriptionStatus, TELEGRAM_DEFAULT_EVENTS } from '@types'
import { type Bot, type CallbackQueryContext, type CommandContext, type Context, InlineKeyboard } from 'grammy'

const llo = lloFor('telegram:onboarding')

const HELP_TEXT = fmt`${b}Aragon Notifications Bot${b}

I send you Telegram alerts about activity on the DAOs you follow:
• new proposals
• votes cast
• vote resets

${b}Commands${b}
/subscribe ${code}<network>-<daoAddress>${code} — follow a DAO
/unsubscribe ${code}<network>-<daoAddress>${code} — stop following a DAO
/dao — list your DAOs and toggle notifications
/pause — temporarily stop all notifications
/resume — re-enable notifications
/mydata — show what data we store about you
/forget — delete all your data
/help — show this message

To follow a DAO, open its page on app.aragon.org and tap ${b}'Open in Telegram'${b}.`

const COLD_START = fmt`👋 ${b}Welcome!${b}

I send Telegram alerts when DAOs you follow have:
🗳 new proposals
✅ votes cast
↩️ vote resets

Tap a button below to get started.`

const SUBSCRIBE_HELP = fmt`${b}To follow a DAO, you have two options:${b}

${b}1)${b} Open the DAO on ${b}app.aragon.org${b} and tap ${b}Open in Telegram${b}.

${b}2)${b} Send me ${code}/subscribe${code} with the DAO. Any of these formats works:

• full URL
${code}/subscribe https://app.aragon.org/dao/ethereum-sepolia/0xDd1...${code}

• network and address
${code}/subscribe ethereum-mainnet 0xabcd...${code}

• combined
${code}/subscribe ethereum-mainnet-0xabcd...${code}

• camelCase
${code}/subscribe ethereumMainnet-0xabcd...${code}`

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

  await replyFmt(
    ctx,
    fmt`🔔 You're now following ${b}${name}${b}.\n\nI'll DM you when there are new proposals, votes, or resets.`,
    { reply_markup: keyboard },
  )
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
