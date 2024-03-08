import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { retry } from '@helpers/fetchRetry'
import utils from '@helpers/utils'

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
    const action = sandbox
      .stub()
      .onFirstCall()
      .rejects(new Error('fail'))
      .onSecondCall()
      .resolves('success')
    sandbox.stub(utils, 'wait').resolves()

    const result = await retry(action, { retries: 2, delay: 1000 })

    expect(action.callCount).to.eq(2)
    expect(result).to.equal('success')
  })
})
