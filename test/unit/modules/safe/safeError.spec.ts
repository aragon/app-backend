import { ERRORS, throwExposable } from '@errors'
import { SafeReadError } from '@modules/safe/safeError'
import { ErrorKeyEnum, ISafeErrorCode, SAFE_ERROR_KEY } from '@types'
import { expect } from 'chai'

describe('SafeReadError', () => {
  it('serializes a typed error for RabbitMQ and rebuilds it', () => {
    const original = new SafeReadError(ISafeErrorCode.rateLimited, 'try later', 429, 30)
    const rebuilt = SafeReadError.fromQueueError(original.toQueueError())

    expect(original.name).to.equal('SafeReadError')
    expect(SafeReadError.isSafeReadError(original)).to.equal(true)
    expect(rebuilt).to.include({ code: ISafeErrorCode.rateLimited, message: 'try later', status: 429, retryAfter: 30 })
    expect(SafeReadError.isSafeReadError(new Error('ordinary'))).to.equal(false)
  })

  it('falls back to a safe upstream error for malformed queue data', () => {
    const rebuilt = SafeReadError.fromQueueError({ safeError: { code: 'not-a-code', status: 'bad' } })

    expect(rebuilt.code).to.equal(ISafeErrorCode.upstreamError)
    expect(rebuilt.message).to.equal('Safe read failed')
    expect(rebuilt.status).to.equal(502)
    expect(rebuilt.retryAfter).to.equal(undefined)
    expect(SafeReadError.fromQueueError(null).code).to.equal(ISafeErrorCode.upstreamError)
  })

  it('rejects wire statuses a router could not render', () => {
    expect(SafeReadError.fromQueueError({ safeError: { status: 200 } }).status).to.equal(502)
    expect(SafeReadError.fromQueueError({ safeError: { status: 502.5 } }).status).to.equal(502)
    expect(SafeReadError.fromQueueError({ safeError: { status: Number.NaN } }).status).to.equal(502)
    expect(SafeReadError.fromQueueError({ safeError: { status: 0 } }).status).to.equal(502)
    expect(SafeReadError.fromQueueError({ safeError: { status: 404 } }).status).to.equal(404)
  })

  it('drops a wire retryAfter no client should honour', () => {
    expect(SafeReadError.fromQueueError({ safeError: { retryAfter: -5 } }).retryAfter).to.equal(undefined)
    expect(SafeReadError.fromQueueError({ safeError: { retryAfter: 0 } }).retryAfter).to.equal(undefined)
    expect(SafeReadError.fromQueueError({ safeError: { retryAfter: Number.NaN } }).retryAfter).to.equal(undefined)
    expect(SafeReadError.fromQueueError({ safeError: { retryAfter: 1.5 } }).retryAfter).to.equal(undefined)
    expect(SafeReadError.fromQueueError({ safeError: { retryAfter: 100_000 } }).retryAfter).to.equal(undefined)
    expect(SafeReadError.fromQueueError({ safeError: { retryAfter: 300 } }).retryAfter).to.equal(300)
  })

  it('keeps an existing Safe error without losing its request state', () => {
    const original = new SafeReadError(ISafeErrorCode.rateLimited, 'try later', 429, 30, false)

    expect(SafeReadError.fromThrown(original)).to.equal(original)
    expect(SafeReadError.fromThrown(original)?.reachedUpstream).to.be.false
  })

  it('rebuilds each shared Safe API error with its code and details', () => {
    for (const [code, key] of Object.entries(SAFE_ERROR_KEY)) {
      const status = ERRORS[key].status
      const description = `Safe read failed: ${code}`
      const meta = code === ISafeErrorCode.rateLimited ? { retryAfter: 30 } : undefined
      let caught: unknown
      try {
        throwExposable(key, status, description, meta)
      } catch (error) {
        caught = error
      }

      expect(SafeReadError.fromThrown(caught)).to.include({
        code,
        status,
        message: description,
        retryAfter: meta?.retryAfter,
      })
    }
  })

  it('does not turn unrelated errors or plain values into Safe errors', () => {
    let unrelated: unknown
    try {
      throwExposable(ErrorKeyEnum.badParams)
    } catch (error) {
      unrelated = error
    }

    for (const value of [
      unrelated,
      new Error('database down'),
      new TypeError('bad result'),
      null,
      undefined,
      'safeConnectionError',
      { message: ErrorKeyEnum.safeConnectionError },
    ]) {
      expect(SafeReadError.fromThrown(value)).to.be.null
    }
  })
})
