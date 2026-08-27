import { createHash } from 'node:crypto'

const digestUserId = (id: number | string): string => createHash('sha256').update(String(id)).digest('hex')

/** Full pseudonymous key used to find and delete a user's delivery markers. */
export const telegramRecipientHash = (id: number | string): string => digestUserId(id)

/** Short pseudonymous key used only for log correlation. */
export const telegramUserLogHash = (id: number | string): string => digestUserId(id).slice(0, 8)
