import { EvmExplorerEnum, evmExplorerClient } from '@helpers/evmExplorerClient'
import KatanaProvider from '@modules/proxyProvider/katanaProvider'
import ProxyUtils from '@modules/proxyProvider/utils'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Modules: KatanaProvider', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('getTokenBalances', () => {
    it('should call evmExplorerClient with ETHERSCAN and enrichTokenBalances', async () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.katanaMainnet
      const mockTokenBalances = [
        {
          contractAddress: '0xtoken1',
          tokenBalance: '100.5',
          originalBalance: '100500000000000000000',
          priceUsd: '1.5',
        },
      ]
      const enrichedResult = [
        {
          contractAddress: '0xToken1',
          tokenBalance: '100.5',
          originalBalance: '100500000000000000000',
          priceUsd: '1.5',
        },
      ]

      const evmStub = sandbox.stub(evmExplorerClient, 'getTokenBalances').resolves(mockTokenBalances)
      const enrichStub = sandbox.stub(ProxyUtils, 'enrichTokenBalances').resolves(enrichedResult)

      const result = await KatanaProvider.getTokenBalances({ address, network })

      expect(evmStub.calledOnceWith(EvmExplorerEnum.ETHERSCAN, address, network)).to.be.true
      expect(enrichStub.calledOnceWith(mockTokenBalances, network)).to.be.true
      expect(result).to.deep.equal(enrichedResult)
    })

    it('should return empty array when evmExplorerClient returns empty array', async () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.katanaMainnet

      sandbox.stub(evmExplorerClient, 'getTokenBalances').resolves([])
      sandbox.stub(ProxyUtils, 'enrichTokenBalances').resolves([])

      const result = await KatanaProvider.getTokenBalances({ address, network })

      expect(result).to.be.an('array').that.is.empty
    })
  })
})
