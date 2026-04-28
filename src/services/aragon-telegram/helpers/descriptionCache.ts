import { randomBytes } from 'node:crypto'

const CACHE_LIMIT = 500

/**
 * Telegram callback_data is capped at 64 bytes, so long proposal descriptions
 * can't ride on the button. We hand out a short token and look the body up
 * when the user taps "See details".
 *
 * In-memory only — entries are lost on restart, which is fine: users can re-open
 * the proposal in the Aragon app via the URL button on the same message.
 */
export class DescriptionCache {
  private readonly entries = new Map<string, string>()

  put(body: string): string {
    const token = randomBytes(6).toString('hex') // 12 chars — fits 64-byte callback_data
    this.entries.set(token, body)
    while (this.entries.size > CACHE_LIMIT) {
      const oldest = this.entries.keys().next().value
      if (oldest === undefined) break
      this.entries.delete(oldest)
    }
    return token
  }

  get(token: string): string | undefined {
    return this.entries.get(token)
  }
}
