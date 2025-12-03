import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import CornProvider from '@modules/proxyProvider/cornProvider'
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
    it('should delegate to evmExplorerClient.getTokenBalances with ROUTESCAN', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.cornMainnet
      const expectedResult = [{ tokenBalance: '100', contractAddress: '0xabc' }]

      const routeScanStub = sandbox.stub(evmExplorerClient, 'getTokenBalances').resolves(expectedResult as any)

      // Act
      const result = await CornProvider.getTokenBalances({ address, network })

      // Assert
      expect(result).to.equal(expectedResult)
      expect(routeScanStub.calledOnce).to.be.true
      expect(routeScanStub.firstCall.args[0]).to.equal(EvmExplorerEnum.ROUTESCAN)
      expect(routeScanStub.firstCall.args[1]).to.equal(address)
      expect(routeScanStub.firstCall.args[2]).to.equal(network)
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

  describe('getTokenCounters', () => {
    it('should delegate to RouteScanHelper.fetchTokenHoldersCount', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.cornMainnet
      const expectedHolders = 150

      // Import RouteScanHelper to stub it
      const RouteScanHelper = require('@helpers/routeScanHelper').default
      const routeScanStub = sandbox.stub(RouteScanHelper, 'fetchTokenHoldersCount').resolves(expectedHolders)

      // Act
      const result = await CornProvider.getTokenCounters({ address, network })

      // Assert
      expect(result).to.deep.equal({
        holders: expectedHolders,
        transfers: 0,
      })
      expect(routeScanStub.calledOnce).to.be.true
      expect(routeScanStub.firstCall.args[0]).to.deep.equal({ address, network })
    })

    it('should return transfers as 0', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.cornMainnet

      // Import RouteScanHelper to stub it
      const RouteScanHelper = require('@helpers/routeScanHelper').default
      sandbox.stub(RouteScanHelper, 'fetchTokenHoldersCount').resolves(100)

      // Act
      const result = await CornProvider.getTokenCounters({ address, network })

      // Assert
      expect(result.transfers).to.equal(0)
    })

    it('should handle error from RouteScanHelper gracefully', async () => {
      // Arrange
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const network = NetworksEnum.cornMainnet

      // Import RouteScanHelper to stub it
      const RouteScanHelper = require('@helpers/routeScanHelper').default
      const routeScanStub = sandbox.stub(RouteScanHelper, 'fetchTokenHoldersCount').rejects(new Error('API Error'))

      // Act & Assert
      try {
        await CornProvider.getTokenCounters({ address, network })
        expect.fail('Should have thrown error')
      } catch (error: any) {
        expect(error.message).to.equal('API Error')
      }
    })
  })
})
