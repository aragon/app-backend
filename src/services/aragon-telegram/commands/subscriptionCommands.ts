import { b, code, fmt } from '@grammyjs/parse-mode'
import { Models } from '@dbModels'
import logger from '@logger'
import { BaseCommand } from '@services/aragon-telegram/commands/baseCommand'
import { DaoIdParser } from '@services/aragon-telegram/helpers/daoId'
import { type BotContext } from '@services/aragon-telegram/types'
import { TELEGRAM_DEFAULT_EVENTS } from '@types'
import { type Bot, type CommandContext } from 'grammy'

const SUBSCRIBE_USAGE = fmt`${b}Usage:${b} ${code}/subscribe <dao>${code}

Any of these formats works:
• full URL — ${code}https://app.aragon.org/dao/ethereum-sepolia/0xDd1...${code}
• network and address — ${code}/subscribe ethereum-mainnet 0xabcd...${code}
• combined — ${code}/subscribe ethereum-mainnet-0xabcd...${code}
• camelCase — ${code}/subscribe ethereumMainnet-0xabcd...${code}`

const UNSUBSCRIBE_USAGE = fmt`${b}Usage:${b} ${code}/unsubscribe <dao>${code}

Same formats as ${code}/subscribe${code} (URL, network + address, hyphenated, or camelCase).`

/** Typed entry into a subscription via `/subscribe` and `/unsubscribe`. */
export class SubscriptionCommands extends BaseCommand {
  constructor() {
    super('telegram:subscription')
  }

  register(bot: Bot<BotContext>): void {
    bot.command('subscribe', ctx => this.subscribe(ctx))
    bot.command('unsubscribe', ctx => this.unsubscribe(ctx))
  }

  private async subscribe(ctx: CommandContext<BotContext>): Promise<void> {
    const userId = this.userId(ctx)
    if (!userId) return
    const tgUser = ctx.from!

    const arg = this.commandArg(ctx)
    if (!arg) {
      await this.replyFmt(ctx, SUBSCRIBE_USAGE)
      return
    }

    const ref = DaoIdParser.parse(arg)
    if (!ref) {
      await this.replyFmt(ctx, fmt`I couldn't parse that DAO id. ${SUBSCRIBE_USAGE}`)
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
        chatId: this.chatId(ctx),
        username: tgUser.username ?? null,
        languageCode: tgUser.language_code ?? null,
      })
    }

    try {
      await sub.addDaoSubscription({
        network: ref.network,
        daoAddress: ref.daoAddress,
        events: TELEGRAM_DEFAULT_EVENTS,
      })
    } catch (err) {
      logger.warn('telegram:subscribe failed', this.llo({ err, userHash: this.userHash(userId) }))
      await ctx.reply(`Couldn't subscribe: ${(err as Error).message}`)
      return
    }

    const name = dao.name || `${ref.network} DAO`
    await this.replyFmt(ctx, fmt`🔔 Subscribed to ${b}${name}${b}. Use /dao to manage your subscriptions.`)
  }

  private async unsubscribe(ctx: CommandContext<BotContext>): Promise<void> {
    const userId = this.userId(ctx)
    if (!userId) return

    const arg = this.commandArg(ctx)
    if (!arg) {
      await this.replyFmt(ctx, UNSUBSCRIBE_USAGE)
      return
    }

    const ref = DaoIdParser.parse(arg)
    if (!ref) {
      await this.replyFmt(ctx, fmt`I couldn't parse that DAO id. ${UNSUBSCRIBE_USAGE}`)
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
}
