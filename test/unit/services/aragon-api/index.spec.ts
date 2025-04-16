import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import AragonAPIService from '@services/aragon-api/index'
import Koa from 'koa'
import logger from '@logger'
import config from '@config'

describe('AragonAPI: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should initialize and start the Koa API server', async () => {
      const appOnStub = sandbox.stub(Koa.prototype, 'on')
      const useStub = sandbox.stub(Koa.prototype, 'use')
      const listenStub = sandbox.stub(Koa.prototype, 'listen').returns({
        setTimeout: sandbox.stub(),
      } as any)
      const loggerInfoStub = sandbox.stub(logger, 'info')

      const result = await AragonAPIService.start()

      expect(appOnStub.calledWith('error')).to.be.true
      expect(useStub.calledOnce).to.be.true
      expect(listenStub.calledOnceWith(config.SERVICES.ARAGON_API.PORT)).to.be.true
      expect(loggerInfoStub.calledWith('Listening' as any)).to.be.true
      expect(result).to.be.instanceOf(Koa)
    })
  })

  describe('stop', () => {
    it('should call the Utils.noop function', async () => {
      AragonAPIService.stop()
    })
  })
})
