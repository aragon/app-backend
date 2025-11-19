import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'
import { expect } from 'chai'
import AragonTransfersService from '@services/aragon-transfers/index'
import { TransferIndexer } from '@services/aragon-transfers/transferIndexer'
import logger from '@logger'
import config from '@config'
import { EnumConnection } from '@types'

describe('AragonTransfers: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Service configuration', () => {
    it('should have correct required connections', () => {
      expect(AragonTransfersService.NEED_CONNECTIONS).to.deep.equal([
        EnumConnection.MONGODB,
        EnumConnection.BLOCKCHAIN,
        EnumConnection.RABBITMQ,
      ])
    })

    it('should have correct mongo sync options', () => {
      expect(AragonTransfersService.options).to.deep.equal({
        mongoSync: config.MONGO_DB.SYNC_MODELS,
      })
    })
  })

  describe('start', () => {
    it('should call TransferIndexer.start and log success', async () => {
      const transferIndexerStub = sandbox.stub(TransferIndexer, 'start').resolves()
      const loggerStub = sandbox.stub(logger, 'info')

      await AragonTransfersService.start()

      expect(transferIndexerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('AragonTransfers service started' as any)).to.be.true
    })

    it('should handle errors from TransferIndexer.start', async () => {
      const error = new Error('Transfer indexer failed')
      sandbox.stub(TransferIndexer, 'start').rejects(error)
      sandbox.stub(logger, 'info')

      try {
        await AragonTransfersService.start()
        expect.fail('Should have thrown error')
      } catch (err) {
        expect(err).to.equal(error)
      }
    })
  })

  describe('stop', () => {
    it('should log that the service stopped', async () => {
      const loggerStub = sandbox.stub(logger, 'info')

      await AragonTransfersService.stop()

      expect(loggerStub.calledOnceWith('AragonTransfers service stopped' as any)).to.be.true
    })
  })
})
