import { Models } from '@dbModels'
import BottleneckModule from '@modules/bottleneck'
import { resolveExplicitDaoRef, searchDaosByName } from '@services/aragon-telegram/helpers/daoResolver'
import { type HexAddress, NetworksEnum } from '@types'
import Bottleneck from 'bottleneck'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const DAO = '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress

describe('AragonTelegram: daoResolver', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('resolveExplicitDaoRef', () => {
    it('resolves a network-address id through findByAddress', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      const resolved = await resolveExplicitDaoRef(`ethereum-sepolia-${DAO}`)
      expect(resolved).to.deep.eq({
        ref: { network: NetworksEnum.ethereumSepolia, daoAddress: DAO },
        name: 'Andr',
      })
    })

    it("returns 'not-found' when the address parses but no organization exists", async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      expect(await resolveExplicitDaoRef(`ethereum-sepolia-${DAO}`)).to.eq('not-found')
    })

    it('resolves a bare ENS name against ethereum mainnet', async () => {
      const findOne = sandbox
        .stub(Models.Dao, 'findOne')
        .resolves({ name: 'Treasury', network: NetworksEnum.ethereumMainnet, address: DAO } as any)
      const resolved = await resolveExplicitDaoRef('treasury.dao.eth')
      expect(findOne.firstCall.args[0]).to.deep.eq({ ens: 'treasury.dao.eth', network: NetworksEnum.ethereumMainnet })
      expect(resolved).to.deep.eq({
        ref: { network: NetworksEnum.ethereumMainnet, daoAddress: DAO },
        name: 'Treasury',
      })
    })

    it("returns 'not-found' for an ENS name no organization carries", async () => {
      sandbox.stub(Models.Dao, 'findOne').resolves(null)
      expect(await resolveExplicitDaoRef('unknown.dao.eth')).to.eq('not-found')
    })

    it('falls back to the network label for an unnamed organization', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: '' } as any)
      const resolved = await resolveExplicitDaoRef(`ethereum-sepolia-${DAO}`)
      expect((resolved as any).name).to.eq(`${NetworksEnum.ethereumSepolia} DAO`)
    })

    it('returns null for input that is not an explicit reference', async () => {
      expect(await resolveExplicitDaoRef('citrea')).to.be.null
      expect(await resolveExplicitDaoRef('')).to.be.null
    })
  })

  describe('searchDaosByName', () => {
    it('queries visible organizations by case-insensitive name and maps to refs', async () => {
      const find = sandbox.stub(Models.Dao, 'find').returns({
        sort: () => ({
          limit: async () => [{ name: 'Citrea', network: NetworksEnum.ethereumMainnet, address: DAO }],
        }),
      } as any)

      const results = await searchDaosByName('citrea')

      expect(find.firstCall.args[0]).to.deep.include({ isActive: true, isHidden: { $ne: true } })
      expect(find.firstCall.args[0].name).to.deep.eq({ $regex: 'citrea', $options: 'i' })
      expect(results).to.deep.eq([
        {
          ref: { network: NetworksEnum.ethereumMainnet, daoAddress: DAO },
          name: 'Citrea',
          network: NetworksEnum.ethereumMainnet,
        },
      ])
    })

    it('runs the query through the shared search limiter', async () => {
      const schedule = sandbox.stub().callsFake(async (fn: () => Promise<unknown>) => await fn())
      sandbox.stub(BottleneckModule, 'getTelegramSearchLimiter').returns({ schedule } as any)
      sandbox.stub(Models.Dao, 'find').returns({ sort: () => ({ limit: async () => [] }) } as any)

      await searchDaosByName('citrea')
      expect(schedule.calledOnce).to.be.true
    })

    it("answers 'busy' instead of queueing when the limiter drops the search", async () => {
      sandbox.stub(BottleneckModule, 'getTelegramSearchLimiter').returns({
        schedule: async () => {
          throw new Bottleneck.BottleneckError('This job has been dropped by Bottleneck')
        },
      } as any)
      const find = sandbox.stub(Models.Dao, 'find')

      expect(await searchDaosByName('citrea')).to.eq('busy')
      expect(find.called).to.be.false
    })

    it('escapes regex metacharacters in the query', async () => {
      const find = sandbox.stub(Models.Dao, 'find').returns({
        sort: () => ({ limit: async () => [] }),
      } as any)

      await searchDaosByName('a+b(c)')
      expect(find.firstCall.args[0].name.$regex).to.eq('a\\+b\\(c\\)')
    })
  })
})
