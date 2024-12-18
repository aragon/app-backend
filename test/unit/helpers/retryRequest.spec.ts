import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { retryRequest } from '@helpers/retryRequest'
import Utils from '@helpers/utils'
import Logger from '@logger'

describe('Helpers:RetryRequest', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

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
