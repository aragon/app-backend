import { Models } from '@dbModels'
import { fmt, pre } from '@grammyjs/parse-mode'
import { FORGET_CONFIRM, PRIVACY_BODY } from '@services/aragon-telegram/commands/templates/privacy'
import { replyFmt } from '@services/aragon-telegram/commands/util'
import { deleteTelegramUserData } from '@services/aragon-telegram/helpers/userData'
import { telegramRecipientHash } from '@services/aragon-telegram/helpers/userHash'
import { TELEGRAM_NOTIFICATION_MARKER_RETENTION_DAYS } from '@types'
import { type Bot, type CallbackQueryContext, type Context, InlineKeyboard } from 'grammy'

const jsonPre = pre('json')

const privacyHandler = async (ctx: Context): Promise<void> => {
  await replyFmt(ctx, PRIVACY_BODY, { link_preview_options: { is_disabled: true } })
}

const myDataHandler = async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id
  if (!userId) return
  const recipientHash = telegramRecipientHash(userId)
  const [sub, deliveryMarkerCount] = await Promise.all([
    Models.TelegramSubscription.findByTelegramUserId(userId),
    Models.TelegramNotifiedEvent.countDocuments({ recipientHash }),
  ])
  if (!sub && deliveryMarkerCount === 0) {
    await ctx.reply('No data is stored about you. Send /start to begin.')
    return
  }

  const payload = {
    subscription: sub
      ? {
          telegramUserId: sub.telegramUserId,
          chatId: sub.chatId,
          status: sub.status,
          deleteAfter: sub.deleteAfter?.toISOString(),
          consent: sub.consent && {
            version: sub.consent.version,
            acceptedAt: new Date(sub.consent.acceptedAt).toISOString(),
          },
          subscriptions: sub.subscriptions.map((s: any) => ({
            daoId: s.daoId,
            events: s.events,
            subscribedAt: new Date(s.subscribedAt).toISOString(),
          })),
        }
      : null,
    deliveryDeduplication: {
      markerCount: deliveryMarkerCount,
      retentionDays: TELEGRAM_NOTIFICATION_MARKER_RETENTION_DAYS,
    },
  }

  const json = JSON.stringify(payload, null, 2)
  await replyFmt(ctx, fmt`The data stored by this bot:\n\n${jsonPre}${json}${jsonPre}`)
}

const forgetHandler = async (ctx: Context): Promise<void> => {
  const userId = ctx.from?.id
  if (!userId) return
  const recipientHash = telegramRecipientHash(userId)
  const [sub, deliveryMarkerCount] = await Promise.all([
    Models.TelegramSubscription.findByTelegramUserId(userId),
    Models.TelegramNotifiedEvent.countDocuments({ recipientHash }),
  ])
  if (!sub && deliveryMarkerCount === 0) {
    await ctx.reply('Nothing to delete. No data is stored about you.')
    return
  }
  const keyboard = new InlineKeyboard().text('Delete data', 'forget:yes').text('Cancel', 'forget:no')
  await replyFmt(ctx, FORGET_CONFIRM, { reply_markup: keyboard })
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
    await ctx.editMessageText('Cancelled. Nothing was deleted.').catch(() => undefined)
    return
  }
  if (action !== 'yes') {
    await ctx.answerCallbackQuery('Invalid action').catch(() => undefined)
    return
  }
  const sub = await Models.TelegramSubscription.findByTelegramUserId(userId)
  await deleteTelegramUserData(userId, sub)
  await ctx.answerCallbackQuery('Deleted')
  await ctx
    .editMessageText(
      'Your data has been deleted. Residual operational backups and logs are handled under the published retention policy. Send /start to set up notifications again.',
    )
    .catch(() => undefined)
}

export const registerPrivacy = (bot: Bot<Context>): void => {
  bot.command('privacy', privacyHandler)
  bot.command('mydata', myDataHandler)
  bot.command('forget', forgetHandler)
  bot.callbackQuery(/^forget:/, forgetCallback)
}
