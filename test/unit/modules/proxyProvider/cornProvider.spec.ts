import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import CornProvider from '@modules/proxyProvider/cornProvider'
import BlockScoutProvider from '@modules/proxyProvider/blockscoutProvider'
import RouteScanHelper from '@helpers/routeScanHelper'
import { NetworksEnum } from '@types'
import BottleneckModule from '@src/modules/bottleneck'

describe('Modules: CornProvider', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('getTokenBalances', () => {
    it('should delegate to BlockScoutProvider.getTokenBalances', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.cornMainnet
      const expectedResult = [{ tokenBalance: '100', contractAddress: '0xabc' }]

      const blockscoutStub = sandbox.stub(BlockScoutProvider, 'getTokenBalances').resolves(expectedResult)

      // Act
      const result = await CornProvider.getTokenBalances({ address, network })

      // Assert
      expect(result).to.equal(expectedResult)
      expect(blockscoutStub.calledOnce).to.be.true
      expect(blockscoutStub.firstCall.args[0]).to.deep.equal({ address, network })
    })
  })

  describe('fetchAddressTxns', () => {
    it('should delegate to BlockScoutProvider.fetchAddressTxns', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.cornMainnet
      const expectedResult = [{ hash: '0xtx1', value: '1.0' }]

      const blockscoutStub = sandbox.stub(BlockScoutProvider, 'fetchAddressTxns').resolves(expectedResult)

      // Act
      const result = await CornProvider.fetchAddressTxns({ address, network })

      // Assert
      expect(result).to.equal(expectedResult)
      expect(blockscoutStub.calledOnce).to.be.true
      expect(blockscoutStub.firstCall.args[0]).to.deep.equal({ address, network })
    })
  })

  describe('fetchBasicTokenInfo', () => {
    it('should delegate to BlockScoutProvider.fetchBasicTokenInfo', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.cornMainnet
      const expectedResult = { symbol: 'TEST', name: 'Test Token' }

      const blockscoutStub = sandbox.stub(BlockScoutProvider, 'fetchBasicTokenInfo').resolves(expectedResult)

      // Act
      const result = await CornProvider.fetchBasicTokenInfo({ address, network })

      // Assert
      expect(result).to.equal(expectedResult)
      expect(blockscoutStub.calledOnce).to.be.true
      expect(blockscoutStub.firstCall.args[0]).to.deep.equal({ address, network })
    })
  })

  describe('fetchContractSourceCode', () => {
    it('should delegate to RouteScanHelper.fetchContractSourceCode', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.cornMainnet
      const expectedResult = [{ SourceCode: 'contract Test {}', ContractName: 'Test' }]

      const routeScanStub = sandbox.stub(RouteScanHelper, 'fetchContractSourceCode').resolves(expectedResult as any)

      // Act
      const result = await CornProvider.fetchContractSourceCode({ address, network })

      // Assert
      expect(result).to.equal(expectedResult)
      expect(routeScanStub.calledOnce).to.be.true
      expect(routeScanStub.firstCall.args[0]).to.deep.equal({ address, network })
    })
  })

  describe('fetchContractCreation', () => {
    it('should delegate to RouteScanHelper.fetchContractCreation', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.cornMainnet
      const expectedResult = {
        address: '0x1234567890abcdef1234567890abcdef12345678',
        transactionHash: '0xabcdef1234567890',
        blockNumber: 12345,
      }

      const routeScanStub = sandbox.stub(RouteScanHelper, 'fetchContractCreation').resolves(expectedResult)

      // Act
      const result = await CornProvider.fetchContractCreation({ address, network })

      // Assert
      expect(result).to.equal(expectedResult)
      expect(routeScanStub.calledOnce).to.be.true
      expect(routeScanStub.firstCall.args[0]).to.deep.equal({ address, network })
    })
  })

  describe('getNetworkBottleneck', () => {
    it('should return slow limiter for the network', () => {
      // Arrange
      const network = NetworksEnum.cornMainnet
      const mockLimiter = { submit: () => {}, schedule: () => {} }
      const getThrottledLimiterStub = sandbox.stub(BottleneckModule, 'getThrottledLimiter').returns(mockLimiter as any)

      // Act
      const result = CornProvider.getNetworkBottleneck(network)

      // Assert
      expect(getThrottledLimiterStub.calledOnceWith(network)).to.be.true
      expect(result).to.equal(mockLimiter)
    })
  })
})
