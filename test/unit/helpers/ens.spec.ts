import EnsHelper from '@helpers/ens'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { expect } from 'chai'
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
