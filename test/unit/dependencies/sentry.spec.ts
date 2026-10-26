import { execFileSync } from 'child_process'
import { expect } from 'chai'

describe('Sentry dependency', () => {
  it('sends a redacted error with the configured collection policy', () => {
    const script = `
      const proxyquire = require('proxyquire').noCallThru().noPreserveCache()
      const config = require('@config').default
      const Sentry = require('@sentry/node')
      const LoggerMock = require('./test/mock/logger').default
      const envelopes = []
      const sdk = {
        init: options => Sentry.init({
          ...options,
          defaultIntegrations: [],
          transport: () => ({
            send: envelope => {
              envelopes.push(envelope)
              return Promise.resolve({ statusCode: 200 })
            },
            flush: () => Promise.resolve(true),
          }),
        }),
        setExtra: Sentry.setExtra,
        captureMessage: Sentry.captureMessage,
        close: Sentry.close,
      }
      const redact = proxyquire('./src/logger/redact', {
        '@config': { __esModule: true, default: LoggerMock.config },
      }).default
      const ExternalLogger = proxyquire('./src/logger/external', {
        '@sentry/node': sdk,
        './redact': { __esModule: true, default: redact },
      }).default

      async function main() {
        config.LOG.LOGZIO_KEY = ''
        config.LOG.SENTRY_DSN = 'https://public@example.test/1'
        const logger = new ExternalLogger()
        const transient = new Error('retry')
        transient.code = 112
        const exposed = new Error('public')
        exposed.exposeCustom_ = true
        logger.log({ level: 'error', message: 'retry', error: transient }, () => {})
        logger.log({ level: 'error', message: 'public', error: exposed }, () => {})

        const secret = LoggerMock.config.SAFE_API.API_KEY
        const error = new Error('failed with ' + secret)
        logger.log({ level: 'error', message: 'failed with ' + secret, error }, () => {})
        await Sentry.flush(2000)

        const events = envelopes.flatMap(envelope => envelope[1])
          .filter(item => item[0].type === 'event')
          .map(item => item[1])
        const options = Sentry.getClient().getOptions()
        console.log('SENTRY_PROBE:' + JSON.stringify({
          count: events.length,
          event: events[0],
          secret,
          originalMessage: error.message,
          attachStacktrace: options.attachStacktrace,
          dataCollection: options.dataCollection,
        }))
        await Sentry.close(2000)
      }
      main().catch(error => { console.error(error); process.exitCode = 1 })
    `
    const output = execFileSync(
      process.execPath,
      ['-r', 'ts-node/register/transpile-only', '-r', 'tsconfig-paths/register', '-e', script],
      { cwd: process.cwd(), encoding: 'utf8', timeout: 10000 },
    )
    const line = output.split('\n').find(value => value.startsWith('SENTRY_PROBE:'))
    expect(line).to.exist
    const result = JSON.parse(line!.slice('SENTRY_PROBE:'.length))
    const event = JSON.stringify(result.event)

    expect(result.count).to.equal(1)
    expect(event).not.to.include(result.secret)
    expect(event).to.include('[REDACTED]')
    expect(result.originalMessage).to.include(result.secret)
    expect(result.event.user).to.be.undefined
    expect(result.event.request).to.be.undefined
    expect(result.attachStacktrace).to.be.false
    expect(result.dataCollection).to.include({
      userInfo: false,
      cookies: false,
      databaseQueryData: false,
      queues: false,
    })
    expect(result.dataCollection.httpBodies).to.deep.equal([])
    expect(result.dataCollection.genAI).to.deep.equal({ inputs: false, outputs: false })
    expect(result.dataCollection.graphQL).to.deep.equal({ document: false, variables: false })
  })
})
