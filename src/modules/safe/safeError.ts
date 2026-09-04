import { ISafeErrorCode } from '@types'

/**
 * Ceiling for every `retryAfter` this service emits, in seconds.
 *
 * The longest wait a Safe read can legitimately ask for is the hourly upstream budget bucket, so an
 * upstream `Retry-After` is clamped to this on the way in and a wire value above it is dropped as
 * garbage on the way out. Clamping at the producer is what keeps that drop lossless: no in-repo
 * producer can exceed the ceiling, so nothing legitimate can ever hit it.
 */
export const SAFE_MAX_RETRY_AFTER_SECONDS = 3600

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
    // Only a real error status crosses the wire. The router assigns this to `ctx.status`, which Koa
    // asserts is an integer in [100,999], and a sub-400 value would render an error body as success.
    const rawStatus = safeError?.status
    const status =
      typeof rawStatus === 'number' && Number.isInteger(rawStatus) && rawStatus >= 400 && rawStatus <= 599
        ? rawStatus
        : 502
    // Same trust boundary as the status: `typeof NaN === 'number'`, and a negative or absurd value
    // is a backoff the client would honour.
    const rawRetryAfter = safeError?.retryAfter
    const retryAfter =
      typeof rawRetryAfter === 'number' &&
      Number.isInteger(rawRetryAfter) &&
      rawRetryAfter > 0 &&
      rawRetryAfter <= SAFE_MAX_RETRY_AFTER_SECONDS
        ? rawRetryAfter
        : undefined

    return new SafeReadError(code, message, status, retryAfter)
  }
}
