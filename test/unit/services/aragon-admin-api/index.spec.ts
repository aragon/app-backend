import config from '@config'
import logger from '@logger'
import AragonAdminAPIService from '@services/aragon-admin-api/index'
import { expect } from 'chai'
import Koa from 'koa'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonAdminAPI: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should initialize and start the Koa admin API server', async () => {
      const appOnStub = sandbox.stub(Koa.prototype, 'on')
      const useStub = sandbox.stub(Koa.prototype, 'use')
      const listenStub = sandbox.stub(Koa.prototype, 'listen').returns({
        setTimeout: sandbox.stub(),
      } as any)
      const loggerInfoStub = sandbox.stub(logger, 'info')

      const result = await AragonAdminAPIService.start()

      expect(appOnStub.calledWith('error')).to.be.true
      expect(useStub.calledOnce).to.be.true
      expect(listenStub.calledOnceWith(config.SERVICES.ARAGON_ADMIN_API.PORT)).to.be.true
      expect(loggerInfoStub.calledWith('Listening' as any)).to.be.true
      expect(result).to.be.instanceOf(Koa)
    })
  })

  describe('stop', () => {
    it('should call the Utils.noop function', async () => {
      AragonAdminAPIService.stop()
    })
  })
})
