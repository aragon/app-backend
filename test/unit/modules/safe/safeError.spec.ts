import { SafeReadError } from '@modules/safe/safeError'
import { ISafeErrorCode } from '@types'
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
})
