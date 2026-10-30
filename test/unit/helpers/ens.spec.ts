import EnsHelper from '@helpers/ens'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { expect } from 'chai'
import { keccak256, toUtf8Bytes, ZeroAddress } from 'ethers'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Helpers: ENS', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  describe('getEnsWithUniversalResolver', () => {
    const address = '0x42E6DD8D517abB3E4f6611Ca53a8D1243C183fB0'
    let lookupAddress: sinon.SinonStub

    beforeEach(() => {
      lookupAddress = sandbox.stub()
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ lookupAddress } as any)
      sandbox.stub(BottleneckModule, 'getAlchemyENSLimiter').returns({
        schedule: (fn: () => Promise<string | null>) => fn(),
      } as any)
      sandbox.stub(logger, 'info')
    })

    it('returns the name for the member address', async () => {
      lookupAddress.resolves('nick.eth')

      const result = await EnsHelper.getEnsWithUniversalResolver(address)

      expect(result).to.equal('nick.eth')
      expect(lookupAddress.calledOnceWithExactly(address)).to.be.true
    })

    it('returns null when the lookup has no name', async () => {
      lookupAddress.resolves(null)

      const result = await EnsHelper.getEnsWithUniversalResolver(address)

      expect(result).to.be.null
      expect(lookupAddress.calledOnceWithExactly(address)).to.be.true
    })

    it('returns null when the reverse name points to another address', async () => {
      const error = Object.assign(new Error('mismatch'), { reason: 'ReverseAddressMismatch(string,bytes)' })
      lookupAddress.rejects(error)

      const result = await EnsHelper.getEnsWithUniversalResolver(address)

      expect(result).to.be.null
      expect(lookupAddress.calledOnceWithExactly(address)).to.be.true
      expect((logger.info as sinon.SinonStub).calledOnceWith('ENS forward resolution does not match address')).to.be
        .true
    })

    it('throws when the lookup fails', async () => {
      const error = new Error('RPC error')
      lookupAddress.rejects(error)

      try {
        await EnsHelper.getEnsWithUniversalResolver(address)
        expect.fail('Expected lookup to throw')
      } catch (caught) {
        expect(caught).to.equal(error)
      }
      expect(lookupAddress.calledOnceWithExactly(address)).to.be.true
    })
  })

  describe('getDaoEns', () => {
    it('should return null when subdomain is null', async () => {
      const result = await EnsHelper.getDaoEns({ daoAddress: '0x123', subdomain: null })
      expect(result).to.be.null
    })

    it('should return null when getDaoEthSubdomain returns null', async () => {
      sandbox.stub(EnsHelper, 'getDaoEthSubdomain').resolves(null)

      const result = await EnsHelper.getDaoEns({ daoAddress: '0x123', subdomain: 'test' })
      expect(result).to.be.null
    })

    it('should return null when address is not owner of subdomain', async () => {
      sandbox.stub(EnsHelper, 'getDaoEthSubdomain').resolves('test.dao.eth')
      sandbox.stub(EnsHelper, 'isAddressOwnerOfSubdomain').resolves(false)

      const result = await EnsHelper.getDaoEns({ daoAddress: '0x123', subdomain: 'test' })
      expect(result).to.be.null
    })

    it('should return subdomain when address is owner of subdomain', async () => {
      sandbox.stub(EnsHelper, 'getDaoEthSubdomain').resolves('test.dao.eth')
      sandbox.stub(EnsHelper, 'isAddressOwnerOfSubdomain').resolves(true)

      const result = await EnsHelper.getDaoEns({ daoAddress: '0x123', subdomain: 'test' })
      expect(result).to.equal('test.dao.eth')
    })
  })

  describe('_namehash', () => {
    it('should correctly hash domain names', () => {
      const emptyHash = '0x0000000000000000000000000000000000000000000000000000000000000000'
      expect(EnsHelper._namehash('')).to.equal(emptyHash)

      const ethHash = EnsHelper._namehash('eth')
      const daoEthHash = EnsHelper._namehash('dao.eth')
      const testDaoEthHash = EnsHelper._namehash('test.dao.eth')

      // These assertions verify that each level of the hierarchy produces a different hash
      expect(ethHash).to.not.equal(emptyHash)
      expect(daoEthHash).to.not.equal(ethHash)
      expect(testDaoEthHash).to.not.equal(daoEthHash)
    })
  })

  describe('getDaoEthSubdomain', () => {
    let mockedEnsHelper: any
    let stubOwner: any

    beforeEach(() => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      stubOwner = sandbox.stub()

      const { default: MockedEnsHelper } = proxyquire.noCallThru()('@helpers/ens', {
        ethers: {
          Contract: function () {
            return { owner: stubOwner }
          },
          toUtf8Bytes: (str: string) => toUtf8Bytes(str),
          keccak256: (data: any) => keccak256(data),
          ZeroAddress,
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
        '@logger': logger,
      })

      mockedEnsHelper = MockedEnsHelper
    })

    it('should return null when subdomain owner is zero address', async () => {
      stubOwner.resolves(ZeroAddress)
      const result = await mockedEnsHelper.getDaoEthSubdomain('test')
      expect(result).to.be.null
      expect(stubOwner.calledWith(EnsHelper._namehash('test.dao.eth'))).to.be.true
    })

    it('should return subdomain when owner is not zero address', async () => {
      stubOwner.resolves('0x1234567890abcdef1234567890abcdef12345678')

      const result = await mockedEnsHelper.getDaoEthSubdomain('test')
      expect(result).to.equal('test.dao.eth')
      expect(stubOwner.calledWith(EnsHelper._namehash('test.dao.eth'))).to.be.true
    })

    it('should throw if the owner call is rejected', async () => {
      stubOwner.rejects(new Error('error'))

      const loggerErrorStub = sandbox.stub(logger, 'error')

      await mockedEnsHelper.getDaoEthSubdomain('test')
      expect(loggerErrorStub.calledOnce).to.be.true
    })
  })

  describe('isAddressOwnerOfSubdomain', () => {
    let mockedEnsHelper: any
    let stubOwner: any
    let stubResolver: any
    let stubAddr: any
    let registryContract: any
    let resolverContract: any

    beforeEach(() => {
      const stubConfigState = {
        getConfigItem: sandbox.stub().returns({}),
      }

      stubOwner = sandbox.stub()
      stubResolver = sandbox.stub()
      stubAddr = sandbox.stub()

      registryContract = { owner: stubOwner, resolver: stubResolver }
      resolverContract = { addr: stubAddr }

      const { default: MockedEnsHelper } = proxyquire.noCallThru()('@helpers/ens', {
        ethers: {
          Contract: function (address: string) {
            return address === EnsHelper.ENS_REGISTRY ? registryContract : resolverContract
          },
          toUtf8Bytes: (str: string) => toUtf8Bytes(str),
          keccak256: (data: any) => keccak256(data),
          ZeroAddress,
        },
        '@state/configState': {
          ConfigState: { getInstance: () => stubConfigState },
        },
        '@config': { ENS_DOMAIN: 'dao.eth' },
        '@logger': logger,
      })

      mockedEnsHelper = MockedEnsHelper
      sandbox.stub(mockedEnsHelper, '_namehash').returns('0xmockednamehash')
    })

    it('should return true when address is the direct owner of the subdomain', async () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      stubOwner.resolves(address)

      const result = await mockedEnsHelper.isAddressOwnerOfSubdomain(address, 'test')

      expect(result).to.be.true
      expect(stubOwner.calledWith('0xmockednamehash')).to.be.true
      expect(stubResolver.called).to.be.false
    })

    it('should return true when address is the resolved address but not the owner', async () => {
      const ownerAddress = '0x0000000000000000000000000000000000000001'
      const userAddress = '0x1234567890abcdef1234567890abcdef12345678'
      const resolverAddress = '0x0000000000000000000000000000000000000002'

      stubOwner.resolves(ownerAddress)
      stubResolver.resolves(resolverAddress)
      stubAddr.resolves(userAddress)

      const result = await mockedEnsHelper.isAddressOwnerOfSubdomain(userAddress, 'test')

      expect(result).to.be.true
      expect(stubOwner.calledWith('0xmockednamehash')).to.be.true
      expect(stubResolver.calledWith('0xmockednamehash')).to.be.true
      expect(stubAddr.calledWith('0xmockednamehash')).to.be.true
    })

    it('should return false when address is neither the owner nor the resolved address', async () => {
      const ownerAddress = '0x0000000000000000000000000000000000000001'
      const userAddress = '0x1234567890abcdef1234567890abcdef12345678'
      const resolvedAddress = '0x0000000000000000000000000000000000000003'
      const resolverAddress = '0x0000000000000000000000000000000000000002'

      stubOwner.resolves(ownerAddress)
      stubResolver.resolves(resolverAddress)
      stubAddr.resolves(resolvedAddress)

      const result = await mockedEnsHelper.isAddressOwnerOfSubdomain(userAddress, 'test')

      expect(result).to.be.false
      expect(stubOwner.calledWith('0xmockednamehash')).to.be.true
      expect(stubResolver.calledWith('0xmockednamehash')).to.be.true
      expect(stubAddr.calledWith('0xmockednamehash')).to.be.true
    })

    it('should return false when resolver is zero address', async () => {
      const ownerAddress = '0x0000000000000000000000000000000000000001'
      const userAddress = '0x1234567890abcdef1234567890abcdef12345678'

      stubOwner.resolves(ownerAddress)
      stubResolver.resolves(ZeroAddress)

      const result = await mockedEnsHelper.isAddressOwnerOfSubdomain(userAddress, 'test')

      expect(result).to.be.false
      expect(stubOwner.calledWith('0xmockednamehash')).to.be.true
      expect(stubResolver.calledWith('0xmockednamehash')).to.be.true
      expect(stubAddr.called).to.be.false
    })

    it('should handle errors when checking resolver address', async () => {
      const ownerAddress = '0x0000000000000000000000000000000000000001'
      const userAddress = '0x1234567890abcdef1234567890abcdef12345678'
      const resolverAddress = '0x0000000000000000000000000000000000000002'

      stubOwner.resolves(ownerAddress)
      stubResolver.resolves(resolverAddress)
      stubAddr.rejects(new Error('resolver error'))

      const loggerSillyStub = sandbox.stub(logger, 'silly')

      const result = await mockedEnsHelper.isAddressOwnerOfSubdomain(userAddress, 'test')

      expect(result).to.be.false
      expect(loggerSillyStub.calledOnce).to.be.true
    })

    it('should handle errors when checking owner', async () => {
      const userAddress = '0x1234567890abcdef1234567890abcdef12345678'

      stubOwner.rejects(new Error('owner error'))

      const loggerErrorStub = sandbox.stub(logger, 'error')

      const result = await mockedEnsHelper.isAddressOwnerOfSubdomain(userAddress, 'test')

      expect(result).to.be.false
      expect(loggerErrorStub.calledOnce).to.be.true
    })
  })
})
