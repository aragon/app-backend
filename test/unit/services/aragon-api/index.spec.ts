import config from '@config'
import logger from '@logger'
import AragonAPIService from '@services/aragon-api/index'
import { EnumConnection } from '@types'
import { expect } from 'chai'
import Koa from 'koa'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonAPI: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('NEED_CONNECTIONS', () => {
    it('does not open a blockchain connection - on-chain work is delegated to the gateway', () => {
      // The API has no RPC providers, so anything needing contract state goes over RabbitMQ to a
      // service that does. Adding BLOCKCHAIN here would be the wrong fix for a missing provider.
      expect(AragonAPIService.NEED_CONNECTIONS).to.not.include(EnumConnection.BLOCKCHAIN)
      expect(AragonAPIService.NEED_CONNECTIONS).to.include(EnumConnection.RABBITMQ)
    })
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
