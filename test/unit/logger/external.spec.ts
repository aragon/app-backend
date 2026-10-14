import config from '@config'
import ExternalLogger from '@src/logger/external'
import Formats from '@src/logger/format'
import LoggerMock from '@test/mock/logger'
import { AxiosError, AxiosHeaders } from 'axios'
import { expect } from 'chai'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import Transport from 'winston-transport'

describe('Logger: ExternalLogger', () => {
  let sandbox: SinonSandbox
  let oldConfigSentryDSN: any
  let mockSentry: any
  let stubSentryInit: any
  let externalLogger: any
  let envConfig: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    envConfig = config.LOG.LOGZIO_KEY
    config.LOG.LOGZIO_KEY = ''
  })

  afterEach(() => {
    sandbox?.restore()
  })

  after(() => {
    config.LOG.LOGZIO_KEY = envConfig
  })

  describe('Log', () => {
    it('hides configured values in external snapshots and keeps ordinary fields', () => {
      const redact = proxyquire.noCallThru().noPreserveCache()('@src/logger/redact', {
        '@config': { __esModule: true, default: LoggerMock.config },
      }).default
      const MockedExternalLogger = proxyquire.noCallThru().noPreserveCache()('@src/logger/external', {
        './redact': { __esModule: true, default: redact },
      }).default
      const transport: any = new MockedExternalLogger({ name: 'external-logger', level: 'verbose' })
      transport.logzioLogger = { log: sandbox.stub() }
      transport.sentry = { setExtra: sandbox.stub(), captureMessage: sandbox.stub() }
      const headers = new AxiosHeaders({ 'x-cg-pro-api-key': LoggerMock.config.COINGECKO.API_KEY })
      const error = new AxiosError(LoggerMock.config.RABBITMQ.URI, 'ERR_BAD_REQUEST', { headers })
      const callback = sandbox.stub()
      transport.log(
        {
          level: 'error',
          message: JSON.stringify(LoggerMock.config),
          error,
          ...LoggerMock.domainFields,
          url: `https://example.test/fake-api-long?key=${encodeURIComponent(LoggerMock.config.SERVICES.ARAGON_TELEGRAM.BOT_TOKEN)}`,
          nested: [LoggerMock.config, JSON.stringify({ credential: LoggerMock.config.PINATA.JWT })],
        },
        callback,
      )

      expect(callback.calledOnce).to.be.true
      expect(transport.logzioLogger.log.calledOnce).to.be.true
      expect(transport.sentry.setExtra.calledOnce).to.be.true
      expect(transport.sentry.captureMessage.calledOnce).to.be.true
      for (const payload of [
        transport.logzioLogger.log.firstCall.args[0],
        transport.sentry.setExtra.firstCall.args[1],
      ]) {
        expect(JSON.stringify(payload)).not.to.include('fake-')
        expect(JSON.stringify(payload)).to.include('[REDACTED]')
        expect(payload.meta || payload).to.include(LoggerMock.domainFields)
      }
      const sentryError = transport.sentry.captureMessage.firstCall.args[0]
      expect(sentryError.message).not.to.include('fake-')
      expect(sentryError.stack).not.to.include('fake-')
      expect(headers.get('x-cg-pro-api-key')).to.equal(LoggerMock.config.COINGECKO.API_KEY)
    })

    it('Should instantiate', () => {
      const externalLogger: any = new ExternalLogger({
        name: 'external-logger',
        level: 'verbose',
      })

      expect(externalLogger.logzioLogger).not.to.exist
      expect(externalLogger.logzioLogger).not.to.exist
    })

    describe('Skip transient MongoDB errors', () => {
      it('Should skip logging when error has WriteConflict code (112)', () => {
        const externalLogger = new ExternalLogger({
          name: 'external-logger',
          level: 'verbose',
        })

        const spyFormatMeta = sandbox.spy(Formats, 'formatMeta')
        const stubCallback = sandbox.stub()

        const error: any = new Error('Some MongoDB error')
        error.code = 112

        externalLogger.log({ level: 'error', message: 'test', error }, stubCallback)

        expect(spyFormatMeta.called).to.be.false
        expect(stubCallback.calledOnce).to.be.true
      })

      it('Should skip logging when error has WriteConflict codeName', () => {
        const externalLogger = new ExternalLogger({
          name: 'external-logger',
          level: 'verbose',
        })

        const spyFormatMeta = sandbox.spy(Formats, 'formatMeta')
        const stubCallback = sandbox.stub()

        const error: any = new Error('Some MongoDB error')
        error.codeName = 'WriteConflict'

        externalLogger.log({ level: 'error', message: 'test', error }, stubCallback)

        expect(spyFormatMeta.called).to.be.false
        expect(stubCallback.calledOnce).to.be.true
      })

      it('Should skip logging when error has LockTimeout codeName', () => {
        const externalLogger = new ExternalLogger({
          name: 'external-logger',
          level: 'verbose',
        })

        const spyFormatMeta = sandbox.spy(Formats, 'formatMeta')
        const stubCallback = sandbox.stub()

        const error: any = new Error('Lock acquisition timeout')
        error.codeName = 'LockTimeout'

        externalLogger.log({ level: 'error', message: 'test', error }, stubCallback)

        expect(spyFormatMeta.called).to.be.false
        expect(stubCallback.calledOnce).to.be.true
      })

      it('Should skip logging when error has NoSuchTransaction codeName', () => {
        const externalLogger = new ExternalLogger({
          name: 'external-logger',
          level: 'verbose',
        })

        const spyFormatMeta = sandbox.spy(Formats, 'formatMeta')
        const stubCallback = sandbox.stub()

        const error: any = new Error('Transaction no longer exists')
        error.codeName = 'NoSuchTransaction'

        externalLogger.log({ level: 'error', message: 'test', error }, stubCallback)

        expect(spyFormatMeta.called).to.be.false
        expect(stubCallback.calledOnce).to.be.true
      })

      it('Should skip logging when error message contains "Write conflict" (with space)', () => {
        const externalLogger = new ExternalLogger({
          name: 'external-logger',
          level: 'verbose',
        })

        const spyFormatMeta = sandbox.spy(Formats, 'formatMeta')
        const stubCallback = sandbox.stub()

        const error = new Error('Caused by :: Write conflict during plan execution')

        externalLogger.log({ level: 'error', message: 'test', error }, stubCallback)

        expect(spyFormatMeta.called).to.be.false
        expect(stubCallback.calledOnce).to.be.true
      })

      it('Should skip logging when error message contains "WriteConflict" (no space)', () => {
        const externalLogger = new ExternalLogger({
          name: 'external-logger',
          level: 'verbose',
        })

        const spyFormatMeta = sandbox.spy(Formats, 'formatMeta')
        const stubCallback = sandbox.stub()

        const error = new Error('WriteConflict error occurred')

        externalLogger.log({ level: 'error', message: 'test', error }, stubCallback)

        expect(spyFormatMeta.called).to.be.false
        expect(stubCallback.calledOnce).to.be.true
      })

      it('Should NOT skip logging for other MongoDB errors', () => {
        const externalLogger = new ExternalLogger({
          name: 'external-logger',
          level: 'verbose',
        })

        const spyFormatMeta = sandbox.spy(Formats, 'formatMeta')
        const stubCallback = sandbox.stub()

        const error: any = new Error('Some other MongoDB error')
        error.code = 11000 // Duplicate key error

        externalLogger.log({ level: 'error', message: 'test', error }, stubCallback)

        expect(spyFormatMeta.calledOnce).to.be.true
        expect(stubCallback.calledOnce).to.be.true
      })

      it('Should NOT skip logging when no error is present', () => {
        const externalLogger = new ExternalLogger({
          name: 'external-logger',
          level: 'verbose',
        })

        const spyFormatMeta = sandbox.spy(Formats, 'formatMeta')
        const stubCallback = sandbox.stub()

        externalLogger.log({ level: 'info', message: 'test' }, stubCallback)

        expect(spyFormatMeta.calledOnce).to.be.true
        expect(stubCallback.calledOnce).to.be.true
      })
    })

    it('Should log', () => {
      const externalLogger = new ExternalLogger({
        name: 'external-logger',
        level: 'verbose',
      })

      const spyFormatMeta = sandbox.spy(Formats, 'formatMeta')
      const stubCallback = sandbox.stub()

      externalLogger.log({ p: 'p1' }, stubCallback)

      expect(spyFormatMeta.calledOnce).to.be.true
      expect(spyFormatMeta.calledWith({ p: 'p1' })).to.be.true
      expect(stubCallback.calledOnce).to.be.true
    })

    it('Should log with logzio', () => {
      const oldConfigLogzioServerName = config.LOG.LOGZIO_SERVER_NAME
      const oldConfigLogzioKey = config.LOG.LOGZIO_KEY
      const oldConfigLogzioHost = config.LOG.LOGZIO_HOST
      config.LOG.LOGZIO_KEY = 'logzio-key'
      config.LOG.LOGZIO_SERVER_NAME = 'backend'
      config.LOG.LOGZIO_HOST = 'listener.logz.io'

      const mockLogzio = {
        log: sandbox.stub(),
      }

      const stubLogzioCreateLogger = sandbox.stub().returns(mockLogzio)

      const { default: MockedExternalLogger } = proxyquire.noCallThru()('@src/logger/external', {
        'logzio-nodejs': {
          createLogger: stubLogzioCreateLogger,
        },
      })

      const externalLogger: any = new MockedExternalLogger({
        name: 'external-logger',
        level: 'verbose',
      })

      expect(stubLogzioCreateLogger.calledOnce).to.be.true
      expect(
        stubLogzioCreateLogger.calledWith({
          token: 'logzio-key',
          host: 'listener.logz.io',
          type: config.LOG.LOGZIO_SERVER_NAME,
          protocol: 'https',
        }),
      ).to.be.true
      expect(externalLogger.logzioLogger).to.eq(mockLogzio)
      config.LOG.LOGZIO_KEY = oldConfigLogzioKey
      config.LOG.LOGZIO_SERVER_NAME = oldConfigLogzioServerName
      config.LOG.LOGZIO_HOST = oldConfigLogzioHost

      const stubCallback = sandbox.stub()
      externalLogger.log(
        {
          level: 'info',
          machine: 'machine1',
          message: 'message1',
          p: 'p1',
        },
        stubCallback,
      )

      expect(mockLogzio.log.calledOnce).to.be.true
      expect(
        mockLogzio.log.calledWith({
          level: 'info',
          message: 'message1',
          machine: 'machine1',
          meta: { p: 'p1' },
        }),
      ).to.be.true
    })

    describe('Sentry', () => {
      let stubCallback: any
      let MockedExternalLogger: any

      beforeEach(() => {
        oldConfigSentryDSN = config.LOG.SENTRY_DSN
        config.LOG.SENTRY_DSN = 'sentry-dsn'

        mockSentry = {
          init: sandbox.stub(),
          setExtra: sandbox.stub(),
          captureMessage: sandbox.stub(),
          close: sandbox.stub(),
        }

        stubSentryInit = mockSentry.init

        MockedExternalLogger = proxyquire.noCallThru()('@src/logger/external', {
          '@sentry/node': mockSentry,
        }).default

        stubCallback = sandbox.stub()
      })

      afterEach(() => {
        config.LOG.SENTRY_DSN = oldConfigSentryDSN
      })

      it('Should not log with sentry no error message', () => {
        externalLogger = new MockedExternalLogger({
          name: 'external-logger',
          level: 'verbose',
        })

        expect(stubSentryInit.calledOnce).to.be.true
        expect(
          stubSentryInit.calledWith({
            dsn: 'sentry-dsn',
            serverName: config.LOG.LOGZIO_SERVER_NAME,
            environment: config.ENVIRONMENT,
            beforeSend: sinon.match.func,
            beforeBreadcrumb: sinon.match.func,
          }),
        ).to.be.true
        expect(externalLogger.sentry).to.exist

        externalLogger.log(
          {
            level: 'info',
            machine: 'machine1',
            message: 'message1',
            p: 'p1',
          },
          stubCallback,
        )

        expect(mockSentry.setExtra.callCount).to.eq(0)
        expect(mockSentry.captureMessage.callCount).to.eq(0)
        expect(stubCallback.calledOnce).to.be.true
      })

      it('hides configured secrets in sentry events and breadcrumbs', () => {
        const redact = proxyquire.noCallThru().noPreserveCache()('@src/logger/redact', {
          '@config': { __esModule: true, default: LoggerMock.config },
        }).default
        const MockedExternalLogger = proxyquire.noCallThru().noPreserveCache()('@src/logger/external', {
          '@sentry/node': mockSentry,
          './redact': { __esModule: true, default: redact },
        }).default
        externalLogger = new MockedExternalLogger({ name: 'external-logger', level: 'verbose' })

        const secret = LoggerMock.config.SAFE_API.API_KEY
        const event = {
          message: `Failed with ${secret}`,
          exception: { values: [{ value: `Request failed with ${secret}` }] },
        }
        const { beforeSend, beforeBreadcrumb } = stubSentryInit.firstCall.args[0]

        expect(beforeSend(event)).to.equal(event)
        expect(event.message).to.equal('Failed with [REDACTED]')
        expect(event.exception.values[0].value).to.equal('Request failed with [REDACTED]')

        const breadcrumb = { message: secret, data: { arguments: [secret] } }
        expect(beforeBreadcrumb(breadcrumb)).to.equal(breadcrumb)
        expect(breadcrumb.message).to.equal('[REDACTED]')
        expect(breadcrumb.data.arguments).to.deep.equal(['[REDACTED]'])
      })

      it('Should not log with sentry error exposed message', () => {
        externalLogger = new MockedExternalLogger({
          name: 'external-logger',
          level: 'verbose',
        })

        const error: any = new Error('fake-error1')
        error.exposeCustom_ = true

        externalLogger.log(
          {
            level: 'error',
            machine: 'machine1',
            message: 'message1',
            tags: ['tag1'],
            error,
            p: 'p1',
          },
          stubCallback,
        )

        expect(mockSentry.setExtra.callCount).to.eq(0)
        expect(mockSentry.captureMessage.callCount).to.eq(0)
        expect(stubCallback.calledOnce).to.be.true
      })

      it('Should log with sentry error', () => {
        externalLogger = new MockedExternalLogger({
          name: 'external-logger',
          level: 'verbose',
        })

        const log = {
          level: 'error',
          machine: 'machine1',
          message: 'message1',
          tags: ['tag1'],
          error: new Error('fake-error1'),
          p: 'p1',
        }

        externalLogger.log(log, stubCallback)

        expect(mockSentry.setExtra.calledOnce).to.be.true
        expect(mockSentry.setExtra.args[0][0]).to.eq('info')
        // setExtra now receives a serialized JSON snapshot (scrubbed for URL API keys),
        // not the live winston info reference — verify the scalar fields that carry over.
        const sentryExtra = mockSentry.setExtra.args[0][1]
        expect(sentryExtra.level).to.equal('error')
        expect(sentryExtra.message).to.equal('message1')
        expect(sentryExtra.errorMessage).to.equal('fake-error1')

        expect(mockSentry.captureMessage.calledOnce).to.be.true
        expect(mockSentry.captureMessage.args[0][0].message).to.eq('message1 - fake-error1')
        expect(stubCallback.calledOnce).to.be.true
      })

      it('Should log with sentry error with user', () => {
        externalLogger = new MockedExternalLogger({
          name: 'external-logger',
          level: 'verbose',
        })

        const log = {
          level: 'error',
          machine: 'machine1',
          message: 'message1',
          tags: ['tag1'],
          error: new Error('fake-error1'),
          p: 'p1',
          userId: 'account-123',
        }

        externalLogger.logzioLogger = {
          log: sandbox.stub(),
        }

        externalLogger.log(log, stubCallback)

        expect(externalLogger.logzioLogger.log.calledOnce).to.be.true
        expect(mockSentry.setExtra.calledOnce).to.be.true
        expect(mockSentry.setExtra.args[0][0]).to.eq('info')
        // setExtra now receives a serialized JSON snapshot (scrubbed for URL API keys),
        // not the live winston info reference — verify the scalar fields that carry over.
        const sentryExtra = mockSentry.setExtra.args[0][1]
        expect(sentryExtra.level).to.equal('error')
        expect(sentryExtra.message).to.equal('message1')
        expect(sentryExtra.errorMessage).to.equal('fake-error1')
        expect(sentryExtra.userId).to.equal('account-123')

        expect(mockSentry.captureMessage.calledOnce).to.be.true
        expect(mockSentry.captureMessage.args[0][0].message).to.eq('message1 - fake-error1')
        expect(stubCallback.calledOnce).to.be.true
      })
    })
  })

  describe('Purge', () => {
    beforeEach(() => {
      externalLogger = new ExternalLogger({
        name: 'external-logger',
        level: 'verbose',
      })
    })

    it('Should purge', () => {
      expect(externalLogger.purge()).to.be.true
    })

    it('Should purge with logzio', () => {
      externalLogger.logzioLogger = {
        sendAndClose: sandbox.stub(),
      }

      expect(externalLogger.purge()).to.be.true

      expect(externalLogger.logzioLogger.sendAndClose.calledOnce).to.be.true
    })

    it('Should purge sentry', () => {
      externalLogger.sentry = {
        close: sandbox.stub(),
      }

      expect(externalLogger.purge()).to.be.true

      expect(externalLogger.sentry.close.calledOnce).to.be.true
    })
  })

  it('end', () => {
    const stubWinston = sandbox.stub(Transport.prototype, 'end')

    const externalLogger = new ExternalLogger()
    const testArgs = ['arg1', 'arg2']

    externalLogger.end(...testArgs)
    expect(stubWinston.calledOnce).to.be.true
    expect(stubWinston.args[0][0]).to.eq(testArgs[0])
    expect(stubWinston.args[0][1]).to.eq(testArgs[1])
  })
})
