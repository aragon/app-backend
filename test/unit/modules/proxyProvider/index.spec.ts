import ProxyWeb3Provider from '@modules/proxyProvider'
import RoutescanProvider from '@modules/proxyProvider/routescanProvider'
import Web3Provider from '@modules/proxyProvider/web3Provider'
import { IWeb3ProxyMethod, NetworksEnum } from '@types'
import { expect } from 'chai'
import sinon from 'sinon'

describe('ProxyWeb3Provider', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('getProvider', () => {
    it('should return Web3Provider for other networks', () => {
      const provider = ProxyWeb3Provider.getProvider(NetworksEnum.ethereumMainnet)
      expect(provider).to.equal(Web3Provider)
    })

    it('should return RoutescanProvider for chilizMainnet network', () => {
      const provider = ProxyWeb3Provider.getProvider(NetworksEnum.chilizMainnet)
      expect(provider).to.equal(RoutescanProvider)
    })

    it('should return the default Web3Provider for katanaMainnet network', () => {
      const provider = ProxyWeb3Provider.getProvider(NetworksEnum.katanaMainnet)
      expect(provider).to.equal(Web3Provider)
    })

    it('should return the default Web3Provider for monadMainnet network', () => {
      const provider = ProxyWeb3Provider.getProvider(NetworksEnum.monadMainnet)
      expect(provider).to.equal(Web3Provider)
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
      const mockArgs = { network: NetworksEnum.chilizMainnet, address: '0x123' }
      const expectedResult = { success: true }

      // Create a mock provider object with the test method
      const mockNetworkProvider = {
        testMethod: sandbox.stub().resolves(expectedResult),
      }

      // Replace the getProvider method to return our mock
      const getProviderStub = sandbox.stub(ProxyWeb3Provider, 'getProvider')
      getProviderStub.withArgs(NetworksEnum.chilizMainnet).returns(mockNetworkProvider)

      // Act
      const forwardFn = ProxyWeb3Provider.forward(mockMethod)
      const result = await forwardFn(mockArgs)

      // Assert
      expect(getProviderStub.calledWith(NetworksEnum.chilizMainnet)).to.be.true
      expect(mockNetworkProvider.testMethod.calledOnce).to.be.true
      expect(mockNetworkProvider.testMethod.firstCall.args[0]).to.deep.equal({
        address: '0x123',
        network: NetworksEnum.chilizMainnet,
      })
      expect(result).to.deep.equal(expectedResult)
    })

    it('should use fallback provider if method not available on primary provider', async () => {
      // Arrange
      const mockMethod = 'testMethod'
      const mockArgs = { network: NetworksEnum.chilizMainnet, address: '0x123' }
      const expectedResult = { success: true }

      // Create mock providers
      const mockNetworkProvider = {} // Primary provider without the method
      const mockWeb3Provider = {
        testMethod: sandbox.stub().resolves(expectedResult),
      }

      // Replace the provider methods
      const getProviderStub = sandbox.stub(ProxyWeb3Provider, 'getProvider')
      getProviderStub.withArgs(NetworksEnum.chilizMainnet).returns(mockNetworkProvider)

      const getDefaultProviderStub = sandbox.stub(ProxyWeb3Provider, 'getDefaultProvider')
      getDefaultProviderStub.returns(mockWeb3Provider)

      // Act
      const forwardFn = ProxyWeb3Provider.forward(mockMethod)
      const result = await forwardFn(mockArgs)

      // Assert
      expect(getProviderStub.calledWith(NetworksEnum.chilizMainnet)).to.be.true
      expect(getDefaultProviderStub.calledOnce).to.be.true
      expect(mockWeb3Provider.testMethod.calledOnce).to.be.true
      expect(mockWeb3Provider.testMethod.firstCall.args[0]).to.deep.equal({
        address: '0x123',
        network: NetworksEnum.chilizMainnet,
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
    testProxyMethod('fetchContractCreation', IWeb3ProxyMethod.fetchContractCreation)
    testProxyMethod('fetchContractSourceCode', IWeb3ProxyMethod.fetchContractSourceCode)
    testProxyMethod('searchDetailsOfContract', IWeb3ProxyMethod.searchDetailsOfContract)
  })
})
