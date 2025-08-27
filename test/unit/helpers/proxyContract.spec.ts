import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ProxyContractHelper from '@helpers/proxyContract'
import { ethers, getAddress } from 'ethers'
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

  describe('_getBeaconProxyImplementationAddress', () => {
    it('should return the implementation address from a beacon proxy', async () => {
      const proxyAddress = '0xProxyAddress'
      const beaconAddress = '0x1234567890abcdef1234567890abcdef12345678'
      const implementationAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd'

      // Mock storage to return the beacon address
      const beaconStorageValue = '0x000000000000000000000000' + beaconAddress.slice(2)
      const providerStub = {
        getStorageAt: sandbox.stub().resolves(beaconStorageValue),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(network => providerStub as any)

      const proxyImpStub = sandbox
        .stub(ProxyContractHelper, 'getImplementationAddress')
        .resolves(getAddress(implementationAddress))

      const result = await ProxyContractHelper._getBeaconProxyImplementationAddress(
        proxyAddress,
        NetworksEnum.ethereumMainnet,
      )

      expect(providerStub.getStorageAt.calledOnce).to.be.true
      expect(providerStub.getStorageAt.firstCall.args[0]).to.equal(proxyAddress)
      expect(proxyImpStub.calledOnce).to.be.true
      expect(proxyImpStub.firstCall.args[0]).to.equal(getAddress(beaconAddress))
      expect(result).to.equal(getAddress(implementationAddress))
    })

    it('should return null when no beacon address is found', async () => {
      const zeroStorageValue = '0x0000000000000000000000000000000000000000000000000000000000000000'
      const providerStub = {
        getStorageAt: sandbox.stub().resolves(zeroStorageValue),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(network => providerStub as any)

      const result = await ProxyContractHelper._getBeaconProxyImplementationAddress(
        '0xProxyAddress',
        NetworksEnum.ethereumMainnet,
      )
      expect(result).to.be.null
    })

    it('should return null when error occurs', async () => {
      const providerStub = {
        getStorageAt: sandbox.stub().rejects(new Error('Error getting storage')),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(network => providerStub as any)
      const stubLogger = sandbox.stub(Logger, 'warn')
      const result = await ProxyContractHelper._getBeaconProxyImplementationAddress(
        '0xProxyAddress',
        NetworksEnum.ethereumMainnet,
      )
      expect(result).to.be.null
      expect(stubLogger.calledOnce).to.be.true
    })
  })

  describe('_fallBackImplementationViaViewCall', () => {
    it('should return the fallback implementation via getImplementation', async () => {
      const providerStub = {
        getStorage: sandbox.stub().resolves('0x'),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(network => providerStub as any)

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
          getAnyRpcProvider: () => providerStub,
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
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_ => providerStub as any)
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
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_ => providerStub as any)
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
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_ => providerStub as any)

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
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_ => providerStub as any)

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.ethereumMainnet)
      expect(minimalProxyStub.calledOnce).to.be.true
      expect(fallbackStub.calledOnce).to.be.true
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
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_ => providerStub as any)

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.be.null
    })

    it('should fail implementation address', async () => {
      const stubLogger = sandbox.stub(Logger, 'warn')
      const getStorageStub = sandbox.stub().rejects(new Error('Error getting storage'))

      const providerStub = {
        getStorage: getStorageStub,
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_ => providerStub as any)

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.be.null
      expect(stubLogger.calledOnce).to.be.true
    })

    it('should return the implementation address from beacon proxy when other methods fail', async () => {
      const beaconImplementationAddress = '0x1234567890123456789012345678901234567890'

      const getStorageStub = sandbox.stub().resolves('0x')
      const getCodeStub = sandbox.stub().resolves('someBytecode')
      const minimalProxyStub = sandbox.stub(ProxyContractHelper, '_getImplementationForMinimalProxy').returns(null)
      const fallbackStub = sandbox.stub(ProxyContractHelper, '_fallBackImplementationViaViewCall').resolves(null)
      const beaconProxyStub = sandbox
        .stub(ProxyContractHelper, '_getBeaconProxyImplementationAddress')
        .resolves(getAddress(beaconImplementationAddress))

      const providerStub = {
        getStorage: getStorageStub,
        getStorageAt: getStorageStub,
        getCode: getCodeStub,
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_ => providerStub as any)
      sandbox.stub(ProxyContractHelper, 'getAddressFromStorage').resolves(null)

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.ethereumMainnet)

      expect(minimalProxyStub.calledOnce).to.be.true
      expect(fallbackStub.calledOnce).to.be.true
      expect(beaconProxyStub.calledOnce).to.be.true
      expect(beaconProxyStub.firstCall.args[0]).to.equal('0xProxyAddress')
      expect(beaconProxyStub.firstCall.args[1]).to.equal(NetworksEnum.ethereumMainnet)
      expect(result).to.equal(getAddress(beaconImplementationAddress))
    })

    it('should return null when no implementation address is found including beacon proxy', async () => {
      const getStorageStub = sandbox.stub().resolves('0x')
      const getCodeStub = sandbox.stub().resolves('someBytecode')
      const minimalProxyStub = sandbox.stub(ProxyContractHelper, '_getImplementationForMinimalProxy').returns(null)
      const fallbackStub = sandbox.stub(ProxyContractHelper, '_fallBackImplementationViaViewCall').resolves(null)
      const beaconProxyStub = sandbox.stub(ProxyContractHelper, '_getBeaconProxyImplementationAddress').resolves(null)

      const providerStub = {
        getStorage: getStorageStub,
        getStorageAt: getStorageStub,
        getCode: getCodeStub,
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_ => providerStub as any)
      sandbox.stub(ProxyContractHelper, 'getAddressFromStorage').resolves(null)

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.ethereumMainnet)

      expect(minimalProxyStub.calledOnce).to.be.true
      expect(fallbackStub.calledOnce).to.be.true
      expect(beaconProxyStub.calledOnce).to.be.true
      expect(result).to.be.null
    })

    it('should handle recursive beacon proxies with depth limit', async () => {
      const stubLogger = sandbox.stub(Logger, 'warn')

      // Create a chain of addresses that will cause deep recursion
      const addresses = [
        '0x1234567890123456789012345678901234567890',
        '0x2345678901234567890123456789012345678901',
        '0x3456789012345678901234567890123456789012',
        '0x4567890123456789012345678901234567890123',
        '0x5678901234567890123456789012345678901234',
        '0x6789012345678901234567890123456789012345',
        '0x7890123456789012345678901234567890123456',
      ]

      // Calculate the beacon proxy storage slot
      const hash = ethers.keccak256(ethers.toUtf8Bytes('eip1967.proxy.beacon'))
      const slot = '0x' + (BigInt(hash) - 1n).toString(16)

      // Mock storage to return different beacon addresses in sequence
      const getStorageAtStub = sandbox.stub()
      for (let i = 0; i < addresses.length - 1; i++) {
        const beaconStorageValue = '0x000000000000000000000000' + addresses[i + 1].slice(2)
        getStorageAtStub.withArgs(addresses[i], slot).resolves(beaconStorageValue)
      }
      // Last address points to itself to create the eventual recursion
      const lastBeaconValue = '0x000000000000000000000000' + addresses[addresses.length - 1].slice(2)
      getStorageAtStub.withArgs(addresses[addresses.length - 1], slot).resolves(lastBeaconValue)

      const providerStub = {
        getStorageAt: getStorageAtStub,
        getStorage: sandbox.stub().resolves('0x'),
        getCode: sandbox.stub().resolves('someBytecode'),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_ => providerStub as any)
      sandbox.stub(ProxyContractHelper, 'getAddressFromStorage').resolves(null)
      sandbox.stub(ProxyContractHelper, '_getImplementationForMinimalProxy').returns(null)
      sandbox.stub(ProxyContractHelper, '_fallBackImplementationViaViewCall').resolves(null)

      const result = await ProxyContractHelper.getImplementationAddress(addresses[0], NetworksEnum.ethereumMainnet)

      expect(result).to.be.null
      expect(stubLogger.called).to.be.true

      const loggerCalls = stubLogger.getCalls()
      expect(loggerCalls[0].firstArg).to.be.eq('Maximum recursion depth reached for proxy resolution')
    })

    it('should handle circular reference in beacon proxies', async () => {
      const stubLogger = sandbox.stub(Logger, 'warn')
      const proxyAddress = '0x1234567890123456789012345678901234567890'

      // Create a circular reference scenario
      const beaconProxyStub = sandbox.stub(ProxyContractHelper, '_getBeaconProxyImplementationAddress')
      beaconProxyStub.callsFake(async (address, network, depth = 0, visited = new Set()) => {
        // Return the same address to create circular reference
        return ProxyContractHelper.getImplementationAddress(proxyAddress, network, depth + 1, visited)
      })

      const getStorageStub = sandbox.stub().resolves('0x')
      const getCodeStub = sandbox.stub().resolves('someBytecode')
      sandbox.stub(ProxyContractHelper, '_getImplementationForMinimalProxy').returns(null)
      sandbox.stub(ProxyContractHelper, '_fallBackImplementationViaViewCall').resolves(null)

      const providerStub = {
        getStorage: getStorageStub,
        getStorageAt: getStorageStub,
        getCode: getCodeStub,
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_ => providerStub as any)
      sandbox.stub(ProxyContractHelper, 'getAddressFromStorage').resolves(null)

      const result = await ProxyContractHelper.getImplementationAddress(proxyAddress, NetworksEnum.ethereumMainnet)

      expect(result).to.be.null
      expect(stubLogger.called).to.be.true

      // Check if any of the logger calls contains the expected message
      const loggerCalls = stubLogger.getCalls()
      expect(loggerCalls[0].firstArg).to.be.eq('Circular reference detected in proxy resolution')
    })
  })
})
