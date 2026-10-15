import { Models } from '@dbModels'
import WorkspaceAccountScope from '@modules/workspace/accountScope'
import WorkspaceAccounts from '@modules/workspace/accounts'
import { DaoList } from '@test/mock/fakeDao'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'

const SEPOLIA = NetworksEnum.ethereumSepolia
const MAINNET = NetworksEnum.ethereumMainnet
const SAFE = '0x1F01e6fe406295c9fe42189A2ef999636a04132a'
const OTHER = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'
const account = { network: SEPOLIA, address: SAFE }

describe('Module: WorkspaceAccounts', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })
  afterEach(() => sandbox.restore())

  it('finds only tracked Safes in the selected network and address pairs', async () => {
    await Models.SafeAccount.track(SEPOLIA, SAFE)
    await Models.SafeAccount.track(MAINNET, OTHER)
    await Models.SafeAccount.track(SEPOLIA, OTHER)
    const selected = [account, { network: MAINNET, address: SAFE }]

    expect([...(await WorkspaceAccounts.findTrackedSafes(selected))]).to.deep.equal([
      WorkspaceAccountScope.key(account),
    ])
  })

  it('does not query Safe accounts for an empty selection', async () => {
    const find = sandbox.spy(Models.SafeAccount, 'find')

    expect((await WorkspaceAccounts.findTrackedSafes([])).size).to.equal(0)
    expect(find.notCalled).to.be.true
  })

  it('reads all selected Safes in one query', async () => {
    await Models.SafeAccount.track(SEPOLIA, SAFE)
    await Models.SafeAccount.track(MAINNET, OTHER)
    const find = sandbox.spy(Models.SafeAccount, 'find')
    const selected = [account, { network: MAINNET, address: OTHER }]

    expect([...(await WorkspaceAccounts.findTrackedSafes(selected))]).to.have.members(
      selected.map(WorkspaceAccountScope.key),
    )
    expect(find.calledOnce).to.be.true
  })

  for (const resource of ['assets', 'transactions'] as const) {
    it(`marks a tracked Safe's ${resource} available before its first crawl`, async () => {
      await Models.SafeAccount.track(SEPOLIA, SAFE)

      expect(await WorkspaceAccounts.coverage([account], resource)).to.deep.equal([
        { account, resource, source: 'index', status: 'available' },
      ])
      expect(await Models.Asset.countDocuments()).to.equal(0)
      expect(await Models.Transaction.countDocuments()).to.equal(0)
      expect(await Models.ConfigIndexer.countDocuments()).to.equal(0)
    })

    it(`keeps an old Safe account's ${resource} unverified`, async () => {
      await Models.SafeAccount.ensure(SEPOLIA, SAFE)

      expect(await WorkspaceAccounts.coverage([account], resource)).to.deep.equal([
        { account, resource, source: 'index', status: 'unverified' },
      ])
    })
  }

  it('keeps coverage separate for the same address on two networks', async () => {
    await Models.SafeAccount.track(SEPOLIA, SAFE)
    const selected = [{ network: MAINNET, address: SAFE }, account]

    const coverage = await WorkspaceAccounts.coverage(selected, 'assets')

    expect(coverage.map(item => item.account)).to.deep.equal(selected)
    expect(coverage.map(item => item.status)).to.deep.equal(['unverified', 'available'])
  })

  it('changes coverage after removal and re-add without deleting stored assets', async () => {
    await Models.SafeAccount.track(SEPOLIA, SAFE)
    await Models.Asset.create({ network: SEPOLIA, daoAddress: SAFE, tokenAddress: OTHER, amount: '7' })

    expect((await WorkspaceAccounts.coverage([account], 'assets'))[0].status).to.equal('available')
    await Models.SafeAccount.untrack(SEPOLIA, SAFE)
    expect((await WorkspaceAccounts.coverage([account], 'assets'))[0].status).to.equal('unverified')
    await Models.SafeAccount.track(SEPOLIA, SAFE)
    expect((await WorkspaceAccounts.coverage([account], 'assets'))[0].status).to.equal('available')
    expect(await Models.Asset.countDocuments({ network: SEPOLIA, daoAddress: SAFE })).to.equal(1)
  })

  it('keeps a DAO available without a Safe registration', async () => {
    await Models.Dao.create({ ...DaoList[0], id: undefined, network: SEPOLIA, address: SAFE })

    expect(await WorkspaceAccounts.coverage([account], 'transactions')).to.deep.equal([
      { account, resource: 'transactions', source: 'index', status: 'available' },
    ])
    expect((await WorkspaceAccounts.findTrackedSafes([account])).size).to.equal(0)
  })
})
