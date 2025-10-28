import { expect } from 'chai'
import sinon, { type SinonSandbox, type SinonStub } from 'sinon'
import { CrawlerErrorHandler } from '@modules/crawlers'
import { CrawlerErrorType } from '@types'
import logger from '@logger'
import utils from '@helpers/utils'

describe('Module: CrawlerErrorHandler', () => {
  let sandbox: SinonSandbox
  let errorHandler: CrawlerErrorHandler
  let logWarnStub: SinonStub
  let waitStub: SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    logWarnStub = sandbox.stub(logger, 'warn')
    waitStub = sandbox.stub(utils, 'wait').resolves()
    errorHandler = new CrawlerErrorHandler()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const handler = new CrawlerErrorHandler()
      expect(handler).to.exist
    })

    it('should initialize with custom config', () => {
      const handler = new CrawlerErrorHandler({
        maxRetries: 10,
        baseBackoffMs: 1000,
        maxBackoffMs: 20000,
        stopOnError: true,
      })
      expect(handler).to.exist
    })
  })

  describe('classifyError', () => {
    it('should classify rate limit errors', () => {
      const error = new Error('Your app has exceeded its compute units per second capacity')
      const type = errorHandler.classifyError(error)
      expect(type).to.equal(CrawlerErrorType.RATE_LIMITED)
    })

    it('should classify batch size errors', () => {
      const error = new Error('The query timed out')
      const type = errorHandler.classifyError(error)
      expect(type).to.equal(CrawlerErrorType.BATCH_SIZE_ERROR)
    })

    it('should classify network errors', () => {
      const error = new Error('ECONNREFUSED')
      const type = errorHandler.classifyError(error)
      expect(type).to.equal(CrawlerErrorType.NETWORK_ERROR)
    })

    it('should classify unknown errors', () => {
      const error = new Error('Something else went wrong')
      const type = errorHandler.classifyError(error)
      expect(type).to.equal(CrawlerErrorType.UNKNOWN)
    })
  })

  describe('isNetworkError', () => {
    it('should detect ECONNREFUSED errors', () => {
      const error = new Error('ECONNREFUSED')
      expect(errorHandler.isNetworkError(error)).to.be.true
    })

    it('should detect ENOTFOUND errors', () => {
      const error = new Error('ENOTFOUND')
      expect(errorHandler.isNetworkError(error)).to.be.true
    })

    it('should detect ETIMEDOUT errors', () => {
      const error = new Error('ETIMEDOUT')
      expect(errorHandler.isNetworkError(error)).to.be.true
    })

    it('should detect ECONNRESET errors', () => {
      const error = new Error('ECONNRESET')
      expect(errorHandler.isNetworkError(error)).to.be.true
    })

    it('should detect network timeout errors', () => {
      const error = new Error('network timeout occurred')
      expect(errorHandler.isNetworkError(error)).to.be.true
    })

    it('should detect socket hang up errors', () => {
      const error = new Error('socket hang up')
      expect(errorHandler.isNetworkError(error)).to.be.true
    })

    it('should detect EHOSTUNREACH errors', () => {
      const error = new Error('connect EHOSTUNREACH')
      expect(errorHandler.isNetworkError(error)).to.be.true
    })

    it('should not detect non-network errors', () => {
      const error = new Error('Some other error')
      expect(errorHandler.isNetworkError(error)).to.be.false
    })
  })

  describe('shouldRetryError', () => {
    it('should return false when stopOnError is true', () => {
      const handler = new CrawlerErrorHandler({ stopOnError: true })
      const shouldRetry = handler.shouldRetryError(CrawlerErrorType.RATE_LIMITED)
      expect(shouldRetry).to.be.false
    })

    it('should retry RATE_LIMITED errors', () => {
      const shouldRetry = errorHandler.shouldRetryError(CrawlerErrorType.RATE_LIMITED)
      expect(shouldRetry).to.be.true
    })

    it('should retry NETWORK_ERROR errors', () => {
      const shouldRetry = errorHandler.shouldRetryError(CrawlerErrorType.NETWORK_ERROR)
      expect(shouldRetry).to.be.true
    })

    it('should not retry BATCH_SIZE_ERROR', () => {
      const shouldRetry = errorHandler.shouldRetryError(CrawlerErrorType.BATCH_SIZE_ERROR)
      expect(shouldRetry).to.be.false
    })

    it('should not retry UNKNOWN errors', () => {
      const shouldRetry = errorHandler.shouldRetryError(CrawlerErrorType.UNKNOWN)
      expect(shouldRetry).to.be.false
    })
  })

  describe('calculateBackoff', () => {
    it('should calculate backoff for RATE_LIMITED errors with minimum 2 seconds', () => {
      const backoff = errorHandler.calculateBackoff(CrawlerErrorType.RATE_LIMITED)
      expect(backoff).to.be.at.least(2000)
    })

    it('should calculate backoff for NETWORK_ERROR with minimum 1 second', () => {
      const backoff = errorHandler.calculateBackoff(CrawlerErrorType.NETWORK_ERROR)
      expect(backoff).to.be.at.least(1000)
    })

    it('should not exceed maxBackoffMs', () => {
      const handler = new CrawlerErrorHandler({ maxBackoffMs: 5000 })
      // Simulate multiple retries to trigger high backoff
      for (let i = 0; i < 10; i++) {
        handler.analyzeError(new Error('rate limit exceeded'))
      }
      const backoff = handler.calculateBackoff(CrawlerErrorType.RATE_LIMITED)
      expect(backoff).to.be.at.most(5000)
    })
  })

  describe('handleError', () => {
    it('should log error and wait when retry is needed', async () => {
      const error = new Error('rate limit exceeded')
      await errorHandler.handleError(error)

      expect(logWarnStub.calledOnce).to.be.true
      expect(waitStub.calledOnce).to.be.true
    })

    it('should log error with context', async () => {
      const error = new Error('ECONNREFUSED')
      const context = { network: 'ethereum', block: 1000 }
      await errorHandler.handleError(error, context)

      expect(logWarnStub.calledOnce).to.be.true
      const logCall = logWarnStub.getCall(0)
      expect(logCall.args[1]).to.include({ network: 'ethereum', block: 1000 })
    })

    it('should not wait when retry is not needed', async () => {
      const error = new Error('unknown error')
      await errorHandler.handleError(error)

      expect(logWarnStub.calledOnce).to.be.true
      expect(waitStub.called).to.be.false
    })

    it('should increment retry count after handling', async () => {
      const error = new Error('rate limit exceeded')
      await errorHandler.handleError(error)

      const analysis1 = errorHandler.analyzeError(error)
      expect(logWarnStub.getCall(0).args[1]).to.have.property('retryCount', 0)

      await errorHandler.handleError(error)
      expect(logWarnStub.getCall(1).args[1]).to.have.property('retryCount', 1)
    })
  })

  describe('getErrorMessage', () => {
    it('should extract message from string error', () => {
      const analysis = errorHandler.analyzeError('Simple error string')
      expect(analysis.message).to.equal('Simple error string')
    })

    it('should extract message from Error object', () => {
      const error = new Error('Error message')
      const analysis = errorHandler.analyzeError(error)
      expect(analysis.message).to.equal('Error message')
    })

    it('should extract nested error.error.message', () => {
      const error = {
        error: {
          message: 'Nested error message',
        },
      }
      const analysis = errorHandler.analyzeError(error)
      expect(analysis.message).to.equal('Nested error message')
    })

    it('should extract error.response.data.error', () => {
      const error = {
        response: {
          data: {
            error: 'Response error message',
          },
        },
      }
      const analysis = errorHandler.analyzeError(error)
      expect(analysis.message).to.equal('Response error message')
    })

    it('should stringify complex objects', () => {
      const error = { code: 500, details: 'Internal error' }
      const analysis = errorHandler.analyzeError(error)
      expect(analysis.message).to.include('500')
      expect(analysis.message).to.include('Internal error')
    })
  })

  describe('toError', () => {
    it('should return Error instance as-is', () => {
      const error = new Error('Test error')
      const result = errorHandler.toError(error)
      expect(result).to.equal(error)
    })

    it('should convert string to Error', () => {
      const result = errorHandler.toError('String error')
      expect(result).to.be.instanceOf(Error)
      expect(result.message).to.equal('String error')
    })

    it('should preserve error code', () => {
      const error = { message: 'RPC error', code: -32000 }
      const result = errorHandler.toError(error)
      expect(result).to.be.instanceOf(Error)
      expect((result as any).code).to.equal(-32000)
    })

    it('should preserve error data', () => {
      const error = { message: 'RPC error', data: { extraInfo: 'details' } }
      const result = errorHandler.toError(error)
      expect(result).to.be.instanceOf(Error)
      expect((result as any).data).to.deep.equal({ extraInfo: 'details' })
    })

    it('should preserve original error', () => {
      const error = { message: 'Custom error', customField: 'value' }
      const result = errorHandler.toError(error)
      expect((result as any).originalError).to.deep.equal(error)
    })

    it('should handle nested error formats', () => {
      const error = {
        error: {
          message: 'Nested error',
        },
        code: 123,
      }
      const result = errorHandler.toError(error)
      expect(result).to.be.instanceOf(Error)
      expect(result.message).to.equal('Nested error')
      expect((result as any).code).to.equal(123)
    })
  })

  describe('analyzeError', () => {
    it('should return complete analysis for retryable error', () => {
      const error = new Error('rate limit exceeded')
      const analysis = errorHandler.analyzeError(error)

      expect(analysis.type).to.equal(CrawlerErrorType.RATE_LIMITED)
      expect(analysis.shouldRetry).to.be.true
      expect(analysis.backoffMs).to.be.a('number')
      expect(analysis.message).to.equal('rate limit exceeded')
    })

    it('should return analysis without backoff for non-retryable error', () => {
      const error = new Error('The query timed out')
      const analysis = errorHandler.analyzeError(error)

      expect(analysis.type).to.equal(CrawlerErrorType.BATCH_SIZE_ERROR)
      expect(analysis.shouldRetry).to.be.false
      expect(analysis.backoffMs).to.be.undefined
    })
  })

  describe('Integration scenarios', () => {
    it('should handle multiple retries with increasing backoff', async () => {
      const error = new Error('ETIMEDOUT')

      const analysis1 = errorHandler.analyzeError(error)
      await errorHandler.handleError(error)
      const backoff1 = analysis1.backoffMs!

      const analysis2 = errorHandler.analyzeError(error)
      await errorHandler.handleError(error)
      const backoff2 = analysis2.backoffMs!

      expect(backoff2).to.be.greaterThan(backoff1)
      expect(waitStub.callCount).to.equal(2)
    })

    it('should stop retrying after maxRetries', async () => {
      const handler = new CrawlerErrorHandler({ maxRetries: 2 })
      const error = new Error('network timeout')

      // Retry 1
      await handler.handleError(error)
      // Retry 2
      await handler.handleError(error)

      // After maxRetries, should not retry anymore
      const analysis = handler.analyzeError(error)
      expect(analysis.shouldRetry).to.be.false
    })

    it('should handle mixed error types correctly', async () => {
      const rateLimitError = new Error('rate limit exceeded')
      const batchError = new Error('The query timed out')
      const networkError = new Error('ECONNRESET')

      const analysis1 = errorHandler.analyzeError(rateLimitError)
      expect(analysis1.shouldRetry).to.be.true

      const analysis2 = errorHandler.analyzeError(batchError)
      expect(analysis2.shouldRetry).to.be.false

      const analysis3 = errorHandler.analyzeError(networkError)
      expect(analysis3.shouldRetry).to.be.true
    })
  })
})
