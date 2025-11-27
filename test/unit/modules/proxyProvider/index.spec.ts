import { expect } from 'chai'
import sinon from 'sinon'
import { NetworksEnum, IWeb3ProxyMethod } from '@types'
import Web3Provider from '@modules/proxyProvider/web3Provider'
import PeaqProvider from '@modules/proxyProvider/peaqProvider'
import ProxyWeb3Provider from '@modules/proxyProvider'
import ChilizProvider from '@modules/proxyProvider/chilizProvider'
import CornProvider from '@modules/proxyProvider/cornProvider' // Updated import
import KatanaProvider from '@modules/proxyProvider/katanaProvider'

describe('ProxyWeb3Provider', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getProvider', () => {
    it('should return PeaqProvider for peaqMainnet network', () => {
      const provider = ProxyWeb3Provider.getProvider(NetworksEnum.peaqMainnet)
      expect(provider).to.equal(PeaqProvider)
    })

    it('should return Web3Provider for other networks', () => {
      const provider = ProxyWeb3Provider.getProvider(NetworksEnum.ethereumMainnet)
      expect(provider).to.equal(Web3Provider)
    })

    it('should return ChillizProvider for chilizMainnet network', () => {
      const provider = ProxyWeb3Provider.getProvider(NetworksEnum.chilizMainnet)
      expect(provider).to.equal(ChilizProvider)
    })

    it('should return CornProvider for cornMainnet network', () => {
      const provider = ProxyWeb3Provider.getProvider(NetworksEnum.cornMainnet)
      expect(provider).to.equal(CornProvider)
    })

    it('should return KatanaProvider for katanaMainnet network', () => {
      const provider = ProxyWeb3Provider.getProvider(NetworksEnum.katanaMainnet)
      expect(provider).to.equal(KatanaProvider)
    })
  })

  describe('getDefaultProvider', () => {
    it('should return Web3Provider', () => {
      const provider = ProxyWeb3Provider.getDefaultProvider()
      expect(provider).to.equal(Web3Provider)
    })
  })

  describe('forward', () => {
    it('should forward calls to the correct provider', async () => {
      // Arrange
      const mockMethod = 'testMethod'
      const mockArgs = { network: NetworksEnum.peaqMainnet, address: '0x123' }
      const expectedResult = { success: true }

      // Create a mock provider object with the test method
      const mockPeaqProvider = {
        testMethod: sandbox.stub().resolves(expectedResult),
      }

      // Replace the getProvider method to return our mock
      const getProviderStub = sandbox.stub(ProxyWeb3Provider, 'getProvider')
      getProviderStub.withArgs(NetworksEnum.peaqMainnet).returns(mockPeaqProvider)

      // Act
      const forwardFn = ProxyWeb3Provider.forward(mockMethod)
      const result = await forwardFn(mockArgs)

      // Assert
      expect(getProviderStub.calledWith(NetworksEnum.peaqMainnet)).to.be.true
      expect(mockPeaqProvider.testMethod.calledOnce).to.be.true
      expect(mockPeaqProvider.testMethod.firstCall.args[0]).to.deep.equal({
        address: '0x123',
        network: NetworksEnum.peaqMainnet,
      })
      expect(result).to.deep.equal(expectedResult)
    })

    it('should use fallback provider if method not available on primary provider', async () => {
      // Arrange
      const mockMethod = 'testMethod'
      const mockArgs = { network: NetworksEnum.peaqMainnet, address: '0x123' }
      const expectedResult = { success: true }

      // Create mock providers
      const mockPeaqProvider = {} // Primary provider without the method
      const mockWeb3Provider = {
        testMethod: sandbox.stub().resolves(expectedResult),
      }

      // Replace the provider methods
      const getProviderStub = sandbox.stub(ProxyWeb3Provider, 'getProvider')
      getProviderStub.withArgs(NetworksEnum.peaqMainnet).returns(mockPeaqProvider)

      const getDefaultProviderStub = sandbox.stub(ProxyWeb3Provider, 'getDefaultProvider')
      getDefaultProviderStub.returns(mockWeb3Provider)

      // Act
      const forwardFn = ProxyWeb3Provider.forward(mockMethod)
      const result = await forwardFn(mockArgs)

      // Assert
      expect(getProviderStub.calledWith(NetworksEnum.peaqMainnet)).to.be.true
      expect(getDefaultProviderStub.calledOnce).to.be.true
      expect(mockWeb3Provider.testMethod.calledOnce).to.be.true
      expect(mockWeb3Provider.testMethod.firstCall.args[0]).to.deep.equal({
        address: '0x123',
        network: NetworksEnum.peaqMainnet,
      })
      expect(result).to.deep.equal(expectedResult)
    })

    it('should throw error if method not available on any provider', async () => {
      // Arrange
      const nonExistentMethod = 'nonExistentMethod'
      const mockArgs = { network: NetworksEnum.ethereumMainnet, param: 'value' }

      // Create mock providers without the required method
      const mockMainProvider = {}
      const mockFallbackProvider = {}

      // Replace the provider methods
      const getProviderStub = sandbox.stub(ProxyWeb3Provider, 'getProvider')
      getProviderStub.withArgs(NetworksEnum.ethereumMainnet).returns(mockMainProvider)

      const getDefaultProviderStub = sandbox.stub(ProxyWeb3Provider, 'getDefaultProvider')
      getDefaultProviderStub.returns(mockFallbackProvider)

      // Act & Assert
      const forwardFn = ProxyWeb3Provider.forward(nonExistentMethod)

      try {
        await forwardFn(mockArgs)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.include('Method "nonExistentMethod" not implemented for provider or fallback')
      }
    })
  })

  describe('Proxy Methods', () => {
    const testProxyMethod = (methodName: any, proxyMethodEnum: any) => {
      it(`should forward ${methodName} to the correct provider`, async () => {
        // Arrange
        const mockArgs = { network: NetworksEnum.ethereumMainnet, param: 'value' }
        const expectedResult = { success: true }

        // Create a stub for the forward function that returns another function
        const forwardedFn = sandbox.stub().resolves(expectedResult)
        const forwardStub = sandbox.stub(ProxyWeb3Provider, 'forward').returns(forwardedFn)

        // Act
        const result = await ProxyWeb3Provider[methodName](mockArgs)

        // Assert
        expect(forwardStub.calledOnce).to.be.true
        expect(forwardStub.firstCall.args[0]).to.equal(proxyMethodEnum)
        expect(forwardedFn.calledOnce).to.be.true
        expect(forwardedFn.firstCall.args[0]).to.deep.equal(mockArgs)
        expect(result).to.deep.equal(expectedResult)
      })
    }

    // Test all proxy methods that exist in IWeb3ProxyMethod
    testProxyMethod('getNativeBalance', IWeb3ProxyMethod.getNativeBalance)
    testProxyMethod('getTokenBalances', IWeb3ProxyMethod.getTokenBalances)
    testProxyMethod('fetchContractCreation', IWeb3ProxyMethod.fetchContractCreation)
    testProxyMethod('fetchContractSourceCode', IWeb3ProxyMethod.fetchContractSourceCode)
    testProxyMethod('searchDetailsOfContract', IWeb3ProxyMethod.searchDetailsOfContract)
    testProxyMethod('fetchHistoricalTokenPrice', IWeb3ProxyMethod.fetchHistoricalTokenPrice)
  })
})
