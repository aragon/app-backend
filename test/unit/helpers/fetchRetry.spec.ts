import { retry } from '@helpers/fetchRetry'
import utils from '@helpers/utils'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helpers: FetchRetry', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should succeed on the first attempt', async () => {
    const action = sandbox.stub().resolves('success')

    const result = await retry(action)

    expect(action.calledOnce).to.be.true
    expect(result).to.equal('success')
  })

  it('should succeed on a subsequent attempt', async () => {
    const action = sandbox.stub().onFirstCall().rejects(new Error('fail')).onSecondCall().resolves('success')
    sandbox.stub(utils, 'wait').resolves()

    const result = await retry(action, { retries: 2, delay: 1000 })

    expect(action.callCount).to.eq(2)
    expect(result).to.equal('success')
  })

  it('should throw an error after all attempts fail', async () => {
    const action = sandbox.stub().rejects(new Error('fail'))
    sandbox.stub(utils, 'wait').resolves()

    try {
      await retry(action, { retries: 2, delay: 100 })
      expect.fail('Expected function to throw an error')
    } catch (error: any) {
      expect(action.callCount).to.eq(3)
      expect(error).to.be.instanceOf(Error)
      expect(error.message).to.equal('fail')
    }
  })

  it('should timeout if the action does not complete in time', async () => {
    const longAction = sandbox
      .stub()
      .callsFake(() => new Promise(resolve => setTimeout(() => resolve('slow success'), 15000))) // 15s delay
    sandbox.stub(utils, 'wait').resolves()

    try {
      await retry(longAction, { timeout: 100 }) // 100ms timeout
      expect.fail('Expected function to throw a timeout error')
    } catch (error: any) {
      expect(error).to.be.instanceOf(Error)
      expect(error.message).to.equal('Request timeout exceeded')
    }
  })

  it('should handle retries mixed with a timeout', async () => {
    const action = sandbox
      .stub()
      .onFirstCall()
      .rejects(new Error('fail'))
      .onSecondCall()
      .callsFake(() => new Promise(resolve => setTimeout(() => resolve('slow success'), 15000))) // 15s delay on second call
    sandbox.stub(utils, 'wait').resolves()

    try {
      await retry(action, { retries: 2, delay: 100, timeout: 100 }) // 100ms timeout
      expect.fail('Expected function to throw a timeout error')
    } catch (error: any) {
      expect(action.callCount).to.eq(3)
      expect(error).to.be.instanceOf(Error)
    }
  })

  it('should use custom retry options correctly', async () => {
    const action = sandbox
      .stub()
      .onFirstCall()
      .rejects(new Error('fail'))
      .onSecondCall()
      .rejects(new Error('fail again'))
      .onThirdCall()
      .resolves('success')
    sandbox.stub(utils, 'wait').resolves()

    const result = await retry(action, { retries: 3, delay: 2000 })

    expect(action.callCount).to.eq(3)
    expect(result).to.equal('success')
    expect(utils.wait.getCall(0).calledWith(2000)).to.be.true
    expect(utils.wait.getCall(1).calledWith(2000)).to.be.true
  })
})
