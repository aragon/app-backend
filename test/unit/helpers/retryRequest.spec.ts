import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Utils from '@helpers/utils'
import Logger from '@logger'
import * as RetryRequest from '@helpers/retryRequest'
import config from '@config'

describe('Helpers:RetryRequest', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('retryRequest', () => {
    it('should successfully make a request on the first try', async () => {
      const mockResponse = { data: 'success' }
      const requestFunction = sandbox.stub().resolves(mockResponse)

      const response = await RetryRequest.retryRequest(requestFunction)

      expect(response).to.eql(mockResponse)
      expect(requestFunction.calledOnce).to.be.true
    })

    it('should retry and succeed after a rate limit error with status 429', async () => {
      const mockResponse = { data: 'success' }
      const requestFunction = sandbox
        .stub()
        .onFirstCall()
        .rejects({ response: { status: 429 } })
        .onSecondCall()
        .resolves(mockResponse)

      const waitStub = sandbox.stub(Utils, 'wait').resolves()
      const warnStub = sandbox.stub(Logger, 'warn')

      const response = await RetryRequest.retryRequest(requestFunction, { maxRetries: 2 })

      expect(response).to.eql(mockResponse)
      expect(requestFunction.calledTwice).to.be.true
      expect(waitStub.calledOnce).to.be.true
      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.calledWithMatch('Rate limit exceeded, retrying...' as any)).to.be.true
    })

    it('should retry and succeed after a rate limit error with direct status 429', async () => {
      const mockResponse = { data: 'success' }
      const requestFunction = sandbox
        .stub()
        .onFirstCall()
        .rejects({ status: 429 })
        .onSecondCall()
        .resolves(mockResponse)

      const waitStub = sandbox.stub(Utils, 'wait').resolves()
      const warnStub = sandbox.stub(Logger, 'warn')

      const response = await RetryRequest.retryRequest(requestFunction, { maxRetries: 2 })

      expect(response).to.eql(mockResponse)
      expect(requestFunction.calledTwice).to.be.true
      expect(waitStub.calledOnce).to.be.true
      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.calledWithMatch('Rate limit exceeded, retrying...' as any)).to.be.true
    })

    it('should retry and succeed after a rate limit error with info.error.code 429', async () => {
      const mockResponse = { data: 'success' }
      const requestFunction = sandbox
        .stub()
        .onFirstCall()
        .rejects({ info: { error: { code: 429 } } })
        .onSecondCall()
        .resolves(mockResponse)

      const waitStub = sandbox.stub(Utils, 'wait').resolves()
      const warnStub = sandbox.stub(Logger, 'warn')

      const response = await RetryRequest.retryRequest(requestFunction, { maxRetries: 2 })

      expect(response).to.eql(mockResponse)
      expect(requestFunction.calledTwice).to.be.true
      expect(waitStub.calledOnce).to.be.true
      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.calledWithMatch('Rate limit exceeded, retrying...' as any)).to.be.true
    })

    it('should retry when canBeRetried returns true', async () => {
      const mockResponse = { data: 'success' }
      const retryableError = { reason: 'future lookup' }

      const requestFunction = sandbox.stub().onFirstCall().rejects(retryableError).onSecondCall().resolves(mockResponse)

      const waitStub = sandbox.stub(Utils, 'wait').resolves()
      const warnStub = sandbox.stub(Logger, 'warn')

      const response = await RetryRequest.retryRequest(requestFunction, { maxRetries: 2 })

      expect(response).to.eql(mockResponse)
      expect(requestFunction.calledTwice).to.be.true
      expect(waitStub.calledOnce).to.be.true
      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.calledWithMatch('ForceRetry, retrying...' as any)).to.be.true
    })

    it('should retry when the error is SERVER_ERROR and isErrorRelatedToServerIssue returns true', async () => {
      const mockResponse = { data: 'success' }

      const serverError = new Error('Simulated Server Error') as any
      serverError.code = 'SERVER_ERROR'
      serverError.requestBody = JSON.stringify({
        method: 'eth_getBlockByNumber',
        params: [{}],
      })

      const requestFunction = sandbox.stub().onFirstCall().rejects(serverError).onSecondCall().resolves(mockResponse)

      const waitStub = sandbox.stub(Utils, 'wait').resolves()
      const warnStub = sandbox.stub(Logger, 'warn')

      // Important: stub BEFORE the function is called
      sandbox.stub(RetryRequest, 'isErrorRelatedToServerIssue').callsFake(error => {
        return error === serverError
      })

      const response = await RetryRequest.retryRequest(requestFunction, { maxRetries: 2 })

      expect(response).to.eql(mockResponse)
      expect(requestFunction.calledTwice).to.be.true
      expect(waitStub.calledOnce).to.be.true
      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.calledWithMatch('Warn, retrying on alchemy server error...' as any)).to.be.true
    })

    it('should retry when the error is TIMEOUT and isErrorRelatedToServerIssue returns true', async () => {
      const mockResponse = { data: 'success' }

      const timeoutError = new Error('Simulated Timeout Error') as any
      timeoutError.code = 'TIMEOUT'
      timeoutError.requestBody = JSON.stringify({
        method: 'eth_blockNumber',
      })

      const requestFunction = sandbox.stub().onFirstCall().rejects(timeoutError).onSecondCall().resolves(mockResponse)

      const waitStub = sandbox.stub(Utils, 'wait').resolves()
      const warnStub = sandbox.stub(Logger, 'warn')

      // Important: stub BEFORE the function is called
      sandbox.stub(RetryRequest, 'isErrorRelatedToServerIssue').callsFake(error => {
        return error === timeoutError
      })

      const response = await RetryRequest.retryRequest(requestFunction, { maxRetries: 2 })

      expect(response).to.eql(mockResponse)
      expect(requestFunction.calledTwice).to.be.true
      expect(waitStub.calledOnce).to.be.true
      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.calledWithMatch('Warn, retrying on alchemy server error...' as any)).to.be.true
    })

    it('should throw an error after exceeding max retries', async () => {
      const requestFunction = sandbox.stub().rejects({ response: { status: 429 } })
      const waitStub = sandbox.stub(Utils, 'wait').resolves()

      try {
        await RetryRequest.retryRequest(requestFunction, { maxRetries: 2 })
        expect.fail('should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Request failed after 2 retries')
        expect(requestFunction.calledTwice).to.be.true
        expect(waitStub.calledTwice).to.be.true
      }
    })

    it('should throw a non-retry error immediately', async () => {
      const nonRetryError = new Error('Non-retry error')
      const requestFunction = sandbox.stub().rejects(nonRetryError)

      try {
        await RetryRequest.retryRequest(requestFunction)
        expect.fail('should have thrown an error')
      } catch (error: any) {
        expect(error).to.equal(nonRetryError)
        expect(requestFunction.calledOnce).to.be.true
      }
    })

    it('should throw a rate limit error when response message is NOTOK', async () => {
      const mockResponse = { data: { message: 'NOTOK' } }
      const requestFunction = sandbox.stub().resolves(mockResponse)

      sandbox.stub(Utils, 'wait').resolves()
      sandbox.stub(Logger, 'warn')
      const assertStub = sandbox.stub().throws(new Error('Rate limit'))
      sandbox.stub(require('@errors'), 'assert').value(assertStub)

      try {
        await RetryRequest.retryRequest(requestFunction, { maxRetries: 5 })
        expect.fail('should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Rate limit')
        expect(requestFunction.calledOnce).to.be.true
        expect(assertStub.calledOnce).to.be.true
      }
    })

    it('should use default maxRetries from config if not provided', async () => {
      sandbox.stub(config.RETRY_REQUEST, 'COUNT').value(3)
      const requestFunction = sandbox.stub().rejects({ response: { status: 429 } })
      const waitStub = sandbox.stub(Utils, 'wait').resolves()

      try {
        await RetryRequest.retryRequest(requestFunction)
        expect.fail('should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Request failed after 3 retries')
        expect(requestFunction.calledThrice).to.be.true
        expect(waitStub.calledThrice).to.be.true
      }
    })
  })

  describe('retryResult', () => {
    it('should return result on successful attempt', async () => {
      const expectedResult = { data: 'success' }
      const fn = sandbox.stub().resolves(expectedResult)
      const result = await RetryRequest.retryResult(fn, 3, 100)

      expect(result).to.equal(expectedResult)
      expect(fn.calledOnce).to.be.true
    })

    it('should retry when result is null', async () => {
      const expectedResult = { data: 'success' }
      const fn = sandbox.stub().onFirstCall().resolves(null).onSecondCall().resolves(expectedResult)

      const warnStub = sandbox.stub(Logger, 'warn')
      const result = await RetryRequest.retryResult(fn, 3, 10)

      expect(result).to.equal(expectedResult)
      expect(fn.calledTwice).to.be.true
      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.calledWithMatch('Retry attempt 1 failed not found' as any)).to.be.true
    })

    it('should retry when result is undefined', async () => {
      const expectedResult = { data: 'success' }
      const fn = sandbox.stub().onFirstCall().resolves(undefined).onSecondCall().resolves(expectedResult)

      const warnStub = sandbox.stub(Logger, 'warn')
      const result = await RetryRequest.retryResult(fn, 3, 10)

      expect(result).to.equal(expectedResult)
      expect(fn.calledTwice).to.be.true
      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.calledWithMatch('Retry attempt 1 failed not found' as any)).to.be.true
    })

    it('should retry when an error occurs', async () => {
      const expectedResult = { data: 'success' }
      const error = new Error('Test error')
      const fn = sandbox.stub().onFirstCall().rejects(error).onSecondCall().resolves(expectedResult)

      const errorStub = sandbox.stub(Logger, 'error')
      const result = await RetryRequest.retryResult(fn, 3, 10)

      expect(result).to.equal(expectedResult)
      expect(fn.calledTwice).to.be.true
      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWithMatch('Retry attempt 1 failed due to error:' as any)).to.be.true
    })

    it('should return null after all retries fail', async () => {
      const fn = sandbox.stub().resolves(null)
      const warnStub = sandbox.stub(Logger, 'warn')

      const result = await RetryRequest.retryResult(fn, 3, 10)

      expect(result).to.be.null
      expect(fn.calledThrice).to.be.true
      expect(warnStub.calledThrice).to.be.true
    })

    it('should return null after all retries throw errors', async () => {
      const error = new Error('Test error')
      const fn = sandbox.stub().rejects(error)
      const errorStub = sandbox.stub(Logger, 'error')

      const result = await RetryRequest.retryResult(fn, 3, 10)

      expect(result).to.be.null
      expect(fn.calledThrice).to.be.true
      expect(errorStub.calledThrice).to.be.true
    })
  })

  describe('canBeRetried', () => {
    it('should return true if the error reason includes "future lookup"', () => {
      const error = { reason: 'some future lookup issue' }
      expect(RetryRequest.canBeRetried(error)).to.be.true
    })

    it('should return false if error is undefined', () => {
      expect(RetryRequest.canBeRetried(undefined)).to.be.false
    })

    it('should return false if error has no reason property', () => {
      const error = { message: 'Some random error' }
      expect(RetryRequest.canBeRetried(error)).to.be.false
    })

    it('should return false if reason does not include "future lookup"', () => {
      const error = { reason: 'some other error' }
      expect(RetryRequest.canBeRetried(error)).to.be.false
    })
  })

  describe('isErrorRelatedToServerIssue', () => {
    it('should return true for whitelisted method: eth_blockNumber', () => {
      const error = {
        code: 'SERVER_ERROR',
        requestBody: JSON.stringify({ method: 'eth_blockNumber' }),
      }
      expect(RetryRequest.isErrorRelatedToServerIssue(error)).to.be.true
    })

    it('should return true for whitelisted method: eth_getBlockByNumber', () => {
      const error = {
        code: 'SERVER_ERROR',
        requestBody: JSON.stringify({ method: 'eth_getBlockByNumber' }),
      }
      expect(RetryRequest.isErrorRelatedToServerIssue(error)).to.be.true
    })

    it('should return true for whitelisted method: eth_getBlockReceipts', () => {
      const error = {
        code: 'SERVER_ERROR',
        requestBody: JSON.stringify({ method: 'eth_getBlockReceipts' }),
      }
      expect(RetryRequest.isErrorRelatedToServerIssue(error)).to.be.true
    })

    it('should return true for whitelisted method: eth_getTransactionReceipt', () => {
      const error = {
        code: 'SERVER_ERROR',
        requestBody: JSON.stringify({ method: 'eth_getTransactionReceipt' }),
      }
      expect(RetryRequest.isErrorRelatedToServerIssue(error)).to.be.true
    })

    it('should return false for non-whitelisted methods', () => {
      const error = {
        requestBody: JSON.stringify({ method: 'eth_getBalance' }),
      }
      expect(RetryRequest.isErrorRelatedToServerIssue(error)).to.be.false
    })

    it('should return true if method is "eth_getLogs" with same fromBlock and toBlock', () => {
      const error = {
        code: 'TIMEOUT',
        requestBody: JSON.stringify({
          method: 'eth_getLogs',
          params: [{ fromBlock: '0x10', toBlock: '0x10' }],
        }),
      }
      expect(RetryRequest.isErrorRelatedToServerIssue(error)).to.be.true
    })

    it('should return false if method is "eth_getLogs" with different fromBlock and toBlock', () => {
      const error = {
        requestBody: JSON.stringify({
          method: 'eth_getLogs',
          params: [{ fromBlock: '0x10', toBlock: '0x20' }],
        }),
      }
      expect(RetryRequest.isErrorRelatedToServerIssue(error)).to.be.false
    })

    it('should return false if requestBody is malformed JSON', () => {
      const error = {
        code: 'SERVER_ERROR',
        requestBody: '{invalid_json}',
      }
      const warnStub = sandbox.stub(Logger, 'warn')

      expect(RetryRequest.isErrorRelatedToServerIssue(error)).to.be.false
      expect(warnStub.calledOnce).to.be.true
      expect(warnStub.calledWithMatch('Error parsing request body for isErrorRelatedToServerIssue' as any)).to.be.true
    })

    it('should return false if requestBody is undefined', () => {
      const error = {}
      expect(RetryRequest.isErrorRelatedToServerIssue(error)).to.be.false
    })

    it('should return false if parsed requestBody is missing method', () => {
      const error = {
        requestBody: JSON.stringify({}),
      }
      expect(RetryRequest.isErrorRelatedToServerIssue(error)).to.be.false
    })

    it('should return false if error is undefined', () => {
      expect(RetryRequest.isErrorRelatedToServerIssue(undefined)).to.be.false
    })
  })
})
