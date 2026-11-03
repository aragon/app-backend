import EnsHelper from '@helpers/ens'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { expect } from 'chai'
import { Interface } from 'ethers'
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
      const errors = new Interface(['error ReverseAddressMismatch(string,bytes)'])
      const error = Object.assign(new Error('mismatch'), {
        code: 'CALL_EXCEPTION',
        data: errors.encodeErrorResult('ReverseAddressMismatch', ['nick.eth', address]),
        reason: null,
      })
      lookupAddress.rejects(error)

      const result = await EnsHelper.getEnsWithUniversalResolver(address)

      expect(result).to.be.null
      expect(lookupAddress.calledOnceWithExactly(address)).to.be.true
      expect((logger.info as sinon.SinonStub).calledOnceWith('ENS name unusable, clearing')).to.be.true
    })

    it('returns null when the resolver is not a contract', async () => {
      const errors = new Interface(['error ResolverNotContract(bytes,address)'])
      const error = Object.assign(new Error('resolver is not a contract'), {
        code: 'CALL_EXCEPTION',
        data: errors.encodeErrorResult('ResolverNotContract', ['0x1234', address]),
        reason: null,
      })
      lookupAddress.rejects(error)

      const result = await EnsHelper.getEnsWithUniversalResolver(address)

      expect(result).to.be.null
      expect(lookupAddress.calledOnceWithExactly(address)).to.be.true
    })

    it('returns null when the resolver does not support the profile', async () => {
      const errors = new Interface(['error UnsupportedResolverProfile(bytes4)'])
      const error = Object.assign(new Error('unsupported resolver profile'), {
        code: 'CALL_EXCEPTION',
        data: errors.encodeErrorResult('UnsupportedResolverProfile', ['0x12345678']),
        reason: null,
      })
      lookupAddress.rejects(error)

      const result = await EnsHelper.getEnsWithUniversalResolver(address)

      expect(result).to.be.null
      expect(lookupAddress.calledOnceWithExactly(address)).to.be.true
    })

    it('returns null when the resolver reverts', async () => {
      const errors = new Interface(['error ResolverError(bytes)'])
      const error = Object.assign(new Error('resolver error'), {
        code: 'CALL_EXCEPTION',
        data: errors.encodeErrorResult('ResolverError', ['0x1234']),
        reason: null,
      })
      lookupAddress.rejects(error)

      const result = await EnsHelper.getEnsWithUniversalResolver(address)

      expect(result).to.be.null
      expect(lookupAddress.calledOnceWithExactly(address)).to.be.true
    })

    it('throws when the gateway fails', async () => {
      const errors = new Interface(['error HttpError(uint16,string)'])
      const error = Object.assign(new Error('gateway error'), {
        code: 'CALL_EXCEPTION',
        data: errors.encodeErrorResult('HttpError', [503, 'Service Unavailable']),
        reason: 'HttpError(uint16,string)',
      })
      lookupAddress.rejects(error)

      await expect(EnsHelper.getEnsWithUniversalResolver(address)).to.be.rejectedWith(error)
      expect(lookupAddress.calledOnceWithExactly(address)).to.be.true
    })

    it('throws when the revert is unknown', async () => {
      const error = Object.assign(new Error('unknown error'), {
        code: 'CALL_EXCEPTION',
        data: '0x12345678',
        reason: null,
      })
      lookupAddress.rejects(error)

      await expect(EnsHelper.getEnsWithUniversalResolver(address)).to.be.rejectedWith(error)
      expect(lookupAddress.calledOnceWithExactly(address)).to.be.true
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
    const daoAddress = '0xa5D15946645fB52707E63Be59c9Ea1c4125859D8'
    let resolveName: sinon.SinonStub
    let getProvider: sinon.SinonStub

    beforeEach(() => {
      resolveName = sandbox.stub()
      getProvider = sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ resolveName } as any)
      sandbox.stub(BottleneckModule, 'getAlchemyENSLimiter').returns({
        schedule: (fn: () => Promise<string | null>) => fn(),
      } as any)
    })

    it('returns the name when it resolves to the DAO', async () => {
      resolveName.resolves(daoAddress.toLowerCase())

      const result = await EnsHelper.getDaoEns({ daoAddress, subdomain: 'airalab' })

      expect(result).to.equal('airalab.dao.eth')
      expect(resolveName.calledOnceWithExactly('airalab.dao.eth')).to.be.true
    })

    it('returns null when the name resolves to another address', async () => {
      resolveName.resolves('0x0000000000000000000000000000000000000001')

      const result = await EnsHelper.getDaoEns({ daoAddress, subdomain: 'airalab' })

      expect(result).to.be.null
    })

    it('returns null when the name has no address', async () => {
      resolveName.resolves(null)

      const result = await EnsHelper.getDaoEns({ daoAddress, subdomain: 'airalab' })

      expect(result).to.be.null
    })

    it('rejects when resolution fails', async () => {
      const error = new Error('RPC error')
      resolveName.rejects(error)

      await expect(EnsHelper.getDaoEns({ daoAddress, subdomain: 'airalab' })).to.be.rejectedWith('RPC error')
    })

    it('uses the same full name with or without the suffix', async () => {
      resolveName.resolves(daoAddress)

      const withoutSuffix = await EnsHelper.getDaoEns({ daoAddress, subdomain: 'airalab' })
      const withSuffix = await EnsHelper.getDaoEns({ daoAddress, subdomain: 'airalab.dao.eth' })

      expect(withoutSuffix).to.equal('airalab.dao.eth')
      expect(withSuffix).to.equal(withoutSuffix)
      expect(resolveName.calledTwice).to.be.true
      expect(resolveName.alwaysCalledWithExactly('airalab.dao.eth')).to.be.true
    })

    it('returns null without an RPC call when the subdomain is null', async () => {
      const result = await EnsHelper.getDaoEns({ daoAddress, subdomain: null })

      expect(result).to.be.null
      expect(getProvider.notCalled).to.be.true
      expect(resolveName.notCalled).to.be.true
    })
  })
})
