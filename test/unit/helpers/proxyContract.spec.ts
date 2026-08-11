import ContractHelper from '@helpers/contractHelper'
import ProxyContractHelper from '@helpers/proxyContract'
import Logger from '@logger'
import ProviderModule from '@modules/provider'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { ethers, getAddress, ZeroAddress } from 'ethers'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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

    it('should return the implementation address for the optimised 44-byte clone variant', () => {
      const optimisedProxyPattern = '0x3d3d3d3d363d3d37363d73'
      const implementationAddress = '1234567890abcdef1234567890abcdef12345678'
      const byteCode = `${optimisedProxyPattern}${implementationAddress}5af43d3d93803e602a57fd5bf3`

      const result = ProxyContractHelper._getImplementationForMinimalProxy(byteCode)
      expect(result).to.equal(getAddress(`0x${implementationAddress}`))
    })

    it('should resolve a real thirdweb clone deployed on Base', () => {
      // 0x3752B172d0Da6921b37Ad68dC8F0CC77651CD3b8 on Base - a TokenERC20 clone
      const byteCode = '0x3d3d3d3d363d3d37363d73071b36bce6a1e1693a864b933275fc3775fc7cc95af43d3d93803e602a57fd5bf3'

      const result = ProxyContractHelper._getImplementationForMinimalProxy(byteCode)
      expect(result).to.equal(getAddress('0x071b36bce6a1e1693a864b933275fc3775fc7cc9'))
    })

    it('should return null when the minimal proxy pattern is not present', () => {
      const nonMatchingByteCode = '0x1234567890abcdef1234567890abcdef123456785af43d82803e903d91602b57fd5bf3'

      const result = ProxyContractHelper._getImplementationForMinimalProxy(nonMatchingByteCode)
      expect(result).to.be.null
    })

    it('should return null when the prefix matches but the delegatecall suffix does not', () => {
      const byteCode = `0x363d3d373d3d3d363d731234567890abcdef1234567890abcdef12345678deadbeefdeadbeefdeadbeef`

      expect(ProxyContractHelper._getImplementationForMinimalProxy(byteCode)).to.be.null
    })

    it('should return null for truncated bytecode that only opens with the prefix', () => {
      expect(ProxyContractHelper._getImplementationForMinimalProxy('0x363d3d373d3d3d363d7312345678')).to.be.null
    })

    it('should not confuse the two variants suffixes', () => {
      // standard prefix paired with the optimised variant suffix is not a valid clone
      const byteCode = `0x363d3d373d3d3d363d731234567890abcdef1234567890abcdef123456785af43d3d93803e602a57fd5bf3`

      expect(ProxyContractHelper._getImplementationForMinimalProxy(byteCode)).to.be.null
    })

    it('should return the implementation address for the ERC-7511 PUSH0 variant', () => {
      const implementationAddress = '1234567890abcdef1234567890abcdef12345678'
      const byteCode = `0x365f5f375f5f365f73${implementationAddress}5af43d5f5f3e5f3d91602a57fd5bf3`

      expect(ProxyContractHelper._getImplementationForMinimalProxy(byteCode)).to.equal(
        getAddress(`0x${implementationAddress}`),
      )
    })

    it('should return the implementation address for the Solady PUSH0 variant', () => {
      const implementationAddress = '1234567890abcdef1234567890abcdef12345678'
      const byteCode = `0x5f5f365f5f37365f73${implementationAddress}5af43d5f5f3e6029573d5ffd5b3d5ff3`

      expect(ProxyContractHelper._getImplementationForMinimalProxy(byteCode)).to.equal(
        getAddress(`0x${implementationAddress}`),
      )
    })

    it('should not accept a PUSH0 prefix paired with the wrong suffix', () => {
      const byteCode = `0x365f5f375f5f365f731234567890abcdef1234567890abcdef123456785af43d3d93803e602a57fd5bf3`

      expect(ProxyContractHelper._getImplementationForMinimalProxy(byteCode)).to.be.null
    })

    it('should still resolve a clone that appends immutable args after the suffix', () => {
      const implementationAddress = '1234567890abcdef1234567890abcdef12345678'
      const byteCode = `0x3d3d3d3d363d3d37363d73${implementationAddress}5af43d3d93803e602a57fd5bf3${'ab'.repeat(32)}`

      expect(ProxyContractHelper._getImplementationForMinimalProxy(byteCode)).to.equal(
        getAddress(`0x${implementationAddress}`),
      )
    })
  })

  describe('_getBeaconFromImmutableBytecode', () => {
    // 0x833D3169fC6B96430F7325258eD8711A3aD163B1 on polygon - beacon held in an immutable, so the
    // beacon storage slot is empty and implementation() on the proxy itself reverts
    const immutableBeaconProxyCode =
      '0x6080806040523615610016575b6100146100da565b005b635c60da1b60e01b81526020816004817f000000000000000000000000dc59f14c7eb3c594655b2ca563a55f7bec6c821c6001600160a01b03165afa9081156100ce57600091610071575b5061006b9061017d565b3861000c565b6020913d83116100c6575b601f8301601f191682019067ffffffffffffffff8211838310176100b2575060405261006b916100ac910161019e565b90610061565b634e487b7160e01b81526041600452602490fd5b3d925061007c565b6040513d6000823e3d90fd5b604051635c60da1b60e01b81526020816004817f000000000000000000000000dc59f14c7eb3c594655b2ca563a55f7bec6c821c6001600160a01b03165afa80156100ce57600090610133575b610131915061017d565b565b6020903d8211610175575b601f8201601f191683019067ffffffffffffffff8211848310176100b2575060405261013191610170918101906101c5565b610127565b3d915061013e565b90506000808092368280378136915af43d82803e1561019a573d90f35b3d90fd5b602090607f1901126101c0576080516001600160a01b03811681036101c05790565b600080fd5b908160209103126101c057516001600160a01b03811681036101c0579056fe'

    it('should extract a beacon address embedded as an immutable', () => {
      const result = ProxyContractHelper._getBeaconFromImmutableBytecode(immutableBeaconProxyCode)
      expect(result).to.equal(getAddress('0xdc59f14c7eb3c594655b2ca563a55f7bec6c821c'))
    })

    it('should return null when the implementation() selector is absent', () => {
      expect(ProxyContractHelper._getBeaconFromImmutableBytecode('0xdeadbeef')).to.be.null
    })

    it('should return null when the selector is present but no immutable beacon is embedded', () => {
      expect(ProxyContractHelper._getBeaconFromImmutableBytecode('0x635c60da1b60e01b6080604052')).to.be.null
    })

    it('should not match an embedded address that is staticcalled without the implementation() selector', () => {
      // same push/mask/staticcall shape, but the call is not implementation() - must not match
      const code = '0x60806040527f000000000000000000000000' + 'ab'.repeat(20) + '6001600160a01b03165afa'
      expect(ProxyContractHelper._getBeaconFromImmutableBytecode(code)).to.be.null
    })

    it('should not match when the selector is far away from the embedded address', () => {
      // selector present but > 32 bytes before the push, so the two are unrelated
      const code =
        '0x635c60da1b60e01b' +
        '00'.repeat(64) +
        '7f000000000000000000000000' +
        'ab'.repeat(20) +
        '6001600160a01b03165afa'
      expect(ProxyContractHelper._getBeaconFromImmutableBytecode(code)).to.be.null
    })

    it('should not match a push32 that is not a zero-padded address', () => {
      const code = '0x635c60da1b60e01b81527f' + 'ff'.repeat(32) + '6001600160a01b03165afa'
      expect(ProxyContractHelper._getBeaconFromImmutableBytecode(code)).to.be.null
    })
  })

  describe('_getBeaconProxyImplementationAddress', () => {
    it("should return the implementation the beacon serves rather than the beacon's own logic", async () => {
      const proxyAddress = '0xProxyAddress'
      // an upgradeable beacon - resolving it as a proxy would yield its own logic contract
      const beaconAddress = '0x3ee18B2214AFF97000D974cf647E7C347E8fa585'
      const servedImplementation = '0x0fd04a68d3c3a692d6fa30384d1a87ef93554ee6'
      const beaconOwnLogic = '0x381752f5458282d317d12c30d2bd4d6e1fd8841e'

      const providerStub = {
        getStorageAt: sandbox.stub().resolves('0x000000000000000000000000' + beaconAddress.slice(2)),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_network => providerStub as any)

      const viewCallStub = sandbox
        .stub(ProxyContractHelper, '_fallBackImplementationViaViewCall')
        .resolves(getAddress(servedImplementation))
      const proxyImpStub = sandbox
        .stub(ProxyContractHelper, 'getImplementationAddress')
        .resolves(getAddress(beaconOwnLogic))

      const result = await ProxyContractHelper._getBeaconProxyImplementationAddress(
        proxyAddress,
        NetworksEnum.ethereumMainnet,
      )

      expect(viewCallStub.calledOnceWith(getAddress(beaconAddress))).to.be.true
      // the beacon answered, so we must not fall back to resolving the beacon as a proxy
      expect(proxyImpStub.called).to.be.false
      expect(result).to.equal(getAddress(servedImplementation))
    })

    it('should return null when a slot beacon does not answer implementation()', async () => {
      const proxyAddress = '0xProxyAddress'
      const beaconAddress = '0x1234567890abcdef1234567890abcdef12345678'

      // Mock storage to return the beacon address
      const beaconStorageValue = '0x000000000000000000000000' + beaconAddress.slice(2)
      const providerStub = {
        getStorageAt: sandbox.stub().resolves(beaconStorageValue),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_network => providerStub as any)

      sandbox.stub(ProxyContractHelper, '_fallBackImplementationViaViewCall').resolves(null)
      const proxyImpStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress')
      sandbox.stub(Logger, 'warn')

      const result = await ProxyContractHelper._getBeaconProxyImplementationAddress(
        proxyAddress,
        NetworksEnum.ethereumMainnet,
      )

      expect(providerStub.getStorageAt.calledOnce).to.be.true
      expect(providerStub.getStorageAt.firstCall.args[0]).to.equal(proxyAddress)
      // resolving the beacon as a proxy would answer a different question, so it must not happen
      expect(proxyImpStub.called).to.be.false
      expect(result).to.be.null
    })

    it('should return null when an embedded beacon candidate does not answer implementation()', async () => {
      const providerStub = {
        getStorageAt: sandbox.stub().resolves('0x' + '0'.repeat(64)),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_network => providerStub as any)
      sandbox
        .stub(ContractHelper, 'getBytecode')
        .resolves('0x635c60da1b60e01b81527f000000000000000000000000' + 'ab'.repeat(20) + '6001600160a01b03165afa')

      // the candidate is not a beacon - it must not fall through to resolving it as a proxy
      sandbox.stub(ProxyContractHelper, '_fallBackImplementationViaViewCall').resolves(null)
      const proxyImpStub = sandbox.stub(ProxyContractHelper, 'getImplementationAddress')
      sandbox.stub(Logger, 'warn')

      const result = await ProxyContractHelper._getBeaconProxyImplementationAddress(
        '0xProxyAddress',
        NetworksEnum.ethereumMainnet,
      )

      expect(result).to.be.null
      expect(proxyImpStub.called).to.be.false
    })

    it('should resolve an embedded beacon through a beacon-only implementation() call', async () => {
      const providerStub = {
        getStorageAt: sandbox.stub().resolves('0x' + '0'.repeat(64)),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_network => providerStub as any)
      sandbox
        .stub(ContractHelper, 'getBytecode')
        .resolves('0x635c60da1b60e01b81527f000000000000000000000000' + 'ab'.repeat(20) + '6001600160a01b03165afa')

      const implementation = getAddress('0x' + 'cd'.repeat(20))
      const viewCallStub = sandbox
        .stub(ProxyContractHelper, '_fallBackImplementationViaViewCall')
        .resolves(implementation)

      const result = await ProxyContractHelper._getBeaconProxyImplementationAddress(
        '0xProxyAddress',
        NetworksEnum.ethereumMainnet,
      )

      // a beacon is defined by implementation() alone - getImplementation() must not be tried
      expect(viewCallStub.calledOnce).to.be.true
      expect(viewCallStub.firstCall.args[0]).to.equal(getAddress('0x' + 'ab'.repeat(20)))
      expect(viewCallStub.firstCall.args[2]).to.deep.equal(['implementation'])
      expect(result).to.equal(implementation)
    })

    it('should return null when no beacon address is found', async () => {
      const zeroStorageValue = '0x0000000000000000000000000000000000000000000000000000000000000000'
      const providerStub = {
        getStorageAt: sandbox.stub().resolves(zeroStorageValue),
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_network => providerStub as any)

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
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_network => providerStub as any)
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
    const IMPL_ONE = '0x0000000000000000000000000000000000000001'
    const IMPL_TWO = '0x0000000000000000000000000000000000000002'

    // the helper validates candidates with ethers, so only Contract is swapped out
    const mockHelper = (contractStub: any) =>
      proxyquire.noCallThru()('@helpers/proxyContract', {
        ethers: {
          ...ethers,
          Contract: function () {
            return contractStub
          },
        },
      }).default

    it('should return the fallback implementation via getImplementation', async () => {
      sandbox.stub(ContractHelper, 'getBytecode').resolves('0x6080604052')

      const result = await mockHelper({
        getImplementation: sandbox.stub().resolves(IMPL_ONE),
        implementation: sandbox.stub().rejects(new Error('Method not found')),
      })._fallBackImplementationViaViewCall('0xProxyAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.eq(getAddress(IMPL_ONE))
    })

    it('should return the fallback implementation via implementation', async () => {
      sandbox.stub(ContractHelper, 'getBytecode').resolves('0x6080604052')

      const result = await mockHelper({
        getImplementation: sandbox.stub().rejects(new Error('Method not found')),
        implementation: sandbox.stub().resolves(IMPL_TWO),
      })._fallBackImplementationViaViewCall('0xProxyAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.eq(getAddress(IMPL_TWO))
    })

    it('should return null when both methods fail', async () => {
      sandbox.stub(ContractHelper, 'getBytecode').resolves('0x6080604052')

      const result = await mockHelper({
        getImplementation: sandbox.stub().rejects(new Error('Method not found')),
        implementation: sandbox.stub().rejects(new Error('Method not found')),
      })._fallBackImplementationViaViewCall('0xProxyAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.be.null
    })

    it('should keep asking when getImplementation answers with the zero address', async () => {
      sandbox.stub(ContractHelper, 'getBytecode').resolves('0x6080604052')
      const implementationStub = sandbox.stub().resolves(IMPL_TWO)

      const result = await mockHelper({
        getImplementation: sandbox.stub().resolves(ZeroAddress),
        implementation: implementationStub,
      })._fallBackImplementationViaViewCall('0xProxyAddress', NetworksEnum.ethereumMainnet)

      // a zero answer must not stop the second signature from being tried
      expect(implementationStub.calledOnce).to.be.true
      expect(result).to.eq(getAddress(IMPL_TWO))
    })

    it('should reject a candidate that is not an address', async () => {
      sandbox.stub(ContractHelper, 'getBytecode').resolves('0x6080604052')

      const result = await mockHelper({
        getImplementation: sandbox.stub().resolves('not-an-address'),
        implementation: sandbox.stub().resolves(42),
      })._fallBackImplementationViaViewCall('0xProxyAddress', NetworksEnum.ethereumMainnet)

      expect(result).to.be.null
    })

    it('should reject a candidate with no deployed code', async () => {
      sandbox.stub(ContractHelper, 'getBytecode').resolves(null)

      const result = await mockHelper({
        getImplementation: sandbox.stub().resolves(IMPL_ONE),
        implementation: sandbox.stub().resolves(IMPL_TWO),
      })._fallBackImplementationViaViewCall('0xProxyAddress', NetworksEnum.ethereumMainnet)

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

      const providerStub = {
        getStorage: getStorageStub,
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_ => providerStub as any)
      sandbox.stub(ContractHelper, 'getBytecode').resolves(byteCode)

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.ethereumMainnet)
      expect(result).to.equal(getAddress(`0x${implementationAddress}`))
    })

    it('should return the implementation address from fallback view call', async () => {
      const getStorageStub = sandbox.stub().resolves('0x')
      const minimalProxyStub = sandbox.stub(ProxyContractHelper, '_getImplementationForMinimalProxy').returns(null)
      const fallbackStub = sandbox.stub(ProxyContractHelper, '_fallBackImplementationViaViewCall').resolves('0x123456')

      const providerStub = {
        getStorage: getStorageStub,
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_ => providerStub as any)
      sandbox.stub(ContractHelper, 'getBytecode').resolves('someBytecode')

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.ethereumMainnet)
      expect(minimalProxyStub.calledOnce).to.be.true
      expect(fallbackStub.calledOnce).to.be.true
      expect(result).to.equal('0x123456')
    })

    it('should return null when no implementation address is found', async () => {
      const getStorageStub = sandbox.stub().resolves('0x')
      sandbox.stub(ProxyContractHelper, '_getImplementationForMinimalProxy').returns(null)
      sandbox.stub(ProxyContractHelper, '_fallBackImplementationViaViewCall').resolves(null)

      const providerStub = {
        getStorage: getStorageStub,
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_ => providerStub as any)
      sandbox.stub(ContractHelper, 'getBytecode').resolves('someBytecode')

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
      const minimalProxyStub = sandbox.stub(ProxyContractHelper, '_getImplementationForMinimalProxy').returns(null)
      const fallbackStub = sandbox.stub(ProxyContractHelper, '_fallBackImplementationViaViewCall').resolves(null)
      const beaconProxyStub = sandbox
        .stub(ProxyContractHelper, '_getBeaconProxyImplementationAddress')
        .resolves(getAddress(beaconImplementationAddress))

      const providerStub = {
        getStorage: getStorageStub,
        getStorageAt: getStorageStub,
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_ => providerStub as any)
      sandbox.stub(ProxyContractHelper, 'getAddressFromStorage').resolves(null)
      sandbox.stub(ContractHelper, 'getBytecode').resolves('someBytecode')

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.ethereumMainnet)

      expect(minimalProxyStub.calledOnce).to.be.true
      expect(beaconProxyStub.calledOnce).to.be.true
      expect(beaconProxyStub.firstCall.args[0]).to.equal('0xProxyAddress')
      expect(beaconProxyStub.firstCall.args[1]).to.equal(NetworksEnum.ethereumMainnet)
      // the beacon slot is authoritative, so a successful beacon resolution ends it
      expect(fallbackStub.notCalled).to.be.true
      expect(result).to.equal(getAddress(beaconImplementationAddress))
    })

    it('should return null when no implementation address is found including beacon proxy', async () => {
      const getStorageStub = sandbox.stub().resolves('0x')
      const minimalProxyStub = sandbox.stub(ProxyContractHelper, '_getImplementationForMinimalProxy').returns(null)
      const fallbackStub = sandbox.stub(ProxyContractHelper, '_fallBackImplementationViaViewCall').resolves(null)
      const beaconProxyStub = sandbox.stub(ProxyContractHelper, '_getBeaconProxyImplementationAddress').resolves(null)

      const providerStub = {
        getStorage: getStorageStub,
        getStorageAt: getStorageStub,
      }
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').callsFake(_ => providerStub as any)
      sandbox.stub(ProxyContractHelper, 'getAddressFromStorage').resolves(null)
      sandbox.stub(ContractHelper, 'getBytecode').resolves('someBytecode')

      const result = await ProxyContractHelper.getImplementationAddress('0xProxyAddress', NetworksEnum.ethereumMainnet)

      expect(minimalProxyStub.calledOnce).to.be.true
      expect(fallbackStub.calledOnce).to.be.true
      expect(beaconProxyStub.calledOnce).to.be.true
      expect(result).to.be.null
    })
  })
})
