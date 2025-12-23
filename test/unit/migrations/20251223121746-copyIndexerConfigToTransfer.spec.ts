import { Models } from '@dbModels'
import logger from '@logger'
import copyIndexerConfigToTransferMigration from '@src/migrations/20251223121746-copyIndexerConfigToTransfer'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'

describe('migration: copyIndexerConfigToTransfer', () => {
  let sandbox: SinonSandbox
  let loggerInfoStub: SinonStub
  let loggerErrorStub: SinonStub
  let findStub: SinonStub
  let findOneStub: SinonStub
  let createStub: SinonStub

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    loggerInfoStub = sandbox.stub(logger, 'info')
    loggerErrorStub = sandbox.stub(logger, 'error')
    findStub = sandbox.stub(Models.ConfigIndexer, 'find')
    findOneStub = sandbox.stub(Models.ConfigIndexer, 'findOne')
    createStub = sandbox.stub(Models.ConfigIndexer, 'create')
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should copy indexer configs to transfer configs', async () => {
      const mockIndexerConfigs = [
        {
          id: 'ethereum-mainnet-indexer-ethereum-mainnet',
          network: NetworksEnum.ethereumMainnet,
          service: 'indexer-ethereum-mainnet',
          lastSync: 12345678,
          end: false,
        },
        {
          id: 'polygon-mainnet-indexer-polygon-mainnet',
          network: NetworksEnum.polygonMainnet,
          service: 'indexer-polygon-mainnet',
          lastSync: 87654321,
          end: false,
        },
      ]

      findStub.resolves(mockIndexerConfigs)
      findOneStub.resolves(null) // No existing transfer configs
      createStub.resolves({})

      await copyIndexerConfigToTransferMigration.start()

      expect(findStub.calledOnce).to.be.true
      expect(findStub.firstCall.args[0]).to.deep.equal({
        service: { $regex: /^indexer-/ },
      })

      expect(createStub.callCount).to.equal(2)

      expect(createStub.getCall(0).args[0]).to.deep.equal({
        network: NetworksEnum.ethereumMainnet,
        service: 'transfer-ethereum-mainnet',
        lastSync: 12345678,
        end: false,
      })

      expect(createStub.getCall(1).args[0]).to.deep.equal({
        network: NetworksEnum.polygonMainnet,
        service: 'transfer-polygon-mainnet',
        lastSync: 87654321,
        end: false,
      })

      expect(loggerInfoStub.calledWith('Migration completed successfully')).to.be.true
    })

    it('should skip if transfer config already exists', async () => {
      const mockIndexerConfigs = [
        {
          id: 'ethereum-mainnet-indexer-ethereum-mainnet',
          network: NetworksEnum.ethereumMainnet,
          service: 'indexer-ethereum-mainnet',
          lastSync: 12345678,
          end: false,
        },
      ]

      findStub.resolves(mockIndexerConfigs)
      findOneStub.resolves({ id: 'ethereum-mainnet-transfer-ethereum-mainnet' }) // Already exists
      createStub.resolves({})

      await copyIndexerConfigToTransferMigration.start()

      expect(createStub.called).to.be.false
      expect(loggerInfoStub.calledWith('Transfer config already exists, skipping')).to.be.true
    })

    it('should handle when no indexer configs are found', async () => {
      findStub.resolves([])

      await copyIndexerConfigToTransferMigration.start()

      expect(findStub.calledOnce).to.be.true
      expect(createStub.called).to.be.false
      expect(loggerInfoStub.calledWith('Migration completed successfully')).to.be.true
    })

    it('should handle database errors gracefully', async () => {
      const error = new Error('Database connection failed')
      findStub.rejects(error)

      await expect(copyIndexerConfigToTransferMigration.start()).to.be.rejectedWith('Database connection failed')
      expect(loggerErrorStub.calledWith('Migration failed')).to.be.true
    })
  })

  describe('stop', () => {
    it('should do nothing', async () => {
      await copyIndexerConfigToTransferMigration.stop()
      expect(true).to.be.true
    })
  })
})
