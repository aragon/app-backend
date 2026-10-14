import LoggerMock from '@test/mock/logger'
import { expect } from 'chai'
import proxyquire from 'proxyquire'

describe('Logger: Redact', () => {
  const loadRedact = () =>
    proxyquire.noCallThru().noPreserveCache()('@src/logger/redact', {
      '@config': { __esModule: true, default: LoggerMock.config },
    }).default

  it('hides every configured credential and skips empty values', () => {
    const redact = loadRedact()
    const output = redact.text(JSON.stringify(LoggerMock.config))
    expect(output).not.to.include('fake-')
    expect(output).to.include('[REDACTED]')
    expect(redact.text('ordinary value')).to.equal('ordinary value')
  })

  it('replaces longer overlapping values first and all occurrences', () => {
    const redact = loadRedact()
    expect(redact.text('fake-api-long fake-api fake-api-long')).to.equal('[REDACTED] [REDACTED] [REDACTED]')
  })

  it('hides URI credentials, encoded values and JSON escapes', () => {
    const redact = loadRedact()
    expect(redact.text('fake-mongo-user:fake-mongo%40password fake-rabbit-user:fake-rabbit-password')).to.equal(
      '[REDACTED] [REDACTED]',
    )
    expect(redact.text('https://example.test/path/fake-api-long?key=fake-api')).to.equal(
      'https://example.test/path/[REDACTED]?key=[REDACTED]',
    )
    expect(redact.text(encodeURIComponent(LoggerMock.config.SERVICES.ARAGON_TELEGRAM.BOT_TOKEN))).to.equal('[REDACTED]')
    expect(redact.text(JSON.stringify(LoggerMock.config.PINATA.JWT))).to.equal('"[REDACTED]"')
    expect(redact.text(encodeURIComponent(LoggerMock.config.MONGO_DB.URI))).to.equal('[REDACTED]')
    expect(redact.text(encodeURIComponent('fake-mongo-user:fake-mongo%40password'))).to.equal('[REDACTED]')
  })

  it('keeps usernames, userAgent and the word user visible', () => {
    const redact = loadRedact()
    const input = 'userAgent belongs to a user, fake-mongo-user and fake-rabbit-user'
    expect(redact.text(input)).to.equal(input)
  })

  it('walks nested objects, arrays and stringified JSON without matching field names', () => {
    const redact = loadRedact()
    const payload = {
      ...LoggerMock.domainFields,
      nested: [{ value: 'fake-api', json: JSON.stringify({ credential: LoggerMock.config.PINATA.JWT }) }],
      url: LoggerMock.config.RABBITMQ.URI,
      count: 123,
      empty: null,
    }
    redact.payload(payload)
    expect(payload).to.include(LoggerMock.domainFields)
    expect(payload.nested).to.deep.equal([{ value: '[REDACTED]', json: '{"credential":"[REDACTED]"}' }])
    expect(payload.url).to.equal('[REDACTED]')
    expect(payload.count).to.equal(123)
    expect(payload.empty).to.be.null
    expect(redact.text('https://unknown.g.alchemy.com/v2/unconfigured-secret')).to.equal(
      'https://unknown.g.alchemy.com/v2/unconfigured-secret',
    )
  })

  it('ignores primitives and null', () => {
    const redact = loadRedact()
    for (const value of [null, undefined, 123, 'ordinary']) expect(() => redact.payload(value)).not.to.throw()
  })
})
