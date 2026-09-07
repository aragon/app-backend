import SafeController from '@api/controllers/safe'
import WorkspaceController from '@api/controllers/workspace'
import MainRouter from '@api/routers'
import WorkspaceSchema from '@api/routers/schema/workspace'
import { Models } from '@dbModels'
import ValidationSchema from '@helpers/validationSchema'
import { SafeReadError } from '@modules/safe/safeError'
import WorkspaceAccountScope from '@modules/workspace/accountScope'
import { MemberGovernanceFactory } from '@src/governance'
import { DaoList } from '@test/mock/fakeDao'
import { ProposalList } from '@test/mock/fakeProposal'
import { fakeSettings } from '@test/mock/fakeSettings'
import { FakeToken } from '@test/mock/fakeToken'
import { FakeTransaction } from '@test/mock/fakeTransaction'
import { ISafeErrorCode, ISafeSource, ISettingStatus, NetworksEnum, VotingBodyBrandIdentity } from '@types'
import { expect } from 'chai'
import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import * as sinon from 'sinon'
import supertest from 'supertest'

const ETH = NetworksEnum.ethereumMainnet
const BASE = NetworksEnum.baseMainnet
const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'
const TOKEN = '0x3333333333333333333333333333333333333333'
const ZERO = '0x0000000000000000000000000000000000000000'
const SAFE_META = { source: ISafeSource.safeApi, fetchedAt: new Date().toISOString(), stale: false }

const safeTx = (safeTxHash: string, nonce: string, submissionDate: string, from: string, to = TOKEN) => ({
  safeTxHash,
  nonce,
  from,
  to,
  value: '0',
  data: null,
  operation: 0,
  safeTxGas: '0',
  baseGas: '0',
  gasPrice: '0',
  gasToken: ZERO,
  refundReceiver: ZERO,
  confirmations: [],
  confirmationsRequired: 1,
  signatures: null,
  isExecuted: false,
  isSuccessful: null,
  submissionDate,
})
const SCOPE = [
  { network: ETH, address: A },
  { network: BASE, address: B },
]

const request = async (resource: 'assets' | 'transactions' | 'proposals', body: any) =>
  ValidationSchema.validateParams(WorkspaceSchema[resource], body)

async function addAsset(network: NetworksEnum, daoAddress: string, amount: string, tokenAddress = TOKEN) {
  await Models.Asset.create({ network, daoAddress, tokenAddress, amount })
}

async function addToken(network: NetworksEnum, address = TOKEN, decimals = 18, isSpam = false) {
  await Models.Token.create({ ...FakeToken, id: undefined, network, address, decimals, priceUsd: '2', isSpam })
}

const createApp = () => {
  const app = new Koa()
  app.use(async (ctx, next) => {
    try {
      await next()
    } catch (error: any) {
      ctx.status = error.status ?? 500
      ctx.body = { error: error.message }
    }
  })
  app.use(bodyParser())
  const router = MainRouter.router()
  app.use(router.routes()).use(router.allowedMethods())
  return app
}

