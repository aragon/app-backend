import { createHmac } from 'node:crypto'
import config from '@config'

// Telegram user ids are small integers, so a plain hash is reversible by brute
// force. Keying the digest with a server-side secret is what makes it pseudonymous.
const digestUserId = (id: number | string): string => {
  const secret = config.SERVICES.ARAGON_TELEGRAM.USER_HASH_SECRET
  if (!secret) throw new Error('SERVICES_ARAGON_TELEGRAM_USER_HASH_SECRET is required')
  return createHmac('sha256', secret).update(String(id)).digest('hex')
}

/** Full pseudonymous key used to find and delete a user's delivery markers. */
export const telegramRecipientHash = (id: number | string): string => digestUserId(id)

/** Short pseudonymous key used only for log correlation. */
export const telegramUserLogHash = (id: number | string): string => digestUserId(id).slice(0, 8)
