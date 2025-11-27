import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import CornProvider from '@modules/proxyProvider/cornProvider'
import BlockScoutProvider from '@modules/proxyProvider/blockscoutProvider'
import { NetworksEnum } from '@types'
import { evmExplorerClient, EvmExplorerEnum } from '@helpers/evmExplorerClient'

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

  describe('fetchContractSourceCode', () => {
    it('should delegate to RouteScanHelper.fetchContractSourceCode', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.cornMainnet
      const expectedResult = [{ SourceCode: 'contract Test {}', ContractName: 'Test' }]

      const routeScanStub = sandbox.stub(evmExplorerClient, 'fetchContractSourceCode').resolves(expectedResult as any)

      // Act
      const result = await CornProvider.fetchContractSourceCode({ address, network })

      // Assert
      expect(result).to.equal(expectedResult)
      expect(routeScanStub.calledOnce).to.be.true
      expect(routeScanStub.firstCall.args[0]).to.be.equal(EvmExplorerEnum.ROUTESCAN)
      expect(routeScanStub.firstCall.args[1]).to.deep.equal(address)
      expect(routeScanStub.firstCall.args[2]).to.deep.equal(network)
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

      const routeScanStub = sandbox.stub(evmExplorerClient, 'fetchContractCreation').resolves(expectedResult)

      // Act
      const result = await CornProvider.fetchContractCreation({ address, network })

      // Assert
      expect(result).to.equal(expectedResult)
      expect(routeScanStub.calledOnce).to.be.true
      expect(routeScanStub.firstCall.args[0]).to.be.equal(EvmExplorerEnum.ROUTESCAN)
      expect(routeScanStub.firstCall.args[1]).to.deep.equal(address)
      expect(routeScanStub.firstCall.args[2]).to.deep.equal(network)
    })
  })
})
