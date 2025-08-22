import { expect } from 'chai'
import sinon from 'sinon'
import MongoRetryHelper from '@helpers/mongoRetry'
import logger from '@logger'

describe('Helpers: MongoRetryHelper', () => {
  let sandbox: sinon.SinonSandbox
  let loggerErrorStub: sinon.SinonStub
  let loggerWarnStub: sinon.SinonStub
  let clock: sinon.SinonFakeTimers

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerErrorStub = sandbox.stub(logger, 'error')
    loggerWarnStub = sandbox.stub(logger, 'warn')
    clock = sandbox.useFakeTimers()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('isMongoConnectionError', () => {
    it('should return true for MongoDB connection errors', () => {
      const errors = [
        { message: 'Client must be connected before running operations' },
        { message: 'connection refused' },
        { message: 'ECONNREFUSED' },
        { message: 'ETIMEDOUT' },
        { name: 'MongoNotConnectedError' },
        { name: 'MongoNetworkError' },
        { name: 'MongoServerSelectionError' },
      ]

      errors.forEach(error => {
        expect(MongoRetryHelper.isMongoConnectionError(error)).to.be.true
      })
    })

    it('should return false for non-connection errors', () => {
      const errors = [
        { message: 'Document not found' },
        { message: 'Validation error' },
        { name: 'ValidationError' },
        { name: 'CastError' },
        null,
        undefined,
      ]

      errors.forEach(error => {
        expect(MongoRetryHelper.isMongoConnectionError(error)).to.be.false
      })
    })
  })

  describe('retryOperation', () => {
    it('should return result on successful operation', async () => {
      const operation = sandbox.stub().resolves('success')

      const result = await MongoRetryHelper.retryOperation(operation)

      expect(result).to.equal('success')
      expect(operation.calledOnce).to.be.true
    })

    it('should retry on connection error and succeed', async () => {
      const connectionError = new Error('Client must be connected')
      const operation = sandbox.stub()
      operation.onFirstCall().rejects(connectionError)
      operation.onSecondCall().resolves('success')

      const resultPromise = MongoRetryHelper.retryOperation(operation, {
        maxRetries: 3,
        retryDelay: 100,
      })

      // Advance timer for first retry
      await clock.tickAsync(100)

      const result = await resultPromise

      expect(result).to.equal('success')
      expect(operation.callCount).to.equal(2)
      expect(loggerWarnStub.calledWith('MongoDB operation failed, retrying...')).to.be.true
    })

    it('should throw after max retries on connection error', async () => {
      const connectionError = new Error('Client must be connected')
      const operation = sandbox.stub().rejects(connectionError)

      const resultPromise = MongoRetryHelper.retryOperation(operation, {
        maxRetries: 2,
        retryDelay: 100,
      })

      // Advance timer for retries
      await clock.tickAsync(100)
      await clock.tickAsync(200)

      try {
        await resultPromise
        expect.fail('Should have thrown error')
      } catch (error: any) {
        expect(error.message).to.equal('Client must be connected')
        expect(operation.callCount).to.equal(2)
        expect(loggerErrorStub.calledWith('MongoDB operation failed after all retries')).to.be.true
      }
    })

    it('should throw immediately on non-retryable error', async () => {
      const validationError = new Error('Validation failed')
      const operation = sandbox.stub().rejects(validationError)

      try {
        await MongoRetryHelper.retryOperation(operation)
        expect.fail('Should have thrown error')
      } catch (error: any) {
        expect(error.message).to.equal('Validation failed')
        expect(operation.calledOnce).to.be.true
      }
    })

    it('should use custom shouldRetry function', async () => {
      const customError = new Error('Custom error')
      const operation = sandbox.stub()
      operation.onFirstCall().rejects(customError)
      operation.onSecondCall().resolves('success')

      const shouldRetry = (error: any) => error.message === 'Custom error'

      const resultPromise = MongoRetryHelper.retryOperation(operation, {
        shouldRetry,
        maxRetries: 2,
        retryDelay: 100,
      })

      await clock.tickAsync(100)
      const result = await resultPromise

      expect(result).to.equal('success')
      expect(operation.callCount).to.equal(2)
    })

    it('should call onRetry callback', async () => {
      const connectionError = new Error('Client must be connected')
      const operation = sandbox.stub()
      operation.onFirstCall().rejects(connectionError)
      operation.onSecondCall().resolves('success')

      const onRetryStub = sandbox.stub()

      const resultPromise = MongoRetryHelper.retryOperation(operation, {
        onRetry: onRetryStub,
        maxRetries: 2,
        retryDelay: 100,
      })

      await clock.tickAsync(100)
      await resultPromise

      expect(onRetryStub.calledOnce).to.be.true
      expect(onRetryStub.firstCall.args[0]).to.equal(connectionError)
      expect(onRetryStub.firstCall.args[1]).to.equal(1)
    })

    it('should use exponential backoff when enabled', async () => {
      const connectionError = new Error('Client must be connected')
      const operation = sandbox.stub().rejects(connectionError)

      const resultPromise = MongoRetryHelper.retryOperation(operation, {
        maxRetries: 3,
        retryDelay: 100,
        exponentialBackoff: true,
      })

      // First retry after 100ms
      await clock.tickAsync(100)
      expect(operation.callCount).to.equal(2)

      // Second retry after 200ms (100 * 2^1)
      await clock.tickAsync(200)
      expect(operation.callCount).to.equal(3)

      try {
        await resultPromise
      } catch (error) {
        // Expected to fail
      }
    })

    it('should use fixed delay when exponential backoff is disabled', async () => {
      const connectionError = new Error('Client must be connected')
      const operation = sandbox.stub().rejects(connectionError)

      const resultPromise = MongoRetryHelper.retryOperation(operation, {
        maxRetries: 3,
        retryDelay: 100,
        exponentialBackoff: false,
      })

      // All retries at 100ms intervals
      await clock.tickAsync(100)
      expect(operation.callCount).to.equal(2)

      await clock.tickAsync(100)
      expect(operation.callCount).to.equal(3)

      try {
        await resultPromise
      } catch (error) {
        // Expected to fail
      }
    })
  })

  describe('retryOperationSafe', () => {
    it('should return result on success', async () => {
      const operation = sandbox.stub().resolves('success')

      const result = await MongoRetryHelper.retryOperationSafe(operation, 'testOperation')

      expect(result).to.equal('success')
      expect(operation.calledOnce).to.be.true
    })

    it('should return null on failure without throwing', async () => {
      const error = new Error('Operation failed')
      const operation = sandbox.stub().rejects(error)

      const result = await MongoRetryHelper.retryOperationSafe(operation, 'testOperation')

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Failed to execute testOperation after retries')).to.be.true
    })

    it('should retry on connection error before returning null', async () => {
      const connectionError = new Error('Client must be connected')
      const operation = sandbox.stub().rejects(connectionError)

      const resultPromise = MongoRetryHelper.retryOperationSafe(operation, 'testOperation', {
        maxRetries: 2,
        retryDelay: 100,
      })

      await clock.tickAsync(100)
      await clock.tickAsync(200)

      const result = await resultPromise

      expect(result).to.be.null
      expect(operation.callCount).to.equal(2)
    })
  })

  describe('safeUpdate', () => {
    it('should return true on successful update', async () => {
      const operation = sandbox.stub().resolves({ acknowledged: true })

      const result = await MongoRetryHelper.safeUpdate(operation, { taskName: 'test' })

      expect(result).to.be.true
      expect(operation.calledOnce).to.be.true
    })

    it('should return false on failure', async () => {
      const error = new Error('Update failed')
      const operation = sandbox.stub().rejects(error)

      const result = await MongoRetryHelper.safeUpdate(operation, { taskName: 'test' })

      expect(result).to.be.false
      expect(loggerWarnStub.calledWith('MongoDB update failed')).to.be.true
    })

    it('should retry on connection error before returning false', async () => {
      const connectionError = new Error('Client must be connected')
      const operation = sandbox.stub().rejects(connectionError)

      const resultPromise = MongoRetryHelper.safeUpdate(
        operation,
        { taskName: 'test', taskRunId: '123' },
        { maxRetries: 2, retryDelay: 50 },
      )

      await clock.tickAsync(50)
      await clock.tickAsync(100)

      const result = await resultPromise

      expect(result).to.be.false
      expect(operation.callCount).to.equal(2)
    })

    it('should return true after successful retry', async () => {
      const connectionError = new Error('Client must be connected')
      const operation = sandbox.stub()
      operation.onFirstCall().rejects(connectionError)
      operation.onSecondCall().resolves({ acknowledged: true })

      const resultPromise = MongoRetryHelper.safeUpdate(
        operation,
        { serviceName: 'test' },
        { maxRetries: 2, retryDelay: 50 },
      )

      await clock.tickAsync(50)

      const result = await resultPromise

      expect(result).to.be.true
      expect(operation.callCount).to.equal(2)
    })

    it('should include context in error logs', async () => {
      const error = new Error('Update failed')
      const operation = sandbox.stub().rejects(error)
      const context = {
        taskName: 'testTask',
        taskRunId: '123',
        serviceName: 'testService',
      }

      await MongoRetryHelper.safeUpdate(operation, context)

      const logCall = loggerWarnStub.getCall(0)
      expect(logCall.args[0]).to.equal('MongoDB update failed')
      expect(logCall.args[1]).to.include(context)
    })

    it('should use default retry settings for safeUpdate', async () => {
      const connectionError = new Error('Client must be connected')
      const operation = sandbox.stub().rejects(connectionError)

      const resultPromise = MongoRetryHelper.safeUpdate(operation, {})

      // Default is 2 retries with 500ms delay
      await clock.tickAsync(500)
      expect(operation.callCount).to.equal(2)

      await clock.tickAsync(1000)

      const result = await resultPromise
      expect(result).to.be.false
      expect(operation.callCount).to.equal(2)
    })
  })
})
