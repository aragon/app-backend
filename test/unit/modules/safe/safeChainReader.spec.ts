import * as ethers from 'ethers'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { SafeReadError } from '@modules/safe/safeError'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const ADDRESS = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'
const OWNER = '0x1111111111111111111111111111111111111111'
const NETWORK = NetworksEnum.ethereumMainnet
const ZERO_STORAGE = `0x${'0'.repeat(64)}`
const OWNER_STORAGE = `0x${'0'.repeat(24)}${OWNER.slice(2)}`

describe('Module: safe/safeChainReader', () => {
  let sandbox: SinonSandbox
  let provider: {
    getCode: sinon.SinonStub
    getStorage: sinon.SinonStub
  }
  let contract: {
    getOwners: sinon.SinonStub
    getThreshold: sinon.SinonStub
    nonce: sinon.SinonStub
    VERSION: sinon.SinonStub
    getModulesPaginated: sinon.SinonStub
  }

  const reader = () =>
    proxyquire.noCallThru()('@modules/safe/safeChainReader', {
      '@helpers/retryRequest': {
        retryRequest: async <T>(fn: () => Promise<T>) => fn(),
      },
      ethers: {
        ...ethers,
        Contract: function () {
          return contract
        },
      },
    }).default

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    provider = {
      getCode: sandbox.stub().resolves('0x6000'),
      getStorage: sandbox.stub().resolves(ZERO_STORAGE),
    }
    contract = {
      getOwners: sandbox.stub().resolves([OWNER]),
      getThreshold: sandbox.stub().resolves(1n),
      nonce: sandbox.stub().resolves(7n),
      VERSION: sandbox.stub().resolves('1.4.1'),
      getModulesPaginated: sandbox.stub().resolves([[OWNER], ethers.ZeroAddress]),
    }
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(provider as never)
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: () => unknown) => fn() } as never)
    sandbox.stub(logger, 'warn')
  })

  afterEach(() => sandbox.restore())

  it('reads and normalizes the live chain nonce', async () => {
    const nonce = await reader().readNonce(NETWORK, ADDRESS)

    expect(nonce).to.equal('7')
    expect(provider.getCode.calledOnceWith(ADDRESS)).to.equal(true)
  })

  it('returns not-found when the address has no deployed code', async () => {
    provider.getCode.resolves('0x')

    try {
      await reader().readNonce(NETWORK, ADDRESS)
      expect.fail('expected not-found')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal('not-found')
      expect((error as SafeReadError).status).to.equal(404)
    }
  })

  it('maps nonce provider failures to connection-error', async () => {
    provider.getCode.rejects(new Error('RPC down'))

    try {
      await reader().readNonce(NETWORK, ADDRESS)
      expect.fail('expected connection-error')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal('connection-error')
      expect((error as SafeReadError).status).to.equal(502)
    }
  })

  it('reads owners, threshold, version, modules and a configured guard', async () => {
    provider.getStorage.resolves(OWNER_STORAGE)

    const info = await reader().readInfo(NETWORK, ADDRESS)

    expect(info).to.deep.equal({
      address: ADDRESS,
      owners: [OWNER],
      threshold: 1,
      version: '1.4.1',
      nonce: '7',
      modules: [OWNER],
      guard: OWNER,
    })
    expect(contract.getOwners.calledOnce).to.equal(true)
  })

  it('returns a null guard when the guard storage slot is zero', async () => {
    const info = await reader().readInfo(NETWORK, ADDRESS)

    expect(info.guard).to.equal(null)
  })

  it('returns not-found for info when no contract is deployed', async () => {
    provider.getCode.resolves('0x')

    try {
      await reader().readInfo(NETWORK, ADDRESS)
      expect.fail('expected not-found')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal('not-found')
    }
  })

  it('rejects an invalid chain threshold', async () => {
    contract.getThreshold.resolves(2n)

    try {
      await reader().readInfo(NETWORK, ADDRESS)
      expect.fail('expected invalid-response')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal('invalid-response')
      expect((error as SafeReadError).status).to.equal(502)
    }
  })

  it('rejects an invalid guard storage response', async () => {
    provider.getStorage.resolves(undefined)

    try {
      await reader().readInfo(NETWORK, ADDRESS)
      expect.fail('expected invalid-response')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal('invalid-response')
    }
  })

  it('maps info provider failures to connection-error', async () => {
    provider.getCode.rejects(new Error('RPC down'))

    try {
      await reader().readInfo(NETWORK, ADDRESS)
      expect.fail('expected connection-error')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal('connection-error')
    }
  })
})
