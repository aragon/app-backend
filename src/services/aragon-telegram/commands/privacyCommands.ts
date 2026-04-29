import { bold, fmt, pre } from '@grammyjs/parse-mode'
import { Models } from '@dbModels'
import { BaseCommand } from '@services/aragon-telegram/commands/baseCommand'
import { type BotContext } from '@services/aragon-telegram/types'
import { type Bot, InlineKeyboard } from 'grammy'

/**
 * Privacy / GDPR surface: `/mydata` exports everything we store, `/forget`
 * deletes the entire record after a confirmation tap.
 */
export class PrivacyCommands extends BaseCommand {
  constructor(services: ConstructorParameters<typeof BaseCommand>[0]) {
    super(services, 'telegram:privacy')
  }

  register(bot: Bot<BotContext>): void {
    bot.command('mydata', ctx => this.myData(ctx))
    bot.command('forget', ctx => this.forget(ctx))
    bot.callbackQuery(/^forget:/, ctx => this.forgetCallback(ctx))
  }

  private async myData(ctx: BotContext): Promise<void> {
    const userId = this.userId(ctx)
    if (!userId) return
    const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
    if (!sub) {
      await ctx.reply("I don't have any data on you. Run /start to begin.")
      return
    }

    const payload = {
      telegramUserId: sub.telegramUserId,
      chatId: sub.chatId,
      username: sub.username,
      languageCode: sub.languageCode,
      status: sub.status,
      subscriptions: sub.subscriptions.map((s: any) => ({
        daoId: s.daoId,
        events: s.events,
        subscribedAt: new Date(s.subscribedAt).toISOString(),
      })),
      lastInteractionAt: sub.lastInteractionAt ? new Date(sub.lastInteractionAt).toISOString() : null,
    }

    const json = JSON.stringify(payload, null, 2)
    await ctx.replyFmt(fmt`Here's everything I store on you:\n\n${pre(json, 'json')}`)
  }

  private async forget(ctx: BotContext): Promise<void> {
    const userId = this.userId(ctx)
    if (!userId) return
    const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
    if (!sub) {
      await ctx.reply("Nothing to forget — I don't have any data on you.")
      return
    }
    const keyboard = new InlineKeyboard().text('🗑 Yes, delete everything', 'forget:yes').text('❌ Cancel', 'forget:no')
    await ctx.replyFmt(
      fmt`⚠️ ${bold('Are you sure?')}\n\nThis deletes all your subscriptions (${sub.subscriptions.length}) and your bot record.\nThere is no undo.`,
      { reply_markup: keyboard },
    )
  }

  private async forgetCallback(ctx: BotContext): Promise<void> {
    const userId = this.userId(ctx)
    if (!userId) {
      await ctx.answerCallbackQuery()
      return
    }
    const action = this.stripPrefix(ctx.callbackQuery?.data ?? '', 'forget:')
    if (action === 'no') {
      await ctx.answerCallbackQuery('Cancelled')
      await ctx.editMessageText('Cancelled — nothing was deleted.').catch(() => undefined)
      return
    }
    const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
    await sub?.deleteOne()
    await ctx.answerCallbackQuery('Deleted')
    await ctx
      .editMessageText('🗑 All your data has been deleted. Run /start to set things up again.')
      .catch(() => undefined)
  }
}
