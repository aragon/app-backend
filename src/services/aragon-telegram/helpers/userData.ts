import { Models } from '@dbModels'
import { type ITelegramDaoSubscriptionParams } from '@types'
import { telegramRecipientHash } from './userHash'

interface ITelegramSubscriptionRecord {
  subscriptions: unknown[]
  removeDaoSubscription: (params: ITelegramDaoSubscriptionParams) => Promise<unknown>
}

interface IDeletableTelegramSubscription {
  deleteOne: () => Promise<unknown>
}

/** Delete the recipient-specific deduplication records stored for a Telegram user. */
export const deleteTelegramDeliveryMarkers = async (telegramUserId: number): Promise<void> => {
  await Models.TelegramNotifiedEvent.deleteMany({ recipientHash: telegramRecipientHash(telegramUserId) })
}

/** Delete the subscription record and recipient-specific delivery records for a Telegram user. */
export const deleteTelegramUserData = async (
  telegramUserId: number,
  subscription?: IDeletableTelegramSubscription | null,
): Promise<void> => {
  await Promise.all([subscription?.deleteOne(), deleteTelegramDeliveryMarkers(telegramUserId)])
}

/**
 * Remove one DAO subscription. When it was the user's last subscription, also
 * remove the recipient-specific delivery markers so no personal Telegram data
 * remains in the notification collections.
 */
export const removeDaoSubscriptionAndCleanUp = async (
  subscription: ITelegramSubscriptionRecord,
  params: ITelegramDaoSubscriptionParams,
  telegramUserId: number,
): Promise<boolean> => {
  const removingFinalSubscription = subscription.subscriptions.length === 1
  // Clear recipient data first. If this fails, keep the subscription record so
  // callers cannot report that all data was deleted when delivery markers remain.
  if (removingFinalSubscription) await deleteTelegramDeliveryMarkers(telegramUserId)

  await subscription.removeDaoSubscription(params)
  if (subscription.subscriptions.length > 0) return false

  return removingFinalSubscription
}
