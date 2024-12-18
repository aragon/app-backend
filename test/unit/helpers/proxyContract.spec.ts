import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ProxyContractHelper from '@helpers/proxyContract'
import { getAddress } from 'ethers'
import { NetworksEnum } from '@types'
import proxyquire from 'proxyquire'
import Logger from '@logger'
import ProviderModule from '@modules/provider'

describe('Helpers:ProxyContractHelper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('_getImplementationForMinimalProxy', () => {
    it('should return the implementation address when minimal proxy pattern is matched', () => {
      const minimalProxyPattern = '0x363d3d373d3d3d363d73'
      const implementationAddress = '1234567890abcdef1234567890abcdef12345678'
      const byteCode = `${minimalProxyPattern}${implementationAddress}5af43d82803e903d91602b57fd5bf3`

      const result = ProxyContractHelper._getImplementationForMinimalProxy(byteCode)
      expect(result).to.equal(getAddress(`0x${implementationAddress}`))
    })

    it('should return null when the minimal proxy pattern is not present', () => {
      const nonMatchingByteCode = '0x1234567890abcdef1234567890abcdef123456785af43d82803e903d91602b57fd5bf3'

      const result = ProxyContractHelper._getImplementationForMinimalProxy(nonMatchingByteCode)
      expect(result).to.be.null
    })
  })

  describe('_fallBackImplementationViaViewCall', () => {
    it('should return the fallback implementation via getImplementation', async () => {
      const providerStub = {
        getStorage: sandbox.stub().resolves('0x'),
      }
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => providerStub as any)

      const contractStub = {
        getImplementation: sandbox.stub().resolves('0x0000000000000000000000000000000000000001'),
        implementation: sandbox.stub().rejects(new Error('Method not found')),
      }

      const { default: MockedProxyContractHelper } = proxyquire.noCallThru()('@helpers/proxyContract', {
        ethers: {
          Contract: function () {
            return contractStub
          },
        },
        '@modules/provider': {
          getProvider: () => providerStub,
        },
      })

      const result = await MockedProxyContractHelper._fallBackImplementationViaViewCall(
        '0xProxyAddress',
        NetworksEnum.ethereumMainnet,
      )
      expect(result).to.eq('0x0000000000000000000000000000000000000001')
    })

    it('should return the fallback implementation via implementation', async () => {
      const providerStub = {
        getStorage: sandbox.stub().resolves('0x'),
      }

      const stubConfigState = {
        getConfigItem: sandbox.stub().returns(providerStub),
      }

      const contractStub = {
        getImplementation: sandbox.stub().rejects(new Error('Method not found')),
        implementation: sandbox.stub().resolves('0x0000000000000000000000000000000000000002'),
      }

      const { default: MockedProxyContractHelper } = proxyquire.noCallThru()('@helpers/proxyContract', {
        ethers: {
          Contract: function () {
            return contractStub
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedProxyContractHelper._fallBackImplementationViaViewCall(
        '0xProxyAddress',
        NetworksEnum.ethereumMainnet,
      )
      expect(result).to.eq('0x0000000000000000000000000000000000000002')
    })

    it('should return null when both methods fail', async () => {
      const providerStub = {
        getStorage: sandbox.stub().resolves('0x'),
      }

      const stubConfigState = {
        getConfigItem: sandbox.stub().returns(providerStub),
      }

      const contractStub = {
        getImplementation: sandbox.stub().rejects(new Error('Method not found')),
        implementation: sandbox.stub().rejects(new Error('Method not found')),
      }

      const { default: MockedProxyContractHelper } = proxyquire.noCallThru()('@helpers/proxyContract', {
        ethers: {
          Contract: function () {
            return contractStub
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedProxyContractHelper._fallBackImplementationViaViewCall(
        '0xProxyAddress',
        NetworksEnum.ethereumMainnet,
      )
      expect(result).to.be.null
    })
  })

  describe('getImplementationAddress', () => {
    it('should return the implementation address from EIP-1967 slot', async () => {
      const hexAddress = '1234567890123456789012345678901234567890'
      const storageResponse = `0x000000000000000000000000${hexAddress}`

      const getStorageStub = sandbox.stub()
      getStorageStub
        .withArgs('0xProxyAddress', '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc')
        .resolves(storageResponse)
      const getCodeStub = sandbox.stub().resolves('someBytecode')

      const providerStub = {
        getStorage: getStorageStub,
        getCode: getCodeStub,
      }
      sandbox.stub(ProviderModule, 'getProvider').callsFake(_ => providerStub as any)
      sandbox.stub(ProxyContractHelper, 'getAddressFromStorage').resolves(`0x${hexAddress}`)

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal(getAddress(`0x${hexAddress}`))
    })

    it('should return the implementation address from FiatProxy slot', async () => {
      const hexAddress = '1234567890123456789012345678901234567890'
      const storageResponse = `0x000000000000000000000000${hexAddress}`

      const getStorageStub = sandbox.stub()
      getStorageStub
        .withArgs('0xProxyAddress', '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc')
        .resolves('0x')
      getStorageStub
        .withArgs('0xProxyAddress', '0x7050c9e0f4ca769c69bd3a8ef740bc37934f8e2c036e5a723fd8ee048ed3f8c3')
        .resolves(storageResponse)
      const getCodeStub = sandbox.stub().resolves('someBytecode')

      const providerStub = {
        getStorage: getStorageStub,
        getCode: getCodeStub,
      }
      sandbox.stub(ProviderModule, 'getProvider').callsFake(_ => providerStub as any)
      sandbox.stub(ProxyContractHelper, 'getAddressFromStorage').resolves(`0x${hexAddress}`)

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal(getAddress(`0x${hexAddress}`))
    })

    it('should return the implementation address from minimal proxy bytecode', async () => {
      const minimalProxyPattern = '0x363d3d373d3d3d363d73'
      const implementationAddress = '1234567890abcdef1234567890abcdef12345678'
      const byteCode = `${minimalProxyPattern}${implementationAddress}5af43d82803e903d91602b57fd5bf3`

      const getStorageStub = sandbox.stub().resolves('0x')
      const getCodeStub = sandbox.stub().resolves(byteCode)

      const providerStub = {
        getStorage: getStorageStub,
        getCode: getCodeStub,
      }
      sandbox.stub(ProviderModule, 'getProvider').callsFake(_ => providerStub as any)

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal(getAddress(`0x${implementationAddress}`))
    })

    it('should return the implementation address from fallback view call', async () => {
      const getStorageStub = sandbox.stub().resolves('0x')
      const getCodeStub = sandbox.stub().resolves('someBytecode')
      const minimalProxyStub = sandbox.stub(ProxyContractHelper, '_getImplementationForMinimalProxy').returns(null)
      const fallbackStub = sandbox.stub(ProxyContractHelper, '_fallBackImplementationViaViewCall').resolves('0x123456')

      const providerStub = {
        getStorage: getStorageStub,
        getCode: getCodeStub,
      }
      sandbox.stub(ProviderModule, 'getProvider').callsFake(_ => providerStub as any)

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal('0x123456')
    })

    it('should return null when no implementation address is found', async () => {
      const getStorageStub = sandbox.stub().resolves('0x')
      const getCodeStub = sandbox.stub().resolves('someBytecode')
      const minimalProxyStub = sandbox.stub(ProxyContractHelper, '_getImplementationForMinimalProxy').returns(null)
      const fallbackStub = sandbox.stub(ProxyContractHelper, '_fallBackImplementationViaViewCall').resolves(null)

      const providerStub = {
        getStorage: getStorageStub,
        getCode: getCodeStub,
      }
      sandbox.stub(ProviderModule, 'getProvider').callsFake(_ => providerStub as any)

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.be.null
    })

    it('should fail implementation address', async () => {
      const stubLogger = sandbox.stub(Logger, 'warn')
      const getStorageStub = sandbox.stub().rejects(new Error('Error getting storage'))

      const providerStub = {
        getStorage: getStorageStub,
      }
      sandbox.stub(ProviderModule, 'getProvider').callsFake(_ => providerStub as any)

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.be.null
      expect(stubLogger.calledOnce).to.be.true
    })
  })
})
