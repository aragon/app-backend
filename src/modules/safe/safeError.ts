import { ISafeErrorCode } from '@types'

/**
 * A Safe read failure, carrying the code the app already knows.
 *
 * It is a class and not an `ErrorKeyEnum` because the vocabulary is the app's `SafeServiceErrorCode`
 * verbatim (kebab-case values, a `retryAfter` field, an `error` message key) and the global error
 * envelope is `{ code, description, status, meta }`. Rather than bend every other route's shape, the
 * Safe router renders this one itself.
 *
 * It also crosses RabbitMQ: a gateway handler cannot throw to the API, so it answers with
 * `toQueueError()` and the controller rebuilds the throw on the other side.
 */
export class SafeReadError extends Error {
  readonly code: ISafeErrorCode
  readonly status: number
  /** Seconds to wait, taken from the upstream `Retry-After` header on a 429. */
  readonly retryAfter?: number

  constructor(code: ISafeErrorCode, message: string, status: number, retryAfter?: number) {
    super(message)

    this.name = 'SafeReadError'
    this.code = code
    this.status = status
    this.retryAfter = retryAfter
  }

  toQueueError() {
    return {
      safeError: { code: this.code, error: this.message, status: this.status, retryAfter: this.retryAfter },
    }
  }

  static isSafeReadError(error: unknown): error is SafeReadError {
    return error instanceof Error && error.name === 'SafeReadError'
  }

  /** Rebuild the error a gateway handler answered with. Falls back rather than trusting the wire. */
  static fromQueueError(value: unknown): SafeReadError {
    const safeError = (value as { safeError?: Record<string, unknown> } | null)?.safeError
    const code = Object.values(ISafeErrorCode).includes(safeError?.code as ISafeErrorCode)
      ? (safeError?.code as ISafeErrorCode)
      : ISafeErrorCode.upstreamError
    const message = typeof safeError?.error === 'string' ? safeError.error : 'Safe read failed'
    const status = typeof safeError?.status === 'number' ? safeError.status : 502
    const retryAfter = typeof safeError?.retryAfter === 'number' ? safeError.retryAfter : undefined

    return new SafeReadError(code, message, status, retryAfter)
  }
}
