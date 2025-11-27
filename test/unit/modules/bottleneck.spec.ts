import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import BottleneckModule from '@modules/bottleneck'
import { NetworksEnum } from '@types'

describe('Module: bottleneck', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    // Clear all limiters to ensure fresh state for each test
    BottleneckModule.nodeLimiters = {}
    BottleneckModule.transferLimiters = {}
    BottleneckModule.coinGeckoLimiters = {}
    BottleneckModule.fourBytesLimiters = {}
    BottleneckModule.alchemyENSLimiters = {}
    BottleneckModule.alchemyBalanceLimiters = {}
    BottleneckModule.alchemyBathRequestLimiters = {}
    BottleneckModule.etherScanLimiters = {}
    BottleneckModule.blockScoutLimiters = {}
    BottleneckModule.chilizLimiters = {}
    BottleneckModule.duneLimiters = {}
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getNodeLimiter', () => {
    it('returns the same instance for the same network', () => {
      const limiter1 = BottleneckModule.getNodeLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getNodeLimiter(NetworksEnum.ethereumMainnet)

      expect(limiter1).to.eq(limiter2)

      const limiter3 = BottleneckModule.nodeLimiters[NetworksEnum.ethereumMainnet]
      expect(limiter3).to.eq(limiter1)
    })

    it('returns different instances for different networks', () => {
      const limiter1 = BottleneckModule.getNodeLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getNodeLimiter(NetworksEnum.ethereumSepolia)

      expect(limiter1).not.eq(limiter2)
    })
  })

  describe('getNodeTransferLimiter', () => {
    it('returns the same instance for the same network', () => {
      const limiter1 = BottleneckModule.getNodeTransferLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getNodeTransferLimiter(NetworksEnum.ethereumMainnet)

      expect(limiter1).to.eq(limiter2)

      const limiter3 = BottleneckModule.transferLimiters[NetworksEnum.ethereumMainnet]
      expect(limiter3).to.eq(limiter1)
    })

    it('returns different instances for different networks', () => {
      const limiter1 = BottleneckModule.getNodeTransferLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getNodeTransferLimiter(NetworksEnum.ethereumSepolia)

      expect(limiter1).not.eq(limiter2)
    })
  })

  describe('getCoinGeckoLimiter', () => {
    it('returns the same instance for the same network', () => {
      const limiter1 = BottleneckModule.getCoinGeckoLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getCoinGeckoLimiter(NetworksEnum.ethereumMainnet)

      expect(limiter1).to.eq(limiter2)

      const limiter3 = BottleneckModule.coinGeckoLimiters[NetworksEnum.ethereumMainnet]
      expect(limiter3).to.eq(limiter1)
    })

    it('returns different instances for different networks', () => {
      const limiter1 = BottleneckModule.getCoinGeckoLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getCoinGeckoLimiter(NetworksEnum.ethereumSepolia)

      expect(limiter1).not.eq(limiter2)
    })
  })

  describe('get4ByteLimiter', () => {
    it('returns the same instance for the same network', () => {
      const limiter1 = BottleneckModule.get4ByteLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.get4ByteLimiter(NetworksEnum.ethereumMainnet)

      expect(limiter1).to.eq(limiter2)

      const limiter3 = BottleneckModule.fourBytesLimiters[NetworksEnum.ethereumMainnet]
      expect(limiter3).to.eq(limiter1)
    })

    it('returns different instances for different networks', () => {
      const limiter1 = BottleneckModule.get4ByteLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.get4ByteLimiter(NetworksEnum.ethereumSepolia)

      expect(limiter1).not.eq(limiter2)
    })
  })

  describe('getAlchemyBatchRequestLimiter', () => {
    it('returns the same instance for the same network', () => {
      const limiter1 = BottleneckModule.getAlchemyBatchRequest(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getAlchemyBatchRequest(NetworksEnum.ethereumMainnet)

      expect(limiter1).to.eq(limiter2)

      const limiter3 = BottleneckModule.alchemyBathRequestLimiters[NetworksEnum.ethereumMainnet]
      expect(limiter3).to.eq(limiter1)
    })

    it('returns different instances for different networks', () => {
      const limiter1 = BottleneckModule.getAlchemyBatchRequest(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getAlchemyBatchRequest(NetworksEnum.ethereumSepolia)

      expect(limiter1).not.eq(limiter2)
    })
  })

  describe('getAlchemyENSLimiter', () => {
    it('returns the same instance for the same network', () => {
      const limiter1 = BottleneckModule.getAlchemyENSLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getAlchemyENSLimiter(NetworksEnum.ethereumMainnet)

      expect(limiter1).to.eq(limiter2)

      const limiter3 = BottleneckModule.alchemyENSLimiters[NetworksEnum.ethereumMainnet]
      expect(limiter3).to.eq(limiter1)
    })

    it('returns different instances for different networks', () => {
      const limiter1 = BottleneckModule.getAlchemyENSLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getAlchemyENSLimiter(NetworksEnum.ethereumSepolia)

      expect(limiter1).not.eq(limiter2)
    })
  })

  describe('getAlchemyBalanceLimiter', () => {
    it('returns the same instance for the same network', () => {
      const limiter1 = BottleneckModule.getAlchemyBalanceLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getAlchemyBalanceLimiter(NetworksEnum.ethereumMainnet)

      expect(limiter1).to.eq(limiter2)

      const limiter3 = BottleneckModule.alchemyBalanceLimiters[NetworksEnum.ethereumMainnet]
      expect(limiter3).to.eq(limiter1)
    })

    it('returns different instances for different networks', () => {
      const limiter1 = BottleneckModule.getAlchemyBalanceLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getAlchemyBalanceLimiter(NetworksEnum.ethereumSepolia)

      expect(limiter1).not.eq(limiter2)
    })
  })

  describe('getEtherScanLimiter', () => {
    it('returns the same instance for the same network', () => {
      const limiter1 = BottleneckModule.getEtherScanLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getEtherScanLimiter(NetworksEnum.ethereumMainnet)

      expect(limiter1).to.eq(limiter2)

      const limiter3 = BottleneckModule.etherScanLimiters[NetworksEnum.ethereumMainnet]
      expect(limiter3).to.eq(limiter1)
    })

    it('returns different instances for different networks', () => {
      const limiter1 = BottleneckModule.getEtherScanLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getEtherScanLimiter(NetworksEnum.ethereumSepolia)

      expect(limiter1).not.eq(limiter2)
    })
  })

  describe('getBlockScoutLimiter', () => {
    it('returns the same instance for the same network', () => {
      const limiter1 = BottleneckModule.getBlockScoutLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getBlockScoutLimiter(NetworksEnum.ethereumMainnet)

      expect(limiter1).to.eq(limiter2)

      const limiter3 = BottleneckModule.blockScoutLimiters[NetworksEnum.ethereumMainnet]
      expect(limiter3).to.eq(limiter1)
    })

    it('returns different instances for different networks', () => {
      const limiter1 = BottleneckModule.getBlockScoutLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getBlockScoutLimiter(NetworksEnum.ethereumSepolia)

      expect(limiter1).not.eq(limiter2)
    })
  })

  describe('getChilizLimiter', () => {
    it('returns the same instance for the same network', () => {
      const limiter1 = BottleneckModule.getChilizLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getChilizLimiter(NetworksEnum.ethereumMainnet)

      expect(limiter1).to.eq(limiter2)

      const limiter3 = BottleneckModule.chilizLimiters[NetworksEnum.ethereumMainnet]
      expect(limiter3).to.eq(limiter1)
    })

    it('returns different instances for different networks', () => {
      const limiter1 = BottleneckModule.getChilizLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getChilizLimiter(NetworksEnum.ethereumSepolia)

      expect(limiter1).not.eq(limiter2)
    })
  })

  describe('getDuneLimiter', () => {
    it('returns the same instance for the same network', () => {
      const limiter1 = BottleneckModule.getDuneLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getDuneLimiter(NetworksEnum.ethereumMainnet)

      expect(limiter1).to.eq(limiter2)

      const limiter3 = BottleneckModule.duneLimiters[NetworksEnum.ethereumMainnet]
      expect(limiter3).to.eq(limiter1)
    })

    it('returns different instances for different networks', () => {
      const limiter1 = BottleneckModule.getDuneLimiter(NetworksEnum.ethereumMainnet)
      const limiter2 = BottleneckModule.getDuneLimiter(NetworksEnum.ethereumSepolia)

      expect(limiter1).not.eq(limiter2)
    })

    it('creates a limiter instance', () => {
      const limiter = BottleneckModule.getDuneLimiter(NetworksEnum.ethereumMainnet)

      // Check that a limiter instance was created
      expect(limiter).to.exist
      expect(limiter).to.have.property('schedule')
      expect(limiter.schedule).to.be.a('function')
    })
  })
})
