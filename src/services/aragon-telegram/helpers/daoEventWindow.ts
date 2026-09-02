import { TELEGRAM_DAO_EVENT_WINDOW_MS, type TelegramDaoEventSlot } from '@types'

/**
 * Per-organization notification counter for the current clock hour. In-memory
 * like the bot's other limiters, so a restart allows one extra burst. A retried
 * message gets its first answer back instead of a new slot.
 */
export class DaoEventWindow {
  private windowStart = 0
  private readonly counts = new Map<string, number>()
  private readonly decisions = new Map<string, TelegramDaoEventSlot>()

  claimSlot(daoId: string, messageId: string, cap: number, now: number = Date.now()): TelegramDaoEventSlot {
    const windowStart = Math.floor(now / TELEGRAM_DAO_EVENT_WINDOW_MS) * TELEGRAM_DAO_EVENT_WINDOW_MS
    if (windowStart !== this.windowStart) {
      this.counts.clear()
      this.decisions.clear()
      this.windowStart = windowStart
    }

    const earlier = this.decisions.get(messageId)
    if (earlier) return earlier

    const count = (this.counts.get(daoId) ?? 0) + 1
    this.counts.set(daoId, count)

    const slot: TelegramDaoEventSlot = count < cap ? 'send' : count === cap ? 'send-with-mute-notice' : 'muted'
    this.decisions.set(messageId, slot)
    return slot
  }
}
