import TooBusyMonitor from '@helpers/monitoring'
import logger from '@logger'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import Toobusy from 'toobusy-js'

describe('Helpers: Monitoring', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should initialize with default maxLag and interval', () => {
    const tooBusyMonitor = new TooBusyMonitor()
    expect(tooBusyMonitor.maxLag).to.equal(600)
    expect(tooBusyMonitor.interval).to.equal(2000)
  })

  it('should accept and set custom maxLag and interval values', () => {
    const customMaxLag = 100
    const customInterval = 1000
    const tooBusyMonitor = new TooBusyMonitor(customMaxLag, customInterval)

    expect(tooBusyMonitor.maxLag).to.equal(customMaxLag)
    expect(tooBusyMonitor.interval).to.equal(customInterval)
  })

  it('should properly configure Toobusy-js with maxLag and interval', () => {
    const customMaxLag = 100
    const customInterval = 1000
    const tooBusyMonitor = new TooBusyMonitor(customMaxLag, customInterval)

    const maxLagSpy = sandbox.spy(Toobusy, 'maxLag')
    const intervalSpy = sandbox.spy(Toobusy, 'interval')

    tooBusyMonitor.init()

    expect(maxLagSpy.calledWith(customMaxLag)).to.be.true
    expect(intervalSpy.calledWith(customInterval)).to.be.true
  })

  it('should log warning with current lag when handleLag is called', () => {
    const tooBusyMonitor = new TooBusyMonitor()
    tooBusyMonitor.init()

    const currentLag = 1200
    const loggerWarnStub = sandbox.stub(logger, 'warn')

    tooBusyMonitor.handleLag(currentLag)

    expect(loggerWarnStub.calledOnce).to.be.true
    const args: any = loggerWarnStub.args[0]
    expect(args[0]).to.eq('tooBusy')
    expect(args[1].currentLag).to.eq(1200)
  })
})
