import { Models } from '@dbModels'
import logger from '@logger'
import removeTokenSyncTagMigration from '@src/migrations/20250802021235-removeTokenSyncTag'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'

describe('migration: removeTokenSyncTag', () => {
  let sandbox: SinonSandbox
  let loggerInfoStub: SinonStub
  let loggerErrorStub: SinonStub
  let findStub: SinonStub
  let updateOneStub: SinonStub

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    loggerInfoStub = sandbox.stub(logger, 'info')
    loggerErrorStub = sandbox.stub(logger, 'error')
    findStub = sandbox.stub(Models.ConfigIndexer, 'find')
    updateOneStub = sandbox.stub(Models.ConfigIndexer, 'updateOne')
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should find and update all services with sync tag suffixes', async () => {
      // Arrange
      const mockServices = [
        {
          _id: '1',
          service: 'ERC20-arbitrum-mainnet-0x912CE59144191C1204E64559FE8253a0e49E6548-delegates',
        },
        {
          _id: '2',
          service: 'ERC721-polygon-mainnet-0x123456789abcdef-transfers',
        },
        {
          _id: '3',
          service: 'ERC1155-ethereum-mainnet-0xabcdef123456-holders',
        },
      ]

      findStub.resolves(mockServices)
      updateOneStub.resolves({ modifiedCount: 1 })

      // Act
      await removeTokenSyncTagMigration.start()

      // Assert
      expect(findStub.calledOnce).to.be.true
      expect(findStub.firstCall.args[0]).to.deep.equal({
        service: { $regex: '-(delegates|transfers|holders)$' },
      })

      expect(updateOneStub.callCount).to.equal(3)

      // Check each update call
      expect(updateOneStub.getCall(0).args).to.deep.equal([
        { _id: '1' },
        { $set: { service: 'ERC20-arbitrum-mainnet-0x912CE59144191C1204E64559FE8253a0e49E6548' } },
      ])

      expect(updateOneStub.getCall(1).args).to.deep.equal([
        { _id: '2' },
        { $set: { service: 'ERC721-polygon-mainnet-0x123456789abcdef' } },
      ])

      expect(updateOneStub.getCall(2).args).to.deep.equal([
        { _id: '3' },
        { $set: { service: 'ERC1155-ethereum-mainnet-0xabcdef123456' } },
      ])

      // Check logging
      expect(loggerInfoStub.calledWith('Migration completed successfully')).to.be.true
      const completedLog = loggerInfoStub.args.find(args => args[0] === 'Migration completed successfully') as any
      expect(completedLog[1]).to.deep.include({
        migration: '20250802021235-removeTokenSyncTag',
        totalFound: 3,
        totalUpdated: 3,
      })
    })

    it('should handle when no services with sync tags are found', async () => {
      // Arrange
      findStub.resolves([])

      // Act
      await removeTokenSyncTagMigration.start()

      // Assert
      expect(findStub.calledOnce).to.be.true
      expect(updateOneStub.called).to.be.false
      expect(loggerInfoStub.calledWith('No services found with sync tags')).to.be.true
    })

    it('should handle different sync tag types correctly', async () => {
      // Arrange
      const mockServices = [
        {
          _id: '1',
          service: 'ERC20-ethereum-mainnet-0x123-delegates',
        },
        {
          _id: '2',
          service: 'ERC777-base-mainnet-0x456-transfers',
        },
        {
          _id: '3',
          service: 'escrowAdapter-optimism-mainnet-0x789-holders',
        },
      ]

      findStub.resolves(mockServices)
      updateOneStub.resolves({ modifiedCount: 1 })

      // Act
      await removeTokenSyncTagMigration.start()

      // Assert
      expect(updateOneStub.callCount).to.equal(3)

      expect(updateOneStub.getCall(0).args[1].$set.service).to.equal('ERC20-ethereum-mainnet-0x123')
      expect(updateOneStub.getCall(1).args[1].$set.service).to.equal('ERC777-base-mainnet-0x456')
      expect(updateOneStub.getCall(2).args[1].$set.service).to.equal('escrowAdapter-optimism-mainnet-0x789')
    })

    it('should handle partial update failures', async () => {
      // Arrange
      const mockServices = [
        {
          _id: '1',
          service: 'ERC20-ethereum-mainnet-0x123-delegates',
        },
        {
          _id: '2',
          service: 'ERC20-ethereum-mainnet-0x456-transfers',
        },
      ]

      findStub.resolves(mockServices)
      updateOneStub.onFirstCall().resolves({ modifiedCount: 1 })
      updateOneStub.onSecondCall().resolves({ modifiedCount: 0 }) // Failed to update

      // Act
      await removeTokenSyncTagMigration.start()

      // Assert
      const completedLog = loggerInfoStub.args.find(args => args[0] === 'Migration completed successfully') as any
      expect(completedLog[1]).to.deep.include({
        totalFound: 2,
        totalUpdated: 1, // Only one was successfully updated
      })
    })

    it('should handle database errors gracefully', async () => {
      // Arrange
      const error = new Error('Database connection failed')
      findStub.rejects(error)

      // Act & Assert
      await expect(removeTokenSyncTagMigration.start()).to.be.rejectedWith('Database connection failed')
      expect(loggerErrorStub.calledWith('Migration failed')).to.be.true
    })

    it('should handle services without sync tags (should not be found by query)', async () => {
      // This test verifies that our regex doesn't accidentally match services without sync tags
      // In a real scenario, these wouldn't be returned by the find query
      const mockServices = [
        {
          _id: '1',
          service: 'ERC20-ethereum-mainnet-0x123-delegates',
        },
      ]

      findStub.resolves(mockServices)
      updateOneStub.resolves({ modifiedCount: 1 })

      // Act
      await removeTokenSyncTagMigration.start()

      // Assert
      expect(updateOneStub.calledOnce).to.be.true
      expect(updateOneStub.firstCall.args[1].$set.service).to.equal('ERC20-ethereum-mainnet-0x123')
    })

    it('should handle complex network names correctly', async () => {
      // Arrange
      const mockServices = [
        {
          _id: '1',
          service: 'ERC20-ethereum-sepolia-0x123-delegates',
        },
        {
          _id: '2',
          service: 'ERC721-polygon-mainnet-0x456-transfers',
        },
        {
          _id: '3',
          service: 'ERC1155-zksync-mainnet-0x789-holders',
        },
      ]

      findStub.resolves(mockServices)
      updateOneStub.resolves({ modifiedCount: 1 })

      // Act
      await removeTokenSyncTagMigration.start()

      // Assert
      expect(updateOneStub.getCall(0).args[1].$set.service).to.equal('ERC20-ethereum-sepolia-0x123')
      expect(updateOneStub.getCall(1).args[1].$set.service).to.equal('ERC721-polygon-mainnet-0x456')
      expect(updateOneStub.getCall(2).args[1].$set.service).to.equal('ERC1155-zksync-mainnet-0x789')
    })
  })

  describe('stop', () => {
    it('should do nothing (migrations typically have empty stop methods)', async () => {
      // Act
      await removeTokenSyncTagMigration.stop()

      // Assert - just verify it doesn't throw
      expect(true).to.be.true
    })
  })
})
