import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { retryRequest, canBeRetried, isErrorRelatedToServerIssue } from '@helpers/retryRequest'
import Utils from '@helpers/utils'
import Logger from '@logger'
import proxyquire from 'proxyquire'

describe('Helpers:RetryRequest', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('retryRequest', async () => {
    it('should successfully make a request on the first try', async () => {
      const mockResponse = { data: 'success' }
      const requestFunction = sandbox.stub().resolves(mockResponse)

      const response = await retryRequest(requestFunction)

      expect(response).to.eql(mockResponse)
      expect(requestFunction.calledOnce).to.be.true
    })

    it('should retry and succeed after a rate limit error', async () => {
      const mockResponse = { data: 'success' }
      const requestFunction = sandbox
        .stub()
        .onFirstCall()
        .rejects({ response: { status: 429 } })
        .onSecondCall()
        .resolves(mockResponse)

      const response = await retryRequest(requestFunction, { maxRetries: 2 })

      expect(response).to.eql(mockResponse)
      expect(requestFunction.calledTwice).to.be.true
    })

    it('should retry when canBeRetried returns true', async () => {
      const mockResponse = { data: 'success' }
      const retryableError = { reason: 'future lookup' }

      const requestFunction = sandbox.stub().onFirstCall().rejects(retryableError).onSecondCall().resolves(mockResponse)

      const verboseStub = sandbox.stub(Logger, 'warn')
      const spyWait = sandbox.spy(Utils, 'wait')

      const response = await retryRequest(requestFunction, { maxRetries: 2 })

      expect(response).to.eql(mockResponse) // Ensure successful response
      expect(requestFunction.calledTwice).to.be.true // Ensure it retried once
      expect(verboseStub.calledOnce).to.be.true
      expect(verboseStub.calledWithMatch('ForceRetry, retrying...' as any)).to.be.true
      expect(spyWait.calledOnce).to.be.true // Ensure wait was called once
    })

    it('should retry when the error is SERVER_ERROR or TIMEOUT and isErrorRelatedToServerIssue returns true', async () => {
      const mockResponse = { data: 'success' }

      const serverError = new Error('Simulated Server Error') as any
      serverError.code = 'SERVER_ERROR'
      serverError.requestBody = JSON.stringify({
        method: 'eth_getBlockByNumber',
        params: [{}],
      })

      const requestFunction = sandbox.stub().onFirstCall().rejects(serverError).onSecondCall().resolves(mockResponse)

      sandbox.stub(Utils, 'wait').resolves()
      const stubWarn = sandbox.stub(Logger, 'warn')

      const retryModule = proxyquire.noCallThru().load('@helpers/retryRequest', {})

      const response = await retryModule.retryRequest(requestFunction, { maxRetries: 2 })

      expect(response).to.eql(mockResponse)
      expect(requestFunction.calledTwice).to.be.true
      expect(stubWarn.calledOnce).to.be.true
      expect(stubWarn.calledWithMatch('Warn, retrying on alchemy server error...' as any)).to.be.true
      expect(Utils.wait.calledOnce).to.be.true
    })

    it('should throw an error after exceeding max retries', async () => {
      const spyWait = sandbox.spy(Utils, 'wait')
      const requestFunction = sandbox.stub().rejects({ response: { status: 429 } })

      try {
        await retryRequest(requestFunction, { maxRetries: 2 })
        expect.fail('should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Request failed after 2 retries')
        expect(requestFunction.calledTwice).to.be.true
      }

      expect(spyWait.calledTwice).to.be.true
    })

    it('should throw a non-retry error immediately', async () => {
      const requestFunction = sandbox.stub().rejects(new Error('Non-retry error'))

      try {
        await retryRequest(requestFunction)
        expect.fail('should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Non-retry error')
        expect(requestFunction.calledOnce).to.be.true
      }
    })

    it('should throw a rate limit error when response message is NOTOK', async () => {
      const mockResponse = { data: { message: 'NOTOK' } }
      const requestFunction = sandbox.stub().resolves(mockResponse)
      const verboseStub = sandbox.stub(Logger, 'warn')
      try {
        await retryRequest(requestFunction, {
          maxRetries: 1,
        })
        expect.fail('should have thrown a rate limit error')
      } catch (error: any) {
        expect(error.message).to.equal('Request failed after 1 retries')
      }
      expect(verboseStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Rate limit exceeded, retrying...' as any)).to.be.true
      expect(requestFunction.calledOnce).to.be.true
    })
  })

  describe('canBeRetried', () => {
    it('should return true if the error reason includes "future lookup"', () => {
      const error = { reason: 'some future lookup issue' }
      expect(canBeRetried(error)).to.be.true
    })

    it('should return false if the error code is "CALL_EXCEPTION"', () => {
      const error = { code: 'CALL_EXCEPTION' }
      expect(canBeRetried(error)).to.be.false
    })

    it('should return true if the error value matches RETRY_REVERTS', () => {
      const error = { value: '0x08c379a0abcdef123456' } // Matches RETRY_REVERTS.ERROR_SIG
      expect(canBeRetried(error)).to.be.true
    })

    it('should return false if the error value does not match RETRY_REVERTS', () => {
      const error = { value: '0x1234567890abcdef' } // Random hex value
      expect(canBeRetried(error)).to.be.false
    })

    it('should return false if error is undefined', () => {
      expect(canBeRetried(undefined)).to.be.false
    })

    it('should return false if error has no relevant properties', () => {
      const error = { message: 'Some random error' }
      expect(canBeRetried(error)).to.be.false
    })
  })

  describe('isErrorRelatedToServerIssue', () => {
    it('should return true for whitelisted methods', () => {
      const error = {
        requestBody: JSON.stringify({ method: 'eth_blockNumber' }),
      }
      expect(isErrorRelatedToServerIssue(error)).to.be.true
    })

    it('should return false for non-whitelisted methods', () => {
      const error = {
        requestBody: JSON.stringify({ method: 'eth_getBalance' }),
      }
      expect(isErrorRelatedToServerIssue(error)).to.be.false
    })

    it('should return true if method is "eth_getLogs" with same fromBlock and toBlock', () => {
      const error = {
        requestBody: JSON.stringify({
          method: 'eth_getLogs',
          params: [{ fromBlock: '0x10', toBlock: '0x10' }],
        }),
      }
      expect(isErrorRelatedToServerIssue(error)).to.be.true
    })

    it('should return false if method is "eth_getLogs" with different fromBlock and toBlock', () => {
      const error = {
        requestBody: JSON.stringify({
          method: 'eth_getLogs',
          params: [{ fromBlock: '0x10', toBlock: '0x20' }],
        }),
      }
      expect(isErrorRelatedToServerIssue(error)).to.be.false
    })

    it('should return false if requestBody is malformed JSON', () => {
      const error = {
        requestBody: '{invalid_json}',
      }
      const loggerWarnStub = sandbox.stub(Logger, 'warn')
      expect(isErrorRelatedToServerIssue(error)).to.be.false
      expect(loggerWarnStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledWithMatch('Error parsing request body for isErrorRelatedToServerIssue' as any)).to.be
        .true
    })

    it('should return false if requestBody is missing method', () => {
      const error = {
        requestBody: JSON.stringify({}),
      }
      expect(isErrorRelatedToServerIssue(error)).to.be.false
    })

    it('should return false if error is undefined', () => {
      expect(isErrorRelatedToServerIssue(undefined)).to.be.false
    })
  })
})