describe('Module: Workspace', () => {
  let sandbox: sinon.SinonSandbox
  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })
  afterEach(() => sandbox.restore())

  it('normalizes duplicate addresses without collapsing networks', () => {
    const address = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'
    expect(
      WorkspaceAccountScope.normalize([
        { network: ETH, address: address.toLowerCase() },
        { network: ETH, address },
        { network: BASE, address },
      ]),
    ).to.deep.equal([
      { network: ETH, address },
      { network: BASE, address },
    ])
  })

  it('requires a bounded explicit scope and validates body filters and pagination', async () => {
    for (const body of [
      {},
      { accounts: [{ network: 'invalid', address: A }] },
      { accounts: [{ network: ETH, address: 'bad' }] },
      { accounts: Array.from({ length: 101 }, () => SCOPE[0]) },
      { accounts: SCOPE, filters: { daoAddress: A } },
      { accounts: SCOPE, filters: { tokenAddress: TOKEN } },
      { accounts: SCOPE, pagination: { pageSize: 51 } },
      { accounts: SCOPE, pagination: { sort: '$where' } },
      { accounts: SCOPE, pagination: { page: 0 } },
      { accounts: SCOPE, pagination: { cursor: 'unsupported' } },
    ]) {
      await expect(request('assets', body)).to.be.rejectedWith('badParams')
    }
    const parsed = await request('assets', { accounts: [] })
    expect(parsed.filters.includeSpam).to.equal(false)
    expect(parsed.pagination).to.include({ page: 1, pageSize: 10, sort: 'amountUsd', order: 'desc' })
  })

  it('matches exact network/address pairs, groups balances, and keeps totals independent of paging', async () => {
    await addToken(ETH, TOKEN, 0)
    await addToken(BASE)
    await addAsset(ETH, A, '3')
    await addAsset(BASE, B, '5')
    // These cross-pairs must never leak into the selected workspace.
    await addAsset(ETH, B, '100')
    await addAsset(BASE, A, '100')

    const result = await WorkspaceController.getAssets(
      await request('assets', {
        accounts: [...SCOPE, SCOPE[0]],
        pagination: { pageSize: 1 },
      }),
    )
    expect(result.metadata).to.include({ totalRecords: 2, totalPages: 2, totalAmountUsd: '16' })
    expect(result.data[0]).to.include({ network: BASE, amount: '5', amountUsd: '10' })
    expect(result.data[0].allocations).to.deep.equal([{ account: SCOPE[1], amount: '5', amountUsd: '10' }])

    const page = await WorkspaceController.getAssets(
      await request('assets', {
        accounts: SCOPE,
        pagination: { pageSize: 1, page: 3 },
      }),
    )
    expect(page.data).to.deep.equal([])
    expect(page.metadata).to.include({ page: 3, totalRecords: 2, totalAmountUsd: '16' })
  })

  it('preserves account selection when filtering by token and excludes spam from totals', async () => {
    await addToken(ETH)
    await addToken(ETH, B, 18, true)
    await addAsset(ETH, A, '3')
    await addAsset(ETH, B, '5')
    await addAsset(ETH, A, '100', B)
    const accounts = [
      { network: ETH, address: A },
      { network: ETH, address: B },
    ]
    const result = await WorkspaceController.getAssets(
      await request('assets', {
        accounts,
        filters: { network: ETH, tokenAddress: TOKEN },
      }),
    )
    expect(result.data).to.have.length(1)
    expect(result.data[0].amount).to.equal('8')
    expect(result.data[0].allocations).to.have.length(2)
    expect(result.metadata.totalAmountUsd).to.equal('16')
    const all = await WorkspaceController.getAssets(await request('assets', { accounts }))
    expect(all.metadata).to.include({ totalAmountUsd: '16', spamCount: 1 })
  })

  it('does not replace an account restriction with a search filter', async () => {
    await addToken(ETH)
    await addAsset(ETH, A, '3')
    await addAsset(ETH, B, '50')
    const result = await WorkspaceController.getAssets(
      await request('assets', {
        accounts: [{ network: ETH, address: A }],
        pagination: { search: B },
      }),
    )
    expect(result.data).to.deep.equal([])
  })

  it('returns empty results for an explicit empty scope even when records exist', async () => {
    await addAsset(ETH, A, '3')
    await Models.Transaction.create({ ...FakeTransaction, network: ETH, daoAddress: A })
    await Models.Proposal.create({ ...ProposalList[0], network: ETH, daoAddress: A })
    for (const [resource, method] of [
      ['assets', WorkspaceController.getAssets],
      ['transactions', WorkspaceController.getTransactions],
      ['proposals', WorkspaceController.getProposals],
    ] as const) {
      const result = await method(await request(resource, { accounts: [] }))
      expect(result.data).to.deep.equal([])
      expect(result.metadata.totalRecords).to.equal(0)
      expect(result.coverage).to.deep.equal([])
      expect(result.partial).to.equal(false)
    }
  })

  it('orders transaction activity across networks by time and retains stable record IDs', async () => {
    for (const [network, daoAddress, timestamp, block] of [
      [ETH, A, 100, 1000],
      [BASE, B, 200, 10],
      [ETH, B, 300, 2000],
    ] as const) {
      await Models.Transaction.create({
        ...FakeTransaction,
        network,
        daoAddress,
        blockTimestamp: timestamp,
        blockNumber: block,
      })
    }
    const result = await WorkspaceController.getTransactions(await request('transactions', { accounts: SCOPE }))
    expect(result.data.map((item: any) => item.blockTimestamp)).to.deep.equal([200, 100])
    expect(result.data.map((item: any) => item.account)).to.deep.equal([SCOPE[1], SCOPE[0]])
    expect(result.data.every((item: any) => typeof item.id === 'string')).to.equal(true)
    expect(result.metadata.totalRecords).to.equal(2)
  })

  it('marks internal transfers while preserving both account records', async () => {
    for (const daoAddress of [A, B]) {
      await Models.Transaction.create({ ...FakeTransaction, network: ETH, daoAddress, fromAddress: A, toAddress: B })
    }
    const result = await WorkspaceController.getTransactions(
      await request('transactions', {
        accounts: [
          { network: ETH, address: A },
          { network: ETH, address: B },
        ],
        filters: { network: ETH, tokenAddress: FakeTransaction.token.address },
      }),
    )
    expect(result.data).to.have.length(2)
    expect(result.data.every((item: any) => item.internal)).to.equal(true)
    const single = await WorkspaceController.getTransactions(await request('transactions', { accounts: [SCOPE[0]] }))
    expect(single.data[0].internal).to.equal(false)
  })

  it('keeps proposal filters scoped, including isExecuted=false', async () => {
    for (const [network, daoAddress, index, executed] of [
      [ETH, A, '0', false],
      [BASE, B, '1', false],
      [ETH, B, '2', false],
      [ETH, A, '3', true],
    ] as const) {
      await Models.Proposal.create({
        ...ProposalList[0],
        id: undefined,
        network,
        daoAddress,
        proposalIndex: index,
        executed: { ...ProposalList[0].executed, status: executed },
      })
    }
    sandbox.stub(SafeController, 'getQueue').rejects(new SafeReadError(ISafeErrorCode.notFound, 'not a Safe', 404))
    const result = await WorkspaceController.getProposals(
      await request('proposals', {
        accounts: SCOPE,
        filters: { isExecuted: false, creatorAddress: ProposalList[0].creatorAddress },
      }),
    )
    expect(result.metadata.totalRecords).to.equal(2)
    expect(result.data.every((item: any) => item.executed.status === false)).to.equal(true)
    expect(result.pending).to.deep.equal([])
    expect(result.coverage.map(item => item.status)).to.deep.equal(['unsupported', 'unsupported'])
  })

  it('lists queued Safe transactions of selected Safes next to indexed proposals', async () => {
    await Models.Dao.create({ ...DaoList[0], id: undefined, network: ETH, address: A, creatorAddress: B })
    await Models.Proposal.create({ ...ProposalList[0], id: undefined, network: ETH, daoAddress: A })
    const readQueue = sandbox.stub(SafeController, 'getQueue').resolves({
      count: 60,
      next: 'next-page',
      previous: null,
      results: [safeTx('0xaaa', '1', '2026-09-01T00:00:00Z', A), safeTx('0xbbb', '2', '2026-09-02T00:00:00Z', B)],
      meta: SAFE_META,
    })

    const result = await WorkspaceController.getProposals(await request('proposals', { accounts: SCOPE }))
    expect(readQueue.calledOnceWithExactly(BASE, B, 50, 0)).to.equal(true)
    expect(result.data).to.have.length(1)
    expect(result.pending.map(item => item.id)).to.deep.equal([`${BASE}:${B}:0xbbb`, `${BASE}:${B}:0xaaa`])
    expect(result.pending[0]).to.include({ source: 'safe', status: 'pending', network: BASE, submittedAt: 1788307200 })
    expect(result.pending[0].transaction.safeTxHash).to.equal('0xbbb')
    expect(result.coverage).to.deep.equal([
      { account: SCOPE[0], resource: 'proposals', source: 'index', status: 'available' },
      { account: SCOPE[1], resource: 'proposals', source: 'safe', status: 'partial' },
    ])
    expect(result.partial).to.equal(true)

    const byProposer = await WorkspaceController.getProposals(
      await request('proposals', { accounts: SCOPE, filters: { creatorAddress: B } }),
    )
    expect(byProposer.pending.map(item => item.transaction.safeTxHash)).to.deep.equal(['0xbbb'])
    const executed = await WorkspaceController.getProposals(
      await request('proposals', { accounts: SCOPE, filters: { isExecuted: true } }),
    )
    expect(executed.pending).to.deep.equal([])
  })

  it('keeps a Safe whose queue cannot be read in coverage instead of dropping it', async () => {
    sandbox.stub(SafeController, 'getQueue').rejects(new SafeReadError(ISafeErrorCode.rateLimited, 'retry', 429, 30))
    const result = await WorkspaceController.getProposals(await request('proposals', { accounts: [SCOPE[1]] }))
    expect(result.pending).to.deep.equal([])
    expect(result.coverage[0]).to.include({ source: 'safe', status: 'unavailable' })
    expect(result.coverage[0].error).to.deep.equal({ code: 'rate-limited', retryAfter: 30 })
    expect(result.partial).to.equal(true)
  })

  it('reads Safes that sit in a selected DAO process and keeps only decisions addressed to it', async () => {
    const C = '0x5555555555555555555555555555555555555555'
    await Models.Dao.create({ ...DaoList[0], id: undefined, network: ETH, address: A, creatorAddress: B })
    await Models.Setting.create({
      ...fakeSettings,
      id: 'spp-setting',
      network: ETH,
      daoAddress: A,
      pluginAddress: TOKEN,
      status: ISettingStatus.active,
      stages: [{ stageIndex: 0, plugins: [{ address: C, brandId: VotingBodyBrandIdentity.SAFE }] }],
    })
    const readQueue = sandbox.stub(SafeController, 'getQueue').resolves({
      count: 2,
      next: null,
      previous: null,
      results: [
        safeTx('0xccc', '1', '2026-09-03T00:00:00Z', A, TOKEN),
        safeTx('0xddd', '2', '2026-09-04T00:00:00Z', A, ZERO),
      ],
      meta: SAFE_META,
    })

    const result = await WorkspaceController.getProposals(await request('proposals', { accounts: [SCOPE[0]] }))
    expect(readQueue.calledOnceWithExactly(ETH, C, 50, 0)).to.equal(true)
    expect(result.pending.map(item => item.transaction.safeTxHash)).to.deep.equal(['0xccc'])
    expect(result.pending[0].via).to.deep.equal({ account: SCOPE[0], pluginAddress: TOKEN })
    expect(result.coverage).to.deep.equal([
      { account: SCOPE[0], resource: 'proposals', source: 'index', status: 'available' },
      {
        account: { network: ETH, address: C },
        resource: 'proposals',
        source: 'safe',
        status: 'available',
        via: SCOPE[0],
      },
    ])
    expect(result.partial).to.equal(false)

    // Selecting the Safe itself reads it once and returns its whole queue.
    readQueue.resetHistory()
    const both = await WorkspaceController.getProposals(
      await request('proposals', { accounts: [SCOPE[0], { network: ETH, address: C }] }),
    )
    expect(readQueue.calledOnce).to.equal(true)
    expect(both.pending).to.have.length(2)
    expect(both.pending.every(item => item.via === undefined)).to.equal(true)
    expect(both.coverage).to.have.length(2)
  })

  it('reads a governance member source up to its cap and reports the rest as partial', async () => {
    await Models.Dao.create({ ...DaoList[0], id: undefined, network: ETH, address: A, creatorAddress: B })
    const plugin = { network: ETH, address: TOKEN, daoAddress: A, interfaceType: 'multisig', tokenAddress: null }
    sandbox.stub(Models.Plugin, 'find').returns({ lean: sandbox.stub().resolves([plugin]) } as any)
    const findMembers = sandbox.stub().callsFake(async ({ paginationParams }: any) => ({
      data: [{ address: `0x${String(paginationParams.page).padStart(40, '0')}`, ens: null }],
      metadata: { page: paginationParams.page, pageSize: 50, totalPages: 25, totalRecords: 25 },
    }))
    sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns({ findAndPaginateMembers: findMembers } as any)

    const result = await WorkspaceController.getMembers(
      await ValidationSchema.validateParams(WorkspaceSchema.members, {
        accounts: [SCOPE[0]],
        pagination: { pageSize: 50 },
      }),
    )
    expect(findMembers.callCount).to.equal(20)
    expect(result.metadata.totalRecords).to.equal(20)
    expect(result.coverage[0]).to.include({ status: 'partial' })
    expect(result.partial).to.equal(true)
  })

  it('reports unverified coverage without treating missing index data as a known empty portfolio', async () => {
    await Models.Dao.create({ ...DaoList[0], id: undefined, network: ETH, address: A, creatorAddress: B })
    const result = await WorkspaceController.getAssets(await request('assets', { accounts: SCOPE }))
    expect(result.coverage.map(item => item.status)).to.deep.equal(['available', 'unverified'])
    expect(result.partial).to.equal(true)
    const filtered = await WorkspaceController.getAssets(
      await request('assets', {
        accounts: SCOPE,
        filters: { network: ETH },
      }),
    )
    expect(filtered.coverage).to.have.length(1)
    expect(filtered.partial).to.equal(false)
  })

  it('uses indexed DAOs and the existing Safe controller to resolve account details', async () => {
    await Models.Dao.create({ ...DaoList[0], id: undefined, network: ETH, address: A, creatorAddress: B })
    const safe = {
      address: B,
      owners: [A],
      threshold: 1,
      version: '1.4.1',
      nonce: '1',
      modules: [],
      guard: null,
      meta: { source: ISafeSource.chain, fetchedAt: new Date().toISOString(), stale: false },
    }
    const readSafe = sandbox.stub(SafeController, 'getInfo').resolves(safe)
    const result = await WorkspaceController.getAccounts({ accounts: [...SCOPE, SCOPE[1]] })
    expect(result.data.map(item => item.type)).to.deep.equal(['dao', 'safe'])
    expect(result.data[1]).to.include({ indexed: false, safe })
    expect(readSafe.calledOnceWithExactly(BASE, B)).to.equal(true)
  })

  it('retains unsupported and temporarily unavailable accounts', async () => {
    const readSafe = sandbox.stub(SafeController, 'getInfo')
    readSafe.withArgs(ETH, A).rejects(new SafeReadError(ISafeErrorCode.notFound, 'not a Safe', 404))
    readSafe.withArgs(BASE, B).rejects(new SafeReadError(ISafeErrorCode.rateLimited, 'retry', 429, 30))
    const result = await WorkspaceController.getAccounts({ accounts: SCOPE })
    expect(result.data.map(item => item.status)).to.deep.equal(['unsupported', 'unavailable'])
    expect(result.data[1].error).to.deep.equal({ code: 'rate-limited', retryAfter: 30 })
  })

  it('merges governance members and Safe owners while preserving their memberships', async () => {
    const member = '0x4444444444444444444444444444444444444444'
    await Models.Dao.create({ ...DaoList[0], id: undefined, network: ETH, address: A, creatorAddress: B })
    const plugin = {
      network: ETH,
      address: TOKEN,
      daoAddress: A,
      interfaceType: 'multisig',
      tokenAddress: null,
    }
    sandbox.stub(Models.Plugin, 'find').returns({ lean: sandbox.stub().resolves([plugin]) } as any)
    sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns({
      findAndPaginateMembers: sandbox.stub().resolves({
        data: [{ address: member, ens: 'member.eth', votingPower: '1' }],
        metadata: { page: 1, pageSize: 50, totalPages: 1, totalRecords: 1 },
      }),
    } as any)
    sandbox.stub(SafeController, 'getInfo').resolves({
      address: B,
      owners: [member],
      threshold: 1,
      version: '1.4.1',
      nonce: '1',
      modules: [],
      guard: null,
      meta: { source: ISafeSource.chain, fetchedAt: new Date().toISOString(), stale: false },
    })

    const accounts = [
      { network: ETH, address: A },
      { network: ETH, address: B },
    ]
    const result = await WorkspaceController.getMembers(
      await ValidationSchema.validateParams(WorkspaceSchema.members, { accounts }),
    )
    expect(result.data).to.have.length(1)
    expect(result.data[0]).to.include({ network: ETH, address: member, ens: 'member.eth' })
    expect(result.data[0].memberships.map(item => item.role)).to.deep.equal(['member', 'owner'])
    expect(result.metadata).to.include({ totalRecords: 1, totalPages: 1 })
    expect(result.partial).to.equal(false)

    const owners = await WorkspaceController.getMembers(
      await ValidationSchema.validateParams(WorkspaceSchema.members, { accounts, filters: { role: 'owner' } }),
    )
    expect(owners.data[0].memberships).to.have.length(1)
    expect(owners.data[0].memberships[0].governance).to.deep.equal({ address: B, type: 'safe' })
  })

  it('mounts the explicit and unversioned workspace routes and rejects invalid bodies', async () => {
    const client = supertest(createApp().callback())
    for (const path of ['/v2/workspaces/query/assets', '/workspaces/query/assets']) {
      const response = await client.post(path).send({ accounts: [] })
      expect(response.status).to.equal(200)
      expect(response.body.data).to.deep.equal([])
      expect(response.headers['cache-control']).to.equal('no-store')
    }
    expect((await client.post('/v2/workspaces/query/assets').send({})).status).to.equal(400)
    expect((await client.post('/v2/workspaces/query/assets?page=2').send({ accounts: [] })).status).to.equal(400)
  })
})
