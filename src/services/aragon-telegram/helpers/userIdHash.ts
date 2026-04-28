import { createHash } from 'node:crypto'

/**
 * Hash a Telegram user id so it can be referenced in logs without writing
 * the raw identifier to Logz.io / Sentry / disk. The output is short and
 * stable (same id always hashes the same), so it's still useful for
 * correlating events across log lines without retaining PII.
 */
export class UserIdHash {
  static of(telegramUserId: number | string): string {
    return createHash('sha256').update(String(telegramUserId)).digest('hex').slice(0, 8)
  }
}
