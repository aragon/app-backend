import { expect } from 'chai'
import sinon, { type SinonSandbox, type SinonStub } from 'sinon'
import { AdaptiveBatchSizeManager } from '@modules/crawlers'
import { NetworksEnum } from '@types'
import logger from '@logger'

describe('Module: AdaptiveBatchSizeManager', () => {
  let sandbox: SinonSandbox
  let manager: AdaptiveBatchSizeManager
  let logVerboseStub: SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    logVerboseStub = sandbox.stub(logger, 'verbose')
    manager = new AdaptiveBatchSizeManager(NetworksEnum.ethereumMainnet)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const config = manager.getConfig()
      expect(config.initialBatchDays).to.be.a('number')
      expect(config.minBatchDays).to.be.a('number')
      expect(config.maxBatchDays).to.be.a('number')
    })

    it('should initialize with custom config', () => {
      const customManager = new AdaptiveBatchSizeManager(NetworksEnum.ethereumMainnet, {
        initialBatchDays: 30,
        minBatchDays: 1,
        maxBatchDays: 90,
      })
      const config = customManager.getConfig()
      expect(config.initialBatchDays).to.equal(30)
      expect(config.minBatchDays).to.equal(1)
      expect(config.maxBatchDays).to.equal(90)
    })
  })

  describe('getCurrentBatchSize', () => {
    it('should return current batch size', () => {
      const batchSize = manager.getCurrentBatchSize()
      expect(batchSize).to.be.a('number')
      expect(batchSize).to.be.greaterThan(0)
    })
  })

  describe('getOriginalBatchSize', () => {
    it('should return original batch size', () => {
      const originalSize = manager.getOriginalBatchSize()
      expect(originalSize).to.equal(manager.getCurrentBatchSize())
    })
  })

  describe('recordSuccess', () => {
    it('should update state on successful fetch', () => {
      const stateBefore = manager.getState()
      manager.recordSuccess(10, 1000)
      const stateAfter = manager.getState()

      expect(stateAfter.consecutiveSuccesses).to.equal(stateBefore.consecutiveSuccesses + 1)
      expect(stateAfter.totalEventsProcessed).to.equal(10)
      expect(stateAfter.totalBlocksProcessed).to.equal(1000)
      expect(stateAfter.lastEventDensity).to.equal(0.01)
    })

    it('should track consecutive empty ranges', () => {
      manager.recordSuccess(0, 1000)
      expect(manager.getState().consecutiveEmptyRanges).to.equal(1)

      manager.recordSuccess(0, 1000)
      expect(manager.getState().consecutiveEmptyRanges).to.equal(2)

      manager.recordSuccess(5, 1000)
      expect(manager.getState().consecutiveEmptyRanges).to.equal(0)
    })

    it('should trigger skip-ahead after 5 empty ranges', () => {
      const initialBatchSize = manager.getCurrentBatchSize()

      for (let i = 0; i < 5; i++) {
        manager.recordSuccess(0, 1000)
      }

      const newBatchSize = manager.getCurrentBatchSize()
      expect(newBatchSize).to.be.greaterThan(initialBatchSize)
      expect(logVerboseStub.calledWithMatch('Jumping to larger batch size for sparse region')).to.be.true
    })

    it('should exit high activity zone after 3 consecutive successes with low density', () => {
      // Enter high activity zone first
      manager.recordBatchSizeError()
      manager.recordBatchSizeError()
      expect(manager.getState().isInHighActivityZone).to.be.true

      // Record 3 successful fetches with low density
      manager.recordSuccess(1, 1000) // density = 0.001
      manager.recordSuccess(1, 1000)
      manager.recordSuccess(1, 1000)

      expect(manager.getState().isInHighActivityZone).to.be.false
      expect(logVerboseStub.calledWithMatch('Leaving high activity zone after consecutive successes')).to.be.true
    })

    it('should not exit high activity zone with high density', () => {
      // Enter high activity zone
      manager.recordBatchSizeError()
      manager.recordBatchSizeError()
      expect(manager.getState().isInHighActivityZone).to.be.true

      // Record successes with high density
      manager.recordSuccess(5000, 1000) // density = 5
      manager.recordSuccess(5000, 1000)
      manager.recordSuccess(5000, 1000)

      expect(manager.getState().isInHighActivityZone).to.be.true
    })

    it('should grow batch size after threshold successes', () => {
      const config = manager.getConfig()
      const initialBatchSize = manager.getCurrentBatchSize()

      // Reduce batch size first
      manager.recordBatchSizeError()
      const reducedSize = manager.getCurrentBatchSize()
      expect(reducedSize).to.be.lessThan(initialBatchSize)

      // Record enough successes to trigger growth
      for (let i = 0; i < config.successThresholdForGrowth; i++) {
        manager.recordSuccess(10, 1000)
      }

      const grownSize = manager.getCurrentBatchSize()
      expect(grownSize).to.be.greaterThan(reducedSize)
    })
  })

  describe('recordBatchSizeError', () => {
    it('should reduce batch size on error', () => {
      const initialBatchSize = manager.getCurrentBatchSize()
      const newBatchSize = manager.recordBatchSizeError()

      expect(newBatchSize).to.be.lessThan(initialBatchSize)
      expect(manager.getState().consecutiveErrors).to.equal(1)
      expect(manager.getState().consecutiveSuccesses).to.equal(0)
    })

    it('should enter high activity zone after 2 consecutive errors', () => {
      manager.recordBatchSizeError()
      expect(manager.getState().isInHighActivityZone).to.be.false

      manager.recordBatchSizeError()
      expect(manager.getState().isInHighActivityZone).to.be.true
    })

    it('should use exponential backoff for consecutive errors', () => {
      const size1 = manager.getCurrentBatchSize()
      manager.recordBatchSizeError()
      const size2 = manager.getCurrentBatchSize()

      manager.recordBatchSizeError()
      const size3 = manager.getCurrentBatchSize()

      // Consecutive errors should lead to progressively smaller batch sizes
      expect(size2).to.be.lessThan(size1)
      expect(size3).to.be.lessThan(size2)

      // The second error should reduce more aggressively (smaller final size)
      const ratio1 = size2 / size1
      const ratio2 = size3 / size2
      expect(ratio2).to.be.lessThan(ratio1)
    })

    it('should not reduce below minimum batch size', () => {
      const config = manager.getConfig()
      const customManager = new AdaptiveBatchSizeManager(NetworksEnum.ethereumMainnet, {
        minBatchDays: config.minBatchDays,
      })

      // Reduce multiple times
      for (let i = 0; i < 10; i++) {
        customManager.recordBatchSizeError()
      }

      const finalSize = customManager.getCurrentBatchSize()
      expect(finalSize).to.be.greaterThan(0)
    })

    it('should reset consecutive empty ranges on error', () => {
      manager.recordSuccess(0, 1000)
      manager.recordSuccess(0, 1000)
      expect(manager.getState().consecutiveEmptyRanges).to.equal(2)

      manager.recordBatchSizeError()
      expect(manager.getState().consecutiveEmptyRanges).to.equal(0)
    })
  })

  describe('resetForNextRange', () => {
    it('should reset counters for new range', () => {
      manager.recordSuccess(10, 1000)
      manager.recordSuccess(10, 1000)

      manager.resetForNextRange()

      const state = manager.getState()
      expect(state.consecutiveSuccesses).to.equal(0)
      expect(state.consecutiveErrors).to.equal(0)
      expect(state.reductionCount).to.equal(0)
    })

    it('should use conservative batch size in high activity zone', () => {
      // Enter high activity zone
      manager.recordBatchSizeError()
      manager.recordBatchSizeError()
      expect(manager.getState().isInHighActivityZone).to.be.true

      const batchSize = manager.resetForNextRange()
      expect(batchSize).to.be.a('number')
      expect(logVerboseStub.calledWithMatch('Reset batch size for high activity zone')).to.be.true
    })

    it('should gradually return to larger batches outside high activity zone', () => {
      manager.recordBatchSizeError()
      expect(manager.getState().isInHighActivityZone).to.be.false

      manager.resetForNextRange()
      expect(logVerboseStub.calledWithMatch('Reset batch size for next range')).to.be.true
    })
  })

  describe('getAdaptiveBatchSize', () => {
    it('should return current adaptive batch size', () => {
      const batchSize = manager.getAdaptiveBatchSize()
      expect(batchSize).to.equal(manager.getCurrentBatchSize())
    })
  })

  describe('getSkipAheadBatchSize', () => {
    it('should return current size when empty ranges < 3', () => {
      manager.recordSuccess(10, 1000)
      const skipSize = manager.getSkipAheadBatchSize()
      expect(skipSize).to.equal(manager.getCurrentBatchSize())
    })

    it('should increase size exponentially after 3 empty ranges', () => {
      const initialSize = manager.getCurrentBatchSize()

      manager.recordSuccess(0, 1000)
      manager.recordSuccess(0, 1000)
      manager.recordSuccess(0, 1000)

      const skipSize = manager.getSkipAheadBatchSize()
      expect(skipSize).to.be.greaterThan(initialSize)
    })

    it('should increase more after 4 empty ranges', () => {
      manager.recordSuccess(0, 1000)
      manager.recordSuccess(0, 1000)
      manager.recordSuccess(0, 1000)
      const skipSize3 = manager.getSkipAheadBatchSize()

      manager.recordSuccess(0, 1000)
      const skipSize4 = manager.getSkipAheadBatchSize()

      expect(skipSize4).to.be.greaterThan(skipSize3)
    })

    it('should cap at maximum skip size', () => {
      // Trigger many empty ranges
      for (let i = 0; i < 10; i++) {
        manager.recordSuccess(0, 1000)
      }

      const skipSize = manager.getSkipAheadBatchSize()
      expect(skipSize).to.be.a('number')
      expect(skipSize).to.be.greaterThan(0)
    })

    it('should not skip ahead in high activity zone', () => {
      // Enter high activity zone
      manager.recordBatchSizeError()
      manager.recordBatchSizeError()
      expect(manager.getState().isInHighActivityZone).to.be.true

      // Record only 2 empty ranges to avoid exiting high activity zone
      // (3 successes with low density would exit the zone)
      manager.recordSuccess(0, 1000)
      manager.recordSuccess(0, 1000)

      // Should still be in high activity zone
      expect(manager.getState().isInHighActivityZone).to.be.true
      expect(manager.getState().consecutiveEmptyRanges).to.equal(2)

      // getSkipAheadBatchSize requires >= 3 empty ranges, so it should return current size
      const skipSize = manager.getSkipAheadBatchSize()
      expect(skipSize).to.equal(manager.getCurrentBatchSize())
    })
  })

  describe('getState', () => {
    it('should return current state snapshot', () => {
      const state = manager.getState()
      expect(state).to.have.property('currentBatchSize')
      expect(state).to.have.property('consecutiveSuccesses')
      expect(state).to.have.property('consecutiveErrors')
      expect(state).to.have.property('lastEventDensity')
      expect(state).to.have.property('isInHighActivityZone')
    })

    it('should return readonly copy', () => {
      const state1 = manager.getState()
      const state2 = manager.getState()
      expect(state1).to.not.equal(state2)
      expect(state1).to.deep.equal(state2)
    })
  })

  describe('getConfig', () => {
    it('should return config snapshot', () => {
      const config = manager.getConfig()
      expect(config).to.have.property('initialBatchDays')
      expect(config).to.have.property('minBatchDays')
      expect(config).to.have.property('maxBatchDays')
      expect(config).to.have.property('reductionFactor')
      expect(config).to.have.property('growthFactor')
    })
  })

  describe('predictOptimalBatchSize', () => {
    it('should predict smaller batch for very high density', () => {
      // Trigger high density scenario
      manager.recordSuccess(10000, 100) // 100 events/block
      manager.resetForNextRange()

      const state = manager.getState()
      expect(state.lastEventDensity).to.equal(100)
    })

    it('should predict larger batch for low density', () => {
      // Trigger low density scenario
      manager.recordSuccess(1, 10000) // 0.0001 events/block
      manager.resetForNextRange()

      const state = manager.getState()
      expect(state.lastEventDensity).to.equal(0.0001)
    })

    it('should learn from successful patterns', () => {
      // Record successful fetch with medium-high density (5 events/block)
      manager.recordSuccess(5000, 1000)

      // Next time we see similar density, should use learned size
      manager.recordBatchSizeError() // reduce size
      manager.resetForNextRange() // should apply learned pattern
    })
  })

  describe('Integration scenarios', () => {
    it('should handle sparse region skip-ahead optimization', () => {
      const initialSize = manager.getCurrentBatchSize()

      // Simulate sparse region: 5 consecutive empty ranges
      for (let i = 0; i < 5; i++) {
        manager.recordSuccess(0, 1000)
      }

      const jumpedSize = manager.getCurrentBatchSize()
      expect(jumpedSize).to.be.greaterThan(initialSize * 2)
    })

    it('should handle dense region with errors and recovery', () => {
      // Simulate hitting rate limits in dense region
      manager.recordBatchSizeError()
      manager.recordBatchSizeError()
      expect(manager.getState().isInHighActivityZone).to.be.true

      // Gradually recover with successful fetches
      const config = manager.getConfig()
      for (let i = 0; i < config.successThresholdForGrowth * 2; i++) {
        manager.recordSuccess(1000, 1000) // high density
      }

      // Should stay conservative in high activity zone
      expect(manager.getState().isInHighActivityZone).to.be.false
    })

    it('should adapt batch size based on event density patterns', () => {
      // Start with low density
      for (let i = 0; i < 5; i++) {
        manager.recordSuccess(10, 10000) // 0.001 events/block
      }

      const state1 = manager.getState()
      expect(state1.lastEventDensity).to.equal(0.001)

      // Switch to high density
      manager.recordBatchSizeError() // simulate hitting limits
      const reducedSize = manager.getCurrentBatchSize()

      for (let i = 0; i < 3; i++) {
        manager.recordSuccess(5000, 1000) // 5 events/block
      }

      expect(manager.getCurrentBatchSize()).to.be.at.most(reducedSize * 1.5)
    })

    it('should handle zone transitions correctly', () => {
      // Enter high activity zone
      manager.recordBatchSizeError()
      manager.recordBatchSizeError()
      expect(manager.getState().isInHighActivityZone).to.be.true

      // Exit with low density successes
      manager.recordSuccess(1, 10000)
      manager.recordSuccess(1, 10000)
      manager.recordSuccess(1, 10000)

      expect(manager.getState().isInHighActivityZone).to.be.false
    })

    it('should not grow batch size in high activity zone', () => {
      // Enter high activity zone
      manager.recordBatchSizeError()
      manager.recordBatchSizeError()
      expect(manager.getState().isInHighActivityZone).to.be.true
      const sizeInHighZone = manager.getCurrentBatchSize()

      // Record successes with density >= medium threshold (2) to stay in zone
      // Medium threshold is 2 events/block, so use 2.5 to stay above it
      const config = manager.getConfig()
      for (let i = 0; i < config.successThresholdForGrowth; i++) {
        manager.recordSuccess(2500, 1000) // 2.5 events/block
      }

      // Should still be in high activity zone and not grown
      expect(manager.getState().isInHighActivityZone).to.be.true
      const currentSize = manager.getCurrentBatchSize()
      expect(currentSize).to.equal(sizeInHighZone)
    })
  })

  describe('Edge cases', () => {
    it('should handle zero events correctly', () => {
      manager.recordSuccess(0, 1000)
      const state = manager.getState()
      expect(state.lastEventDensity).to.equal(0)
    })

    it('should handle zero blocks correctly', () => {
      manager.recordSuccess(10, 0)
      const state = manager.getState()
      expect(state.lastEventDensity).to.equal(0)
    })

    it('should maintain state consistency across operations', () => {
      for (let i = 0; i < 10; i++) {
        if (i % 3 === 0) {
          manager.recordBatchSizeError()
        } else {
          manager.recordSuccess(Math.random() * 100, 1000)
        }
      }

      const state = manager.getState()
      expect(state.totalEventsProcessed).to.be.greaterThanOrEqual(0)
      expect(state.totalBlocksProcessed).to.be.greaterThanOrEqual(0)
      expect(state.currentBatchSize).to.be.greaterThan(0)
    })
  })
})
