import { expect } from 'chai'
import sinon, { type SinonSandbox, type SinonStub } from 'sinon'
import { ProgressTracker } from '@modules/crawlers'
import { NetworksEnum, LogServicePattern } from '@types'
import { Models } from '@dbModels'
import logger from '@logger'

describe('Module: ProgressTracker', () => {
  let sandbox: SinonSandbox
  let progressTracker: ProgressTracker
  let logVerboseStub: SinonStub
  let logErrorStub: SinonStub
  let logWarnStub: SinonStub

  const testConfig = {
    network: NetworksEnum.ethereumMainnet,
    service: 'test-service' as LogServicePattern,
    initialBlock: 1000,
  }

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    logVerboseStub = sandbox.stub(logger, 'verbose')
    logErrorStub = sandbox.stub(logger, 'error')
    logWarnStub = sandbox.stub(logger, 'warn')

    // Clean up any existing test data
    await Models.ConfigIndexer.deleteMany({
      network: testConfig.network,
      service: { $in: [testConfig.service, 'service1', 'service2'] },
    })

    progressTracker = new ProgressTracker(testConfig)
  })

  afterEach(async () => {
    // Clean up test data
    await Models.ConfigIndexer.deleteMany({
      network: testConfig.network,
      service: { $in: [testConfig.service, 'service1', 'service2'] },
    })
    sandbox.restore()
  })

  describe('constructor', () => {
    it('should initialize with provided config', () => {
      const config = progressTracker.getConfig()
      expect(config.network).to.equal(testConfig.network)
      expect(config.service).to.equal(testConfig.service)
    })

    it('should use default initial block of 0 if not provided', () => {
      const tracker = new ProgressTracker({
        network: NetworksEnum.ethereumMainnet,
        service: 'test-service' as LogServicePattern,
      })
      expect(tracker).to.exist
    })
  })

  describe('getStartingBlock', () => {
    it('should return initial block when no existing config', async () => {
      const startingBlock = await progressTracker.getStartingBlock()
      expect(startingBlock).to.equal(testConfig.initialBlock)
      expect(logVerboseStub.calledWithMatch('No existing progress found')).to.be.true
    })

    it('should return lastSync from existing config', async () => {
      // Create existing config
      await Models.ConfigIndexer.create({
        network: testConfig.network,
        service: testConfig.service,
        lastSync: 5000,
      })

      const startingBlock = await progressTracker.getStartingBlock()
      expect(startingBlock).to.equal(5000)
      expect(logVerboseStub.calledWithMatch('Found existing progress')).to.be.true
    })

    it('should handle database errors gracefully', async () => {
      // Stub the database call to throw an error
      const findExistingLogStub = sandbox.stub(Models.ConfigIndexer, 'findExistingLog')
      const testError = new Error('Database connection failed')
      findExistingLogStub.rejects(testError)

      try {
        await progressTracker.getStartingBlock()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(testError)
        expect(logErrorStub.calledWithMatch('Error getting starting block')).to.be.true
      }
    })
  })

  describe('saveProgress', () => {
    it('should create new config when none exists', async () => {
      await progressTracker.saveProgress(2000)

      // Verify database entry was created
      const config = await Models.ConfigIndexer.findExistingLog({
        network: testConfig.network,
        service: testConfig.service,
      })

      expect(config).to.exist
      expect(config!.lastSync).to.equal(2000)
      expect(config!.network).to.equal(testConfig.network)
      expect(config!.service).to.equal(testConfig.service)
      expect(config!.end).to.be.false
      expect(logVerboseStub.calledWithMatch('Created new progress entry')).to.be.true
    })

    it('should update existing config', async () => {
      // Create initial config
      await Models.ConfigIndexer.create({
        network: testConfig.network,
        service: testConfig.service,
        lastSync: 2000,
      })

      // Update progress
      await progressTracker.saveProgress(3000)

      // Verify database entry was updated
      const config = await Models.ConfigIndexer.findExistingLog({
        network: testConfig.network,
        service: testConfig.service,
      })

      expect(config).to.exist
      expect(config!.lastSync).to.equal(3000)
      expect(logVerboseStub.calledWithMatch('Updated progress')).to.be.true
    })

    it('should handle database errors gracefully', async () => {
      // Stub the create method to throw an error
      const createStub = sandbox.stub(Models.ConfigIndexer, 'create')
      const testError = new Error('Database write failed')
      createStub.rejects(testError)

      try {
        await progressTracker.saveProgress(2000)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(testError)
        expect(logErrorStub.calledWithMatch('Error saving progress')).to.be.true
      }
    })

    it('should handle concurrent updates correctly', async () => {
      // Create initial config
      await Models.ConfigIndexer.create({
        network: testConfig.network,
        service: testConfig.service,
        lastSync: 1000,
      })

      // Simulate concurrent updates
      const updates = [2000, 3000, 4000, 5000]
      await Promise.all(updates.map(block => progressTracker.saveProgress(block)))

      // Verify final state
      const config = await Models.ConfigIndexer.findExistingLog({
        network: testConfig.network,
        service: testConfig.service,
      })

      expect(config).to.exist
      // The last update should win
      expect(config!.lastSync).to.be.oneOf(updates)
    })
  })

  describe('markAsEnded', () => {
    it('should mark existing config as ended', async () => {
      // Create config
      await Models.ConfigIndexer.create({
        network: testConfig.network,
        service: testConfig.service,
        lastSync: 2000,
        end: false,
      })

      await progressTracker.markAsEnded()

      // Verify database entry was updated
      const config = await Models.ConfigIndexer.findExistingLog({
        network: testConfig.network,
        service: testConfig.service,
      })

      expect(config).to.exist
      expect(config!.end).to.be.true
      expect(config!.lastSync).to.equal(2000) // Should not change
      expect(logVerboseStub.calledWithMatch('Marked service as ended')).to.be.true
    })

    it('should log warning when config does not exist', async () => {
      await progressTracker.markAsEnded()
      expect(logWarnStub.calledWithMatch('Cannot mark as ended - config does not exist')).to.be.true
    })

    it('should handle database errors gracefully', async () => {
      // Create config first
      await Models.ConfigIndexer.create({
        network: testConfig.network,
        service: testConfig.service,
        lastSync: 2000,
      })

      // Stub the update method to throw an error
      const findExistingLogStub = sandbox.stub(Models.ConfigIndexer, 'findExistingLog')
      const testError = new Error('Database update failed')
      findExistingLogStub.rejects(testError)

      try {
        await progressTracker.markAsEnded()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(testError)
        expect(logErrorStub.calledWithMatch('Error marking as ended')).to.be.true
      }
    })
  })

  describe('getProgressInfo', () => {
    it('should return progress info for existing config', async () => {
      // Create config
      await Models.ConfigIndexer.create({
        network: testConfig.network,
        service: testConfig.service,
        lastSync: 3000,
        end: true,
      })

      const info = await progressTracker.getProgressInfo()

      expect(info.lastSync).to.equal(3000)
      expect(info.isEnded).to.be.true
      expect(info.exists).to.be.true
    })

    it('should return default info when config does not exist', async () => {
      const info = await progressTracker.getProgressInfo()

      expect(info.lastSync).to.equal(testConfig.initialBlock)
      expect(info.isEnded).to.be.false
      expect(info.exists).to.be.false
    })

    it('should handle database errors gracefully', async () => {
      const findExistingLogStub = sandbox.stub(Models.ConfigIndexer, 'findExistingLog')
      const testError = new Error('Database read failed')
      findExistingLogStub.rejects(testError)

      try {
        await progressTracker.getProgressInfo()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(testError)
        expect(logErrorStub.calledWithMatch('Error getting progress info')).to.be.true
      }
    })
  })

  describe('hasEnded', () => {
    it('should return true when service has ended', async () => {
      await Models.ConfigIndexer.create({
        network: testConfig.network,
        service: testConfig.service,
        lastSync: 2000,
        end: true,
      })

      const hasEnded = await progressTracker.hasEnded()
      expect(hasEnded).to.be.true
    })

    it('should return false when service has not ended', async () => {
      await Models.ConfigIndexer.create({
        network: testConfig.network,
        service: testConfig.service,
        lastSync: 2000,
        end: false,
      })

      const hasEnded = await progressTracker.hasEnded()
      expect(hasEnded).to.be.false
    })

    it('should return false when config does not exist', async () => {
      const hasEnded = await progressTracker.hasEnded()
      expect(hasEnded).to.be.false
    })
  })

  describe('resetProgress', () => {
    it('should reset existing config to initial state', async () => {
      // Create config with progress
      await Models.ConfigIndexer.create({
        network: testConfig.network,
        service: testConfig.service,
        lastSync: 5000,
        end: true,
      })

      await progressTracker.resetProgress()

      // Verify database entry was reset
      const config = await Models.ConfigIndexer.findExistingLog({
        network: testConfig.network,
        service: testConfig.service,
      })

      expect(config).to.exist
      expect(config!.lastSync).to.equal(testConfig.initialBlock)
      expect(config!.end).to.be.false
      expect(logVerboseStub.calledWithMatch('Reset progress')).to.be.true
    })

    it('should do nothing when config does not exist', async () => {
      await progressTracker.resetProgress()

      // Verify no config was created
      const config = await Models.ConfigIndexer.findExistingLog({
        network: testConfig.network,
        service: testConfig.service,
      })

      expect(config).to.not.exist
    })

    it('should handle database errors gracefully', async () => {
      const updateStub = sandbox.stub(Models.ConfigIndexer, 'findOneAndUpdate')
      const testError = new Error('Database operation failed')
      updateStub.rejects(testError)

      try {
        await progressTracker.resetProgress()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(testError)
        expect(logErrorStub.calledWithMatch('Error resetting progress')).to.be.true
      }
    })
  })

  describe('getConfig', () => {
    it('should return network and service configuration', () => {
      const config = progressTracker.getConfig()
      expect(config.network).to.equal(testConfig.network)
      expect(config.service).to.equal(testConfig.service)
    })
  })

  describe('Integration scenarios', () => {
    it('should handle complete lifecycle: create, update, end', async () => {
      // Step 1: Get initial starting block
      let startBlock = await progressTracker.getStartingBlock()
      expect(startBlock).to.equal(testConfig.initialBlock)

      // Step 2: Save progress multiple times
      await progressTracker.saveProgress(2000)
      await progressTracker.saveProgress(3000)
      await progressTracker.saveProgress(4000)

      // Step 3: Verify progress
      const info1 = await progressTracker.getProgressInfo()
      expect(info1.lastSync).to.equal(4000)
      expect(info1.isEnded).to.be.false
      expect(info1.exists).to.be.true

      // Step 4: Get starting block again (should return lastSync)
      startBlock = await progressTracker.getStartingBlock()
      expect(startBlock).to.equal(4000)

      // Step 5: Mark as ended
      await progressTracker.markAsEnded()

      // Step 6: Verify ended state
      const hasEnded = await progressTracker.hasEnded()
      expect(hasEnded).to.be.true

      // Step 7: Reset progress
      await progressTracker.resetProgress()

      // Step 8: Verify reset
      const info2 = await progressTracker.getProgressInfo()
      expect(info2.lastSync).to.equal(testConfig.initialBlock)
      expect(info2.isEnded).to.be.false
      expect(info2.exists).to.be.true
    })

    it('should work correctly with multiple tracker instances', async () => {
      // Create two tracker instances for different services
      const tracker1 = new ProgressTracker({
        network: NetworksEnum.ethereumMainnet,
        service: 'service1' as LogServicePattern,
        initialBlock: 1000,
      })

      const tracker2 = new ProgressTracker({
        network: NetworksEnum.ethereumMainnet,
        service: 'service2' as LogServicePattern,
        initialBlock: 2000,
      })

      // Save progress for both
      await tracker1.saveProgress(1500)
      await tracker2.saveProgress(2500)

      // Verify they don't interfere with each other
      const info1 = await tracker1.getProgressInfo()
      const info2 = await tracker2.getProgressInfo()

      expect(info1.lastSync).to.equal(1500)
      expect(info2.lastSync).to.equal(2500)

      // Mark one as ended
      await tracker1.markAsEnded()

      // Verify states are independent
      expect(await tracker1.hasEnded()).to.be.true
      expect(await tracker2.hasEnded()).to.be.false

      // Clean up
      await Models.ConfigIndexer.deleteMany({
        service: { $in: ['service1', 'service2'] },
      })
    })
  })
})
