import config from '@config'
import logger from '@logger'
import App from '@services/aragon-api/app'
import { expect } from 'chai'
import Koa from 'koa'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonApi: app', () => {
  let sandbox: SinonSandbox
  let listenStub: sinon.SinonStub
  let useStub: sinon.SinonStub
  let onStub: sinon.SinonStub
  let loggerInfoStub: sinon.SinonStub
  let loggerErrorStub: sinon.SinonStub
  let setTimeoutStub: sinon.SinonStub
  let appStub: sinon.SinonStub

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    listenStub = sandbox.stub().returns({
      setTimeout: sandbox.stub(),
    })
    useStub = sandbox.stub(Koa.prototype, 'use').returnsThis()
    onStub = sandbox.stub(Koa.prototype, 'on').returnsThis()
    appStub = sandbox.stub(Koa.prototype, 'listen').callsFake(listenStub as any)
    loggerInfoStub = sandbox.stub(logger, 'info')
    loggerErrorStub = sandbox.stub(logger, 'error')
    setTimeoutStub = sandbox.stub().returnsThis()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should initialize Koa app and start listening', async () => {
    const port = 3000
    const timeout = 30
    sandbox.stub(config.SERVICES.ARAGON_API, 'PORT').value(port)
    sandbox.stub(config.SERVICES.ARAGON_API, 'TIMEOUT').value(timeout)

    const app = await App()

    expect(app).to.be.an.instanceof(Koa)
    expect(useStub.calledOnce).to.be.true
    expect(onStub.calledOnce).to.be.true
    expect(appStub.calledOnceWith(port)).to.be.true
    expect(listenStub.returnValues[0].setTimeout.calledOnceWith(timeout * 1000)).to.be.true
    expect(loggerInfoStub.calledWith('Listening', sandbox.match({ port }))).to.be.true
  })

  it('should handle unexpected API errors', async () => {
    const error = new Error('Unexpected error')

    const app = await App()

    const errorHandler = onStub.args[0][1]
    errorHandler(error)

    expect(loggerErrorStub.calledOnceWith('Unexpected API error', sandbox.match({ error }))).to.be.true
  })
})
