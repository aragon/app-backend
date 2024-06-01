import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import BottleneckModule from '@modules/bottleneck'
import { NetworksEnum } from '@types'

describe('Module: bottleneck', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getNodeLimiter', () => {
    it('returns the same instance for the same network', () => {
      const limiter1 = BottleneckModule.getNodeLimiter(NetworksEnum.mainnet)
      const limiter2 = BottleneckModule.getNodeLimiter(NetworksEnum.mainnet)

      expect(limiter1).to.eq(limiter2)

      const limiter3 = BottleneckModule.nodeLimiters[NetworksEnum.mainnet]
      expect(limiter3).to.eq(limiter1)
    })

    it('returns different instances for different networks', () => {
      const limiter1 = BottleneckModule.getNodeLimiter(NetworksEnum.mainnet)
      const limiter2 = BottleneckModule.getNodeLimiter(NetworksEnum.sepolia)

      expect(limiter1).not.eq(limiter2)
    })
  })

  describe('getNodeTransferLimiter', () => {
    it('returns the same instance for the same network', () => {
      const limiter1 = BottleneckModule.getNodeTransferLimiter(NetworksEnum.mainnet)
      const limiter2 = BottleneckModule.getNodeTransferLimiter(NetworksEnum.mainnet)

      expect(limiter1).to.eq(limiter2)

      const limiter3 = BottleneckModule.transferLimiters[NetworksEnum.mainnet]
      expect(limiter3).to.eq(limiter1)
    })

    it('returns different instances for different networks', () => {
      const limiter1 = BottleneckModule.getNodeTransferLimiter(NetworksEnum.mainnet)
      const limiter2 = BottleneckModule.getNodeTransferLimiter(NetworksEnum.sepolia)

      expect(limiter1).not.eq(limiter2)
    })
  })
})
