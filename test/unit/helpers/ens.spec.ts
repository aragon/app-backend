import EnsHelper from '@helpers/ens'
import logger from '@logger'
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

  // Note: getEnsWithUniversalResolver is tested via E2E integration tests
  // (test/unit-dep/services/ensValidator.spec.ts) since it requires complex provider mocking

  it('should fail', async () => {
    const ensName = 'test.eth'
    const stubConfigState = {
      getConfigItem: sandbox.stub().returns({}),
    }
    const stubReverse = sandbox.stub().rejects(new Error('error'))
    const { default: MockedEnsHelper } = proxyquire.noCallThru()('@helpers/ens', {
      ethers: {
        Contract: function () {
          return { reverse: stubReverse }
        },
        hexlify: (str: string) => str,
        toUtf8Bytes: (str: string) => toUtf8Bytes(str),
        keccak256: (data: any) => keccak256(data),
      },
      '@state/configState': {
        ConfigState: { getInstance: () => stubConfigState },
      },
    })

    const res = await MockedEnsHelper.getEnsWithUniversalResolver('0x42E6DD8D517abB3E4f6611Ca53a8D1243C183fB0')
    expect(res).to.eq(null)
  })

  it('should _addressToPacket correctly convert address to packet', () => {
    const address = '0x42E6DD8D517abB3E4f6611Ca53a8D1243C183fB0'
    const packet = EnsHelper._addressToPacket(address)
    const expectedPacket =
      '40,52,50,101,54,100,100,56,100,53,49,55,97,98,98,51,101,52,102,54,54,49,49,99,97,53,51,97,56,100,49,50,52,51,99,49,56,51,102,98,48,4,97,100,100,114,7,114,101,118,101,114,115,101,0'
    expect(packet.toString()).to.deep.equal(expectedPacket)
  })

  describe('_addressToPacket', () => {
    it('should return a single element Uint8Array when the address is empty', () => {
      const emptyAddress = '0x'
      const packet = EnsHelper._addressToPacket(emptyAddress)

      expect(packet).to.be.instanceOf(Uint8Array)
      expect(packet.length).to.equal(1)
    })

    it('should call hexlify(keccak256(encoded)) when encoded length exceeds 255', () => {
      const longLabel = 'a'.repeat(256) // A single label > 255 chars
      const longAddress = `0x${longLabel}`

      const keccakStub = sandbox.stub().returns('mockedKeccak')
      const hexlifyStub = sandbox.stub().returns('mockedHex')

      const { default: MockedEnsHelper } = proxyquire.noCallThru()('@helpers/ens', {
        ethers: {
          keccak256: keccakStub,
          hexlify: hexlifyStub,
        },
      })

      sandbox.stub(MockedEnsHelper, '_stringToBytes').callsFake(() => new Uint8Array(256))

      MockedEnsHelper._addressToPacket(longAddress)

      expect(keccakStub.calledThrice).to.be.true
    })

    it('should return a correctly sliced array when bytes length does not match offset + 1', () => {
      const originalStringToBytes = EnsHelper._stringToBytes
      EnsHelper._stringToBytes = (str: string) => new Uint8Array(str.length).fill(1)

      const address = '0x123456789abcdef' // Using a lengthy address
      const packet = EnsHelper._addressToPacket(address)

      EnsHelper._stringToBytes = originalStringToBytes

      expect(packet.length).to.be.greaterThan(0)
      expect(packet.length).to.be.lessThan(50)
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

  describe('_stringToBytes', () => {
    it('should correctly convert string to bytes', () => {
      const testString = 'test'
      const result = EnsHelper._stringToBytes(testString)

      expect(result).to.be.instanceOf(Uint8Array)
      expect(result.length).to.equal(4) // 'test' is 4 bytes

      // Verify the bytes match the ASCII values of 'test'
      expect(result[0]).to.equal(116) // ASCII 't'
      expect(result[1]).to.equal(101) // ASCII 'e'
      expect(result[2]).to.equal(115) // ASCII 's'
      expect(result[3]).to.equal(116) // ASCII 't'
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
          hexlify: (str: string) => str,
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

  // Note: isEnsExpired and resolveEnsToAddress are tested via E2E integration tests
  // (test/unit-dep/services/ensValidator.spec.ts) since proxyquire cannot properly mock @modules/provider

  describe('isEnsExpired', () => {
    it('should return false when label is empty', async () => {
      // This test works because it returns early before calling the provider
      const result = await EnsHelper.isEnsExpired('.eth' as any)
      expect(result).to.be.false
    })
  })

  describe('isEnsValidForAddress', () => {
    it('should return true when ENS is valid and forward resolution matches', async () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678'

      sandbox.stub(EnsHelper, 'isEnsExpired').resolves(false)
      sandbox.stub(EnsHelper, 'resolveEnsToAddress').resolves(address)

      const result = await EnsHelper.isEnsValidForAddress('valid.eth', address)
      expect(result).to.be.true
    })

    it('should return false when ENS is expired', async () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678'

      sandbox.stub(EnsHelper, 'isEnsExpired').resolves(true)
      sandbox.stub(EnsHelper, 'resolveEnsToAddress').resolves(address)
      sandbox.stub(logger, 'info')

      const result = await EnsHelper.isEnsValidForAddress('expired.eth', address)
      expect(result).to.be.false
    })

    it('should return false when forward resolution does not match', async () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const differentAddress = '0xabcdef1234567890abcdef1234567890abcdef12'

      sandbox.stub(EnsHelper, 'isEnsExpired').resolves(false)
      sandbox.stub(EnsHelper, 'resolveEnsToAddress').resolves(differentAddress)
      sandbox.stub(logger, 'info')

      const result = await EnsHelper.isEnsValidForAddress('changed.eth', address)
      expect(result).to.be.false
    })

    it('should skip expiration check for dao.eth subdomains', async () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678'
      const isExpiredStub = sandbox.stub(EnsHelper, 'isEnsExpired').resolves(true)
      sandbox.stub(EnsHelper, 'resolveEnsToAddress').resolves(address)

      const result = await EnsHelper.isEnsValidForAddress('mydao.dao.eth', address)

      expect(result).to.be.true
      expect(isExpiredStub.called).to.be.false // Should not check expiration for dao.eth
    })

    it('should return false when forward resolution returns null', async () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678'

      sandbox.stub(EnsHelper, 'isEnsExpired').resolves(false)
      sandbox.stub(EnsHelper, 'resolveEnsToAddress').resolves(null)
      sandbox.stub(logger, 'info')

      const result = await EnsHelper.isEnsValidForAddress('noresolution.eth', address)
      expect(result).to.be.false
    })

    it('should return false on error', async () => {
      const address = '0x1234567890abcdef1234567890abcdef12345678'

      sandbox.stub(EnsHelper, 'isEnsExpired').rejects(new Error('validation error'))
      sandbox.stub(logger, 'silly')

      const result = await EnsHelper.isEnsValidForAddress('error.eth', address)
      expect(result).to.be.false
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
          hexlify: (str: string) => str,
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
