import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { keccak256, toUtf8Bytes } from 'ethers'
import EnsHelper from '@helpers/ens'
import proxyquire from 'proxyquire'

describe('Helpers: ENS', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  it('should getEnsWithUniversalResolver', async () => {
    const ensName = 'test.eth'
    const stubConfigState = {
      getConfigItem: sandbox.stub().returns({}),
    }
    const stubReverse = sandbox.stub().resolves([ensName])
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
    expect(res).to.eq(ensName)
  })

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
})
