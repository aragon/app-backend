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
})
