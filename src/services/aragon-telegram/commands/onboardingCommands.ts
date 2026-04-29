import { b, code, fmt } from '@grammyjs/parse-mode'
import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import { BaseCommand } from '@services/aragon-telegram/commands/baseCommand'
import { DaoIdParser } from '@services/aragon-telegram/helpers/daoId'
import { type BotContext } from '@services/aragon-telegram/types'
import { ITelegramSubscriptionStatus, TELEGRAM_DEFAULT_EVENTS } from '@types'
import { type Bot, InlineKeyboard } from 'grammy'

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

/**
 * Onboarding surface: `/start`, `/help`, and the welcome menu router.
 *
 * `/start` doubles as the deep-link entry point — when the Aragon app sends
 * `t.me/<bot>?start=<network>-<daoAddress>`, the payload is parsed and the
 * caller is auto-subscribed to that DAO.
 */
export class OnboardingCommands extends BaseCommand {
  constructor() {
    super('telegram:onboarding')
  }

  register(bot: Bot<BotContext>): void {
    bot.command('start', ctx => this.start(ctx))
    bot.command('help', ctx => this.help(ctx))
    bot.callbackQuery(/^menu:/, ctx => this.menuCallback(ctx))
  }

  private async start(ctx: BotContext): Promise<void> {
    const userId = this.userId(ctx)
    if (!userId) return
    const tgUser = ctx.from!
    const chatId = this.chatId(ctx)

    const payload = (typeof ctx.match === 'string' ? ctx.match : '').trim()
    const daoRef = payload ? DaoIdParser.parse(payload) : null

    let sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
    if (!sub) {
      sub = await Models.TelegramSubscription.create({
        telegramUserId: userId,
        chatId,
        username: tgUser.username ?? null,
        languageCode: tgUser.language_code ?? null,
      })
    } else if (sub.status === ITelegramSubscriptionStatus.Blocked) {
      await sub.setStatus(ITelegramSubscriptionStatus.Active)
    }

    if (!daoRef) {
      await this.replyFmt(ctx, COLD_START, { reply_markup: this.buildWelcomeKeyboard() })
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
      logger.warn('telegram:start addDaoSubscription failed', this.llo({ err, userHash: this.userHash(userId) }))
      await ctx.reply(`Couldn't subscribe: ${(err as Error).message}`)
      return
    }

    const name = dao.name || `${daoRef.network} DAO`
    const keyboard = new InlineKeyboard().text('📋 My DAOs', 'menu:list').url(
      '🔗 Open in Aragon',
      // Aragon app URL form: `/dao/<network>/<address>` (slash, not the dash we use as a Mongo id).
      `${config.SERVICES.ARAGON_TELEGRAM.APP_BASE_URL}/dao/${daoRef.network}/${daoRef.daoAddress}`,
    )

    await this.replyFmt(
      ctx,
      fmt`🔔 You're now following ${b}${name}${b}.\n\nI'll DM you when there are new proposals, votes, or resets.`,
      { reply_markup: keyboard },
    )
  }

  private async help(ctx: BotContext): Promise<void> {
    await this.replyFmt(ctx, HELP_TEXT)
  }

  private async menuCallback(ctx: BotContext): Promise<void> {
    const data = ctx.callbackQuery?.data ?? ''
    const action = this.stripPrefix(data, 'menu:')
    await ctx.answerCallbackQuery().catch(() => undefined)

    switch (action) {
      case 'subscribe':
        await this.replyFmt(ctx, SUBSCRIBE_HELP).catch(() => undefined)
        return
      case 'list':
        // Late import to avoid a circular dep between OnboardingCommands and DaoCommands.
        await import('@services/aragon-telegram/commands/daoCommands').then(m =>
          new m.DaoCommands().list(ctx),
        )
        return
      case 'help':
        await this.help(ctx)
        return
    }
  }

  private buildWelcomeKeyboard(): InlineKeyboard {
    const appUrl = config.SERVICES.ARAGON_TELEGRAM.APP_BASE_URL
    return new InlineKeyboard()
      .text('🔔 Subscribe to a DAO', 'menu:subscribe')
      .row()
      .text('📋 My DAOs', 'menu:list')
      .row()
      .url('🌐 Open Aragon app', appUrl)
      .text('❔ Help', 'menu:help')
  }
}
