import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ProxyContractHelper from '@helpers/proxyContract'
import { ConfigState } from '@state/configState'
import { getAddress } from 'ethers'
import { NetworksEnum } from '@types'
import proxyquire from 'proxyquire'

describe('Helpers:ProxyContractHelper', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('_fallBackImplementationViaViewCall', () => {
    it('should return the fallback implementation', async () => {
      const getStorageStub = sandbox.stub()
      getStorageStub.onFirstCall().resolves('0x0000000000000000000000000000000000000000000000000000000000000000') // EIP-1967 slot
      getStorageStub.onSecondCall().resolves('0x0000000000000000000000000000000000000000000000000000000000000000') // EIP-1822 slot
      const resolveName = sandbox.stub().resolves('0x000001')
      const providerStub = {
        resolveName,
        getStorage: getStorageStub,
      }

      const stubConfigState = {
        getConfigItem: sandbox.stub().returns(providerStub),
      }
      const { default: MockedProxyContractHelper } = proxyquire.noCallThru()('@helpers/proxyContract', {
        ethers: {
          Contract: function () {
            return {
              getImplementation: sandbox.stub().resolves('0x0'),
            }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedProxyContractHelper._fallBackImplementationViaViewCall(
        '0xProxyAddress',
        NetworksEnum.mainnet,
      )
      expect(result).to.eq('0x0')
    })

    it('should return the fallback implementation when explicit calls fail', async () => {
      const getStorageStub = sandbox.stub()
      getStorageStub.onFirstCall().resolves('0x0000000000000000000000000000000000000000000000000000000000000000') // EIP-1967 slot
      getStorageStub.onSecondCall().resolves('0x0000000000000000000000000000000000000000000000000000000000000000') // EIP-1822 slot
      const resolveName = sandbox.stub().resolves('0x000001')
      const providerStub = {
        resolveName,
        getStorage: getStorageStub,
      }

      const stubConfigState = {
        getConfigItem: sandbox.stub().returns(providerStub),
      }
      const { default: MockedProxyContractHelper } = proxyquire.noCallThru()('@helpers/proxyContract', {
        ethers: {
          Contract: function () {
            return {
              getImplementation: sandbox.stub().rejects(new Error('Method not found')),
              implementation: sandbox.stub().resolves('0x0'),
            }
          },
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
      })

      const result = await MockedProxyContractHelper._fallBackImplementationViaViewCall(
        '0xProxyAddress',
        NetworksEnum.mainnet,
      )
      expect(result).to.eq('0x0')
    })

    it('should return null when both storage slots are empty and no methods provide a valid address', async () => {
      const resolveName = sandbox.stub().resolves('0x000001')
      const hexAddress = '1234567890123456789012345678901234567890'
      const storageResponse = `0x000000000000000000000000${hexAddress}`

      const getStorageStub = sandbox
        .stub()
        .withArgs('0xProxyAddress', '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc')
        .resolves(storageResponse)

      const providerStub = {
        resolveName,
        getStorage: getStorageStub,
      }
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)

      const result = await ProxyContractHelper._fallBackImplementationViaViewCall(
        '0xProxyAddress',
        NetworksEnum.mainnet,
      )

      expect(result).to.be.null
    })
  })

  describe('_fallBackImplementationViaViewCall', () => {
    it('should return the implementation address when minimal proxy pattern is matched', async () => {
      const minimalProxyPattern = '0x363d3d373d3d3d363d73'
      const implementationAddress = '1234567890abcdef1234567890abcdef12345678'
      const byteCode = `${minimalProxyPattern}${implementationAddress}5af43d82803e903d91602b57fd5bf3`

      const result = ProxyContractHelper._getImplementationForMinimalProxy(byteCode)
      expect(result).to.equal(getAddress(`0x${implementationAddress}`))
    })

    it('should return null when the minimal proxy pattern is not present', async () => {
      const nonMatchingByteCode = '0x1234567890abcdef1234567890abcdef123456785af43d82803e903d91602b57fd5bf3'

      const result = ProxyContractHelper._getImplementationForMinimalProxy(nonMatchingByteCode)
      expect(result).to.be.null
    })
  })

  describe('getImplementationAddress', () => {
    it('should getImplementationAddress with _getImplementationForMinimalProxy', async () => {
      const getStorageStub = sandbox
        .stub()
        .resolves('0x0000000000000000000000000000000000000000000000000000000000000000')
      const getCodeStub = sandbox.stub().resolves('someBytecode')
      const minimalProxyStub = sandbox
        .stub(ProxyContractHelper, '_getImplementationForMinimalProxy')
        .returns('0x123456')
      const fallbackStub = sandbox.stub(ProxyContractHelper, '_fallBackImplementationViaViewCall')

      const providerStub = {
        getStorage: getStorageStub,
        getCode: getCodeStub,
      }
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.mainnet)

      expect(getStorageStub.calledOnce).to.be.true
      expect(getStorageStub.calledWith('0xProxyAddress')).to.be.true
      expect(getCodeStub.calledOnce).to.be.true
      expect(minimalProxyStub.calledOnce).to.be.true
      expect(minimalProxyStub.calledWith('someBytecode')).to.be.true
      expect(fallbackStub.notCalled).to.be.true
      expect(result).to.equal('0x123456')
    })

    it('should getImplementationAddress with _fallBackImplementationViaViewCall', async () => {
      const getStorageStub = sandbox
        .stub()
        .resolves('0x0000000000000000000000000000000000000000000000000000000000000000')
      const getCodeStub = sandbox.stub().resolves('someBytecode')
      const minimalProxyStub = sandbox
        .stub(ProxyContractHelper, '_getImplementationForMinimalProxy')
        .returns('0x0000000000000000000000000000000000000000')
      const fallbackStub = sandbox
        .stub(ProxyContractHelper, '_fallBackImplementationViaViewCall')
        .returns('0x123456' as any)

      const providerStub = {
        getStorage: getStorageStub,
        getCode: getCodeStub,
      }
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.mainnet)

      expect(getStorageStub.calledOnce).to.be.true
      expect(getStorageStub.calledWith('0xProxyAddress')).to.be.true
      expect(getCodeStub.calledOnce).to.be.true
      expect(minimalProxyStub.calledOnce).to.be.true
      expect(minimalProxyStub.calledWith('someBytecode')).to.be.true
      expect(fallbackStub.calledOnce).to.be.true
      expect(fallbackStub.calledWith('0xProxyAddress', NetworksEnum.mainnet)).to.be.true
      expect(result).to.equal('0x123456')
    })

    it('should getImplementationAddress when minimal proxy detection fails', async () => {
      const getStorageStub = sandbox
        .stub()
        .resolves('0x0000000000000000000000000000000000000000000000000000000000000000')
      const getCodeStub = sandbox.stub().resolves('someBytecode')
      const minimalProxyStub = sandbox
        .stub(ProxyContractHelper, '_getImplementationForMinimalProxy')
        .returns('0x0000000000000000000000000000000000000000')
      const fallbackStub = sandbox
        .stub(ProxyContractHelper, '_fallBackImplementationViaViewCall')
        .returns('0x0000000000000000000000000000000000000000' as any)

      const providerStub = {
        getStorage: getStorageStub,
        getCode: getCodeStub,
      }
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.mainnet)

      expect(getStorageStub.calledOnce).to.be.true
      expect(getStorageStub.calledWith('0xProxyAddress')).to.be.true
      expect(getCodeStub.calledOnce).to.be.true
      expect(minimalProxyStub.calledOnce).to.be.true
      expect(minimalProxyStub.calledWith('someBytecode')).to.be.true
      expect(fallbackStub.calledOnce).to.be.true
      expect(fallbackStub.calledWith('0xProxyAddress', NetworksEnum.mainnet)).to.be.true
      expect(result).to.be.null
    })

    it('should fail to getImplementationAddress', async () => {
      const getStorageStub = sandbox.stub().rejects(new Error('Failed to get storage'))
      const getCodeStub = sandbox.stub().resolves('someBytecode')

      const providerStub = {
        getStorage: getStorageStub,
        getCode: getCodeStub,
      }
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.mainnet)

      expect(getStorageStub.calledOnce).to.be.true
      expect(getStorageStub.calledWith('0xProxyAddress')).to.be.true
      expect(getCodeStub.notCalled).to.be.true
      expect(result).to.be.null
    })
  })
})
