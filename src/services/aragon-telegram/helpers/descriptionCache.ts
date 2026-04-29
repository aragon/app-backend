import { createHash } from 'node:crypto'

const CACHE_LIMIT = 500

/**
 * Telegram callback_data is capped at 64 bytes, so long proposal descriptions
 * can't ride on the button. We hand out a short token and look the body up
 * when the user taps "See details".
 *
 * The token is a deterministic hash of the body — same body always yields the
 * same token, so re-puts are idempotent and we don't churn cache slots when
 * the same proposal description appears in multiple events.
 *
 * In-memory only — entries are lost on restart, which is fine: users can
 * re-open the proposal in the Aragon app via the URL button on the same
 * message.
 */
export class DescriptionCache {
  private readonly entries = new Map<string, string>()

  put(body: string): string {
    const token = createHash('sha256').update(body).digest('hex').slice(0, 12)
    if (!this.entries.has(token)) {
      this.entries.set(token, body)
      while (this.entries.size > CACHE_LIMIT) {
        const oldest = this.entries.keys().next().value
        if (oldest === undefined) break
        this.entries.delete(oldest)
      }
    }
    return token
  }

  get(token: string): string | undefined {
    return this.entries.get(token)
  }
}
