import { b, fmt, pre } from '@grammyjs/parse-mode'
import { Models } from '@dbModels'
import { replyFmt } from '@services/aragon-telegram/commands/util'
import { type Bot, type CallbackQueryContext, type Context, InlineKeyboard } from 'grammy'

const jsonPre = pre('json')

const myDataHandler = async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id
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
  }

  const json = JSON.stringify(payload, null, 2)
  await replyFmt(ctx, fmt`Here's everything I store on you:\n\n${jsonPre}${json}${jsonPre}`)
}

const forgetHandler = async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id
  if (!userId) return
  const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
  if (!sub) {
    await ctx.reply("Nothing to forget — I don't have any data on you.")
    return
  }
  const keyboard = new InlineKeyboard().text('🗑 Yes, delete everything', 'forget:yes').text('❌ Cancel', 'forget:no')
  await replyFmt(
    ctx,
    fmt`⚠️ ${b}Are you sure?${b}\n\nThis deletes all your subscriptions (${sub.subscriptions.length}) and your bot record.\nThere is no undo.`,
    { reply_markup: keyboard },
  )
}

const forgetCallback = async (ctx: CallbackQueryContext<Context>): Promise<void> => {
  const userId = ctx.from?.id
  if (!userId) {
    await ctx.answerCallbackQuery()
    return
  }
  const action = (ctx.callbackQuery.data ?? '').replace(/^forget:/, '')
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

export const registerPrivacy = (bot: Bot<Context>): void => {
  bot.command('mydata', myDataHandler)
  bot.command('forget', forgetHandler)
  bot.callbackQuery(/^forget:/, forgetCallback)
}
