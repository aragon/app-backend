import { Models } from '@dbModels'
import logger from '@logger'
import { BaseCommand } from '@services/aragon-telegram/commands/baseCommand'
import { DaoIdParser } from '@services/aragon-telegram/helpers/daoId'
import { MarkdownV2 } from '@services/aragon-telegram/helpers/markdownV2'
import { UserIdHash } from '@services/aragon-telegram/helpers/userIdHash'
import { type BotContext } from '@services/aragon-telegram/types'
import { TELEGRAM_DEFAULT_EVENTS } from '@types'
import { type Bot, type CommandContext } from 'grammy'

const SUBSCRIBE_USAGE = [
  '*Usage:* `/subscribe <dao>`',
  '',
  'Any of these formats works:',
  '• full URL — `https://app\\.aragon\\.org/dao/ethereum\\-sepolia/0xDd1\\.\\.\\.`',
  '• network and address — `/subscribe ethereum\\-mainnet 0xabcd\\.\\.\\.`',
  '• combined — `/subscribe ethereum\\-mainnet\\-0xabcd\\.\\.\\.`',
  '• camelCase — `/subscribe ethereumMainnet\\-0xabcd\\.\\.\\.`',
].join('\n')

const UNSUBSCRIBE_USAGE = [
  '*Usage:* `/unsubscribe <dao>`',
  '',
  'Same formats as `/subscribe` \\(URL, network \\+ address, hyphenated, or camelCase\\)\\.',
].join('\n')

/** Typed entry into a subscription via `/subscribe` and `/unsubscribe`. */
export class SubscriptionCommands extends BaseCommand {
  constructor(services: ConstructorParameters<typeof BaseCommand>[0]) {
    super(services, 'telegram:subscription')
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
      await ctx.reply(SUBSCRIBE_USAGE, { parse_mode: 'MarkdownV2' })
      return
    }

    const ref = DaoIdParser.parse(arg)
    if (!ref) {
      await ctx.reply(`I couldn't parse that DAO id\\. ${SUBSCRIBE_USAGE}`, { parse_mode: 'MarkdownV2' })
      return
    }

    const dao = await Models.Dao.findByAddress(ref.daoAddress, ref.network)
    if (!dao) {
      await ctx.reply("That DAO doesn't exist on our backend\\. Double\\-check the network and address\\.", {
        parse_mode: 'MarkdownV2',
      })
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
    await sub.touchInteraction()

    try {
      await sub.addDaoSubscription({
        network: ref.network,
        daoAddress: ref.daoAddress,
        events: TELEGRAM_DEFAULT_EVENTS,
      })
    } catch (err) {
      logger.warn('telegram:subscribe failed', this.llo({ err, userHash: UserIdHash.of(userId) }))
      await ctx.reply(`Couldn't subscribe: ${MarkdownV2.escape((err as Error).message)}`, { parse_mode: 'MarkdownV2' })
      return
    }

    const name = MarkdownV2.escape(dao.name || `${ref.network} DAO`)
    await ctx.reply(`🔔 Subscribed to *${name}*\\. Use /dao to manage your subscriptions\\.`, {
      parse_mode: 'MarkdownV2',
    })
  }

  private async unsubscribe(ctx: CommandContext<BotContext>): Promise<void> {
    const userId = this.userId(ctx)
    if (!userId) return

    const arg = this.commandArg(ctx)
    if (!arg) {
      await ctx.reply(UNSUBSCRIBE_USAGE, { parse_mode: 'MarkdownV2' })
      return
    }

    const ref = DaoIdParser.parse(arg)
    if (!ref) {
      await ctx.reply(`I couldn't parse that DAO id\\. ${UNSUBSCRIBE_USAGE}`, { parse_mode: 'MarkdownV2' })
      return
    }

    const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
    if (!sub?.hasDaoSubscription(ref)) {
      await ctx.reply("You're not subscribed to that DAO\\.", { parse_mode: 'MarkdownV2' })
      return
    }

    await sub.removeDaoSubscription(ref)
    await ctx.reply('🗑 Unsubscribed\\.', { parse_mode: 'MarkdownV2' })
  }
}
