import SafeController from '@api/controllers/safe'
import WorkspaceController from '@api/controllers/workspace'
import MainRouter from '@api/routers'
import WorkspaceSchema from '@api/routers/schema/workspace'
import { Safe } from '@artifacts/Safe'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import ValidationSchema from '@helpers/validationSchema'
import logger from '@logger'
import ErrorMiddleware from '@middlewares/error'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import SafeReadRequestModule from '@modules/safe/safeReadRequest'
import WorkspaceAccountScope from '@modules/workspace/accountScope'
import { BaseGovernance, MemberGovernanceFactory } from '@src/governance'
import { SafeGateway } from '@services/aragon-gateway/safe'
import { DaoList } from '@test/mock/fakeDao'
import { ProposalList } from '@test/mock/fakeProposal'
import { fakeSettings } from '@test/mock/fakeSettings'
import { FakeToken } from '@test/mock/fakeToken'
import { FakeTransaction } from '@test/mock/fakeTransaction'
import {
  ErrorKeyEnum,
  IPluginInterfaceType,
  IPluginStatus,
  type IQueueSafeRead,
  ISafeErrorCode,
  ISafeReadKind,
  ISafeSource,
  ISettingStatus,
  NetworksEnum,
  VotingBodyBrandIdentity,
} from '@types'
import { expect } from 'chai'
import { id, Interface } from 'ethers'
import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import * as sinon from 'sinon'
import supertest from 'supertest'

const ETH = NetworksEnum.ethereumMainnet
const BASE = NetworksEnum.baseMainnet
const A = '0x1111111111111111111111111111111111111111'
const B = '0x2222222222222222222222222222222222222222'
const TOKEN = '0x3333333333333333333333333333333333333333'
const MULTISIG = '0x8888888888888888888888888888888888888888'
const ZERO = '0x0000000000000000000000000000000000000000'
const SAFE_META = { source: ISafeSource.safeApi, fetchedAt: new Date().toISOString(), stale: false }
const SAFE_INFO = {
  address: B,
  owners: [A],
  threshold: 1,
  version: '1.4.1',
  nonce: '1',
  modules: [],
  guard: null,
  meta: SAFE_META,
}

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
  app.use(ErrorMiddleware())
  app.use(bodyParser())
  const router = MainRouter.router()
  app.use(router.routes()).use(router.allowedMethods())
  return app
}

describe('Module: Workspace', () => {
  let sandbox: sinon.SinonSandbox
  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'verbose')
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
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves({
      safeError: { code: ISafeErrorCode.notFound, error: 'not a Safe', status: 404 },
    })
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

  it('keeps indexed and pending proposals when a selected Safe queue is rate limited', async () => {
    const failed = { network: ETH, address: TOKEN }
    await Models.Dao.create({ ...DaoList[0], id: undefined, network: ETH, address: A, creatorAddress: B })
    await Models.Proposal.create({ ...ProposalList[0], id: undefined, network: ETH, daoAddress: A })
    const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').callsFake(async (_queue, message) => {
      const address = (message as { params: { address: string } }).params.address
      if (address === B) {
        return {
          count: 1,
          next: null,
          previous: null,
          results: [safeTx('0xaaa', '1', '2026-09-01T00:00:00Z', A)],
          meta: SAFE_META,
        }
      }
      return { safeError: { code: ISafeErrorCode.rateLimited, error: 'retry', status: 429, retryAfter: 30 } }
    })
    const response = await supertest(createApp().callback())
      .post('/v2/workspaces/query/proposals')
      .send({ accounts: [SCOPE[0], SCOPE[1], failed] })

    expect(response.status).to.equal(200)
    expect(response.body.data).to.have.length(1)
    expect(response.body.metadata.totalRecords).to.equal(1)
    expect(response.body.pending.map((item: any) => item.transaction.safeTxHash)).to.deep.equal(['0xaaa'])
    expect(response.body.coverage).to.deep.equal([
      { account: SCOPE[0], resource: 'proposals', source: 'index', status: 'available' },
      { account: SCOPE[1], resource: 'proposals', source: 'safe', status: 'available' },
      {
        account: failed,
        resource: 'proposals',
        source: 'safe',
        status: 'unavailable',
        error: { code: ISafeErrorCode.rateLimited, retryAfter: 30 },
      },
    ])
    expect(response.body.partial).to.equal(true)
    expect(sendMessage.callCount).to.equal(2)
    expect(sendMessage.firstCall.args[0]).to.equal('safe.read')
    expect((sendMessage.firstCall.args[1] as { params: { kind: string } }).params.kind).to.equal(ISafeReadKind.queue)
  })

  it('keeps indexed and pending proposals when a related Safe queue is missing', async () => {
    const related = { network: ETH, address: '0x5555555555555555555555555555555555555555' }
    await Models.Dao.create({ ...DaoList[0], id: undefined, network: ETH, address: A, creatorAddress: B })
    await Models.Proposal.create({ ...ProposalList[0], id: undefined, network: ETH, daoAddress: A })
    await Models.Setting.create({
      ...fakeSettings,
      id: 'spp-setting',
      network: ETH,
      daoAddress: A,
      pluginAddress: TOKEN,
      status: ISettingStatus.active,
      stages: [{ stageIndex: 0, plugins: [{ address: related.address, brandId: VotingBodyBrandIdentity.SAFE }] }],
    })
    const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').callsFake(async (_queue, message) => {
      const address = (message as { params: { address: string } }).params.address
      if (address === B) {
        return {
          count: 1,
          next: null,
          previous: null,
          results: [safeTx('0xbbb', '2', '2026-09-02T00:00:00Z', A)],
          meta: SAFE_META,
        }
      }
      return { safeError: { code: ISafeErrorCode.notFound, error: 'not a Safe', status: 404 } }
    })
    const response = await supertest(createApp().callback())
      .post('/v2/workspaces/query/proposals')
      .send({ accounts: SCOPE })

    expect(response.status).to.equal(200)
    expect(response.body.data).to.have.length(1)
    expect(response.body.pending.map((item: any) => item.transaction.safeTxHash)).to.deep.equal(['0xbbb'])
    expect(response.body.coverage).to.deep.equal([
      { account: SCOPE[0], resource: 'proposals', source: 'index', status: 'available' },
      { account: SCOPE[1], resource: 'proposals', source: 'safe', status: 'available' },
      {
        account: related,
        resource: 'proposals',
        source: 'safe',
        status: 'unsupported',
        via: SCOPE[0],
        error: { code: ISafeErrorCode.notFound },
      },
    ])
    expect(response.body.partial).to.equal(true)
    expect(sendMessage.callCount).to.equal(2)
  })

  it('keeps a queue timeout in coverage', async () => {
    const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(null)
    const response = await supertest(createApp().callback())
      .post('/v2/workspaces/query/proposals')
      .send({ accounts: [SCOPE[1]] })
    expect(response.status).to.equal(200)
    expect(response.body.pending).to.deep.equal([])
    expect(response.body.coverage[0]).to.include({ source: 'safe', status: 'unavailable' })
    expect(response.body.coverage[0].error).to.deep.equal({ code: ISafeErrorCode.connectionError })
    expect(response.body.partial).to.equal(true)
    expect(sendMessage.calledOnce).to.equal(true)
  })

  it('keeps an unsupported queue network without publishing', async () => {
    const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage')
    const response = await supertest(createApp().callback())
      .post('/v2/workspaces/query/proposals')
      .send({ accounts: [{ network: NetworksEnum.citreaMainnet, address: A }] })
    expect(response.status).to.equal(200)
    expect(response.body.pending).to.deep.equal([])
    expect(response.body.coverage[0].status).to.equal('unsupported')
    expect(response.body.coverage[0].error).to.deep.equal({ code: ISafeErrorCode.unsupportedChain })
    expect(response.body.partial).to.equal(true)
    expect(sendMessage.called).to.equal(false)
  })

  it('fails the proposals request for an unrelated queue error', async () => {
    sandbox.stub(RabbitMQHelper, 'sendMessage').rejects(new Error('safeNotFound'))
    const response = await supertest(createApp().callback())
      .post('/v2/workspaces/query/proposals')
      .send({ accounts: [SCOPE[1]] })
    expect(response.status).to.equal(500)
    expect(response.body).to.deep.equal({ code: 'unknownError', description: 'Internal server error', status: 500 })
  })

  it('keeps a stale queue result available', async () => {
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves({
      count: 1,
      next: null,
      previous: null,
      results: [safeTx('0xccc', '3', '2026-09-03T00:00:00Z', A)],
      meta: { ...SAFE_META, stale: true },
    })
    const response = await supertest(createApp().callback())
      .post('/v2/workspaces/query/proposals')
      .send({ accounts: [SCOPE[1]] })
    expect(response.status).to.equal(200)
    expect(response.body.pending.map((item: any) => item.transaction.safeTxHash)).to.deep.equal(['0xccc'])
    expect(response.body.coverage[0]).to.include({ source: 'safe', status: 'available', stale: true })
    expect(response.body.partial).to.equal(false)
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
    const plugin = {
      network: ETH,
      address: TOKEN,
      daoAddress: A,
      interfaceType: 'multisig',
      isBody: true,
      tokenAddress: null,
    }
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

  for (const [code, status] of [
    [ISafeErrorCode.unsupportedChain, 501],
    [ISafeErrorCode.rateLimited, 429],
    [ISafeErrorCode.notConfigured, 503],
    [ISafeErrorCode.invalidResponse, 502],
    [ISafeErrorCode.connectionError, 502],
    [ISafeErrorCode.notFound, 404],
    [ISafeErrorCode.upstreamError, 502],
  ] as const) {
    it(`keeps the other accounts when a Safe read returns ${code}`, async () => {
      const failed = { network: ETH, address: TOKEN }
      await Models.Dao.create({ ...DaoList[0], id: undefined, network: ETH, address: A, creatorAddress: B })
      const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').callsFake(async (_queue, message) => {
        const address = (message as { params: { address: string } }).params.address
        if (address === B) return SAFE_INFO
        return {
          safeError: {
            code,
            error: 'Safe read failed',
            status,
            retryAfter: code === ISafeErrorCode.rateLimited ? 30 : undefined,
          },
        }
      })
      const response = await supertest(createApp().callback())
        .post('/v2/workspaces/query/accounts')
        .send({ accounts: [failed, SCOPE[0], SCOPE[1], failed] })

      expect(response.status).to.equal(200)
      expect(response.body.data.map((item: any) => ({ network: item.network, address: item.address }))).to.deep.equal([
        failed,
        SCOPE[0],
        SCOPE[1],
      ])
      expect(response.body.data.map((item: any) => item.type)).to.deep.equal(['unknown', 'dao', 'safe'])
      expect(response.body.data.map((item: any) => item.status)).to.deep.equal([
        [ISafeErrorCode.notFound, ISafeErrorCode.unsupportedChain].includes(code) ? 'unsupported' : 'unavailable',
        'available',
        'available',
      ])
      expect(response.body.data[0].error).to.deep.equal({
        code,
        ...(code === ISafeErrorCode.rateLimited && { retryAfter: 30 }),
      })
      expect(response.body.data[1]).to.include({ indexed: true, name: DaoList[0].name })
      expect(response.body.data[2]).to.include({ indexed: false })
      expect(response.body.data[2].safe).to.deep.equal(SAFE_INFO)
      expect(sendMessage.callCount).to.equal(2)
      expect(sendMessage.firstCall.args[0]).to.equal('safe.read')
      expect((sendMessage.firstCall.args[1] as { params: { kind: string } }).params.kind).to.equal(ISafeReadKind.info)
    })
  }

  it('keeps an account when the Safe read times out', async () => {
    const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(null)
    const response = await supertest(createApp().callback())
      .post('/v2/workspaces/query/accounts')
      .send({ accounts: [SCOPE[1]] })
    expect(response.status).to.equal(200)
    expect(response.body.data[0]).to.include({ type: 'unknown', status: 'unavailable', indexed: false })
    expect(response.body.data[0].error).to.deep.equal({ code: ISafeErrorCode.connectionError })
    expect(sendMessage.calledOnce).to.equal(true)
  })

  it('keeps a non-Safe as unsupported and an RPC failure as unavailable', async () => {
    sandbox.stub(logger, 'warn')
    const getCode = sandbox.stub().callsFake(async (address: string) => {
      if (address === TOKEN) return '0x6370a08231'
      throw new Error('RPC down')
    })
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getCode } as never)
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: () => unknown) => fn() } as never)
    const sendMessage = sandbox
      .stub(RabbitMQHelper, 'sendMessage')
      .callsFake(async (_queue, message) => SafeGateway.read((message as { params: IQueueSafeRead }).params))

    const response = await supertest(createApp().callback())
      .post('/v2/workspaces/query/accounts')
      .send({ accounts: [{ network: ETH, address: TOKEN }, SCOPE[1]] })

    expect(response.status).to.equal(200)
    expect(response.body.data.map((item: any) => item.status)).to.deep.equal(['unsupported', 'unavailable'])
    expect(response.body.data.map((item: any) => item.error.code)).to.deep.equal([
      ISafeErrorCode.notFound,
      ISafeErrorCode.connectionError,
    ])
    expect(sendMessage.callCount).to.equal(2)
    expect(getCode.callCount).to.equal(2)
  })

  it('keeps a Safe available for retry when getOwners hits an RPC error', async () => {
    sandbox.stub(logger, 'warn')
    const getCode = sandbox.stub().resolves(`0x6000${id('masterCopy()').slice(2, 10)}`)
    const call = sandbox.stub().rejects(
      Object.assign(new Error('missing revert data'), {
        code: 'CALL_EXCEPTION',
        data: null,
        info: { error: { code: -32000, message: 'header not found' } },
      }),
    )
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({ getCode, call } as never)
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: () => unknown) => fn() } as never)
    const sendMessage = sandbox
      .stub(RabbitMQHelper, 'sendMessage')
      .callsFake(async (_queue, message) => SafeGateway.read((message as { params: IQueueSafeRead }).params))

    const response = await supertest(createApp().callback())
      .post('/v2/workspaces/query/accounts')
      .send({ accounts: [{ network: ETH, address: TOKEN }] })

    expect(response.status).to.equal(200)
    expect(response.body.data[0]).to.include({ status: 'unavailable' })
    expect(response.body.data[0].error.code).to.equal(ISafeErrorCode.connectionError)
    expect(sendMessage.calledOnce).to.be.true
    expect(call.calledOnce).to.be.true
    expect(await Models.SafeCache.findOne({ id: Models.SafeCache.infoNotFoundKey(ETH, TOKEN) })).to.be.null
  })

  it('skips the queue for a cached miss and reads a Safe after the miss expires', async () => {
    sandbox.stub(logger, 'info')
    const start = Date.now()
    const clock = sandbox.useFakeTimers({ now: start, toFake: ['Date'] })
    const safeInterface = new Interface(Safe.abi)
    let deployed = false
    const getCode = sandbox.stub().callsFake(async () => (deployed ? `0x6000${id('masterCopy()').slice(2, 10)}` : '0x'))
    const call = sandbox.stub().callsFake(async ({ data }: { data: string }) => {
      const fragment = safeInterface.getFunction(data.slice(0, 10))
      if (!fragment) throw new Error('unknown Safe call')
      const answers: Record<string, unknown[]> = {
        getOwners: [[A]],
        getThreshold: [1n],
        nonce: [1n],
        VERSION: ['1.4.1'],
        getModulesPaginated: [[], ZERO],
      }
      return safeInterface.encodeFunctionResult(fragment, answers[fragment.name])
    })
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getCode,
      call,
      getStorage: sandbox.stub().resolves(`0x${'0'.repeat(64)}`),
    } as never)
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: () => unknown) => fn() } as never)
    const sendMessage = sandbox
      .stub(RabbitMQHelper, 'sendMessage')
      .callsFake(async (_queue, message) => SafeGateway.read((message as { params: IQueueSafeRead }).params))
    const client = supertest(createApp().callback())
    const accounts = [{ network: ETH, address: TOKEN }]

    const first = await client.post('/v2/workspaces/query/accounts').send({ accounts })
    expect(first.status).to.equal(200)
    expect(first.body.data[0].status).to.equal('unsupported')
    expect(first.body.data[0].error.code).to.equal(ISafeErrorCode.notFound)
    expect(sendMessage.calledOnce).to.be.true
    expect(getCode.calledOnce).to.be.true
    const missKey = Models.SafeCache.infoNotFoundKey(ETH, TOKEN)
    expect((await Models.SafeCache.findOne({ id: missKey }))?.result).to.deep.equal({ notFound: true })

    const second = await client.post('/v2/workspaces/query/accounts').send({ accounts })
    expect(second.body).to.deep.equal(first.body)
    await expect(
      SafeReadRequestModule.send({ sentAt: Date.now(), network: ETH, address: TOKEN, kind: ISafeReadKind.info }),
    ).to.be.rejectedWith(ErrorKeyEnum.safeNotFound)
    expect(sendMessage.calledOnce).to.be.true
    expect(getCode.calledOnce).to.be.true

    clock.tick(60_000)
    deployed = true
    const found = await client.post('/v2/workspaces/query/accounts').send({ accounts })
    expect(found.status).to.equal(200)
    expect(found.body.data[0]).to.include({ type: 'safe', status: 'available' })
    expect(found.body.data[0].safe).to.include({ address: TOKEN, nonce: '1' })
    expect(sendMessage.calledTwice).to.be.true
    expect(getCode.callCount).to.be.greaterThan(1)
    expect(await Models.SafeCache.findOne({ id: missKey })).to.be.null
  })

  it('keeps an unsupported network without publishing a Safe read', async () => {
    const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage')
    const response = await supertest(createApp().callback())
      .post('/v2/workspaces/query/accounts')
      .send({ accounts: [{ network: NetworksEnum.citreaMainnet, address: A }] })
    expect(response.status).to.equal(200)
    expect(response.body.data[0]).to.include({ type: 'unknown', status: 'unsupported', indexed: false })
    expect(response.body.data[0].error).to.deep.equal({ code: ISafeErrorCode.unsupportedChain })
    expect(sendMessage.called).to.equal(false)
  })

  it('returns an empty account list without a Safe read', async () => {
    const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage')
    const response = await supertest(createApp().callback())
      .post('/v2/workspaces/query/accounts')
      .send({ accounts: [] })
    expect(response.status).to.equal(200)
    expect(response.body.data).to.deep.equal([])
    expect(sendMessage.called).to.equal(false)
  })

  it('fails the request for an unrelated Safe read error', async () => {
    sandbox.stub(RabbitMQHelper, 'sendMessage').rejects(new Error('safeNotFound'))
    const response = await supertest(createApp().callback())
      .post('/v2/workspaces/query/accounts')
      .send({ accounts: [SCOPE[1]] })
    expect(response.status).to.equal(500)
    expect(response.body).to.deep.equal({ code: 'unknownError', description: 'Internal server error', status: 500 })
  })

  it('keeps governances and members when one Safe read fails', async () => {
    await Models.Dao.create({ ...DaoList[0], id: undefined, network: ETH, address: A, creatorAddress: B })
    const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves({
      safeError: { code: ISafeErrorCode.rateLimited, error: 'retry', status: 429, retryAfter: 30 },
    })
    const client = supertest(createApp().callback())
    for (const resource of ['governances', 'members']) {
      const response = await client.post(`/v2/workspaces/query/${resource}`).send({ accounts: SCOPE })
      expect(response.status).to.equal(200)
      expect(response.body.coverage.map((item: any) => item.status)).to.deep.equal(['available', 'unavailable'])
      expect(response.body.partial).to.equal(true)
    }
    expect(sendMessage.callCount).to.equal(2)
  })

  it('merges governance members and Safe owners while preserving their memberships', async () => {
    const member = '0x4444444444444444444444444444444444444444'
    await Models.Dao.create({ ...DaoList[0], id: undefined, network: ETH, address: A, creatorAddress: B })
    const plugin = {
      network: ETH,
      address: TOKEN,
      daoAddress: A,
      interfaceType: 'multisig',
      isBody: true,
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

  it('lists the body plugins of a DAO and the Safe of a selected Safe, but no process or stage body', async () => {
    const C = '0x5555555555555555555555555555555555555555'
    await Models.Dao.create({ ...DaoList[0], id: undefined, network: ETH, address: A, creatorAddress: B })
    await Models.Plugin.create({
      address: TOKEN,
      daoAddress: A,
      network: ETH,
      transactionHash: `0x${'1'.repeat(64)}`,
      blockNumber: 1,
      interfaceType: IPluginInterfaceType.spp,
      status: IPluginStatus.installed,
      isSupported: true,
    })
    await Models.Plugin.create({
      address: MULTISIG,
      daoAddress: A,
      network: ETH,
      transactionHash: `0x${'2'.repeat(64)}`,
      blockNumber: 1,
      interfaceType: IPluginInterfaceType.multisig,
      status: IPluginStatus.installed,
      isSupported: true,
      isProcess: true,
      isBody: true,
      name: 'Council',
      description: 'Elected council',
      processKey: 'COUNCIL',
    })
    await Models.PluginSlug.create({ network: ETH, daoAddress: A, pluginAddress: MULTISIG, slug: 'council' })
    // A Safe in an SPP stage belongs to the process, not to the DAO's body list.
    await Models.Setting.create({
      ...fakeSettings,
      id: 'spp-setting',
      network: ETH,
      daoAddress: A,
      pluginAddress: TOKEN,
      status: ISettingStatus.active,
      stages: [{ stageIndex: 0, plugins: [{ address: C, brandId: VotingBodyBrandIdentity.SAFE }] }],
    })
    sandbox.stub(SafeController, 'getInfo').resolves({
      address: B,
      owners: [A],
      threshold: 1,
      version: '1.4.1',
      nonce: '1',
      modules: [],
      guard: null,
      meta: { source: ISafeSource.chain, fetchedAt: new Date().toISOString(), stale: false },
    })

    const result = await WorkspaceController.getGovernances(
      await ValidationSchema.validateParams(WorkspaceSchema.governances, { accounts: SCOPE }),
    )
    // The SPP is a process and C is its stage body: neither is a body of the DAO.
    expect(result.data).to.deep.equal([
      {
        account: { network: ETH, address: A, type: 'dao' },
        governances: [
          {
            address: MULTISIG,
            type: IPluginInterfaceType.multisig,
            slug: 'council',
            name: 'Council',
            description: 'Elected council',
            processKey: 'COUNCIL',
          },
        ],
      },
      // A Safe account has no bodies: it is one itself, and its owners come from the members query.
      { account: { network: BASE, address: B, type: 'safe' }, governances: [] },
    ])
    expect(result.coverage.map(item => item.status)).to.deep.equal(['available', 'available'])
    expect(result.partial).to.equal(false)
  })

  it('reads members from body plugins only and filters them by body', async () => {
    const C = '0x5555555555555555555555555555555555555555'
    const signer = '0x4444444444444444444444444444444444444444'
    await Models.Dao.create({ ...DaoList[0], id: undefined, network: ETH, address: A, creatorAddress: B })
    await Models.Plugin.create({
      address: TOKEN,
      daoAddress: A,
      network: ETH,
      transactionHash: `0x${'1'.repeat(64)}`,
      blockNumber: 1,
      interfaceType: IPluginInterfaceType.spp,
      status: IPluginStatus.installed,
      isSupported: true,
      isBody: false,
    })
    await Models.Plugin.create({
      address: MULTISIG,
      daoAddress: A,
      network: ETH,
      transactionHash: `0x${'2'.repeat(64)}`,
      blockNumber: 1,
      interfaceType: IPluginInterfaceType.multisig,
      status: IPluginStatus.installed,
      isSupported: true,
      isProcess: true,
      isBody: true,
    })
    await Models.Setting.create({
      ...fakeSettings,
      id: 'spp-setting',
      network: ETH,
      daoAddress: A,
      pluginAddress: TOKEN,
      status: ISettingStatus.active,
      stages: [{ stageIndex: 0, plugins: [{ address: C, brandId: VotingBodyBrandIdentity.SAFE }] }],
    })
    const createFromPlugin = sandbox.stub(MemberGovernanceFactory, 'createFromPlugin').returns({
      findAndPaginateMembers: sandbox.stub().resolves({
        data: [{ address: signer, ens: null }],
        metadata: { page: 1, pageSize: 50, totalPages: 1, totalRecords: 1 },
      }),
    } as any)
    const readSafe = sandbox.stub(SafeController, 'getInfo')

    const accounts = [{ network: ETH, address: A }]
    const all = await WorkspaceController.getMembers(
      await ValidationSchema.validateParams(WorkspaceSchema.members, { accounts }),
    )
    // Only the multisig is read: the SPP has no member list and its stage Safe is not a body of the DAO.
    expect(createFromPlugin.args.map(([plugin]) => plugin.address)).to.deep.equal([MULTISIG])
    expect(readSafe.called).to.equal(false)
    expect(all.data.map(member => member.address)).to.deep.equal([signer])

    const byBody = await WorkspaceController.getMembers(
      await ValidationSchema.validateParams(WorkspaceSchema.members, {
        accounts,
        filters: { network: ETH, governanceAddress: MULTISIG },
      }),
    )
    expect(byBody.data.map(member => member.address)).to.deep.equal([signer])
    const byStageSafe = await WorkspaceController.getMembers(
      await ValidationSchema.validateParams(WorkspaceSchema.members, {
        accounts,
        filters: { network: ETH, governanceAddress: C },
      }),
    )
    expect(byStageSafe.data).to.deep.equal([])
  })

  it('lists a Safe holding execute permission as a governance and its owners as members', async () => {
    const SAFE = '0x7777777777777777777777777777777777777777'
    const owner = '0x4444444444444444444444444444444444444444'
    await Models.Dao.create({ ...DaoList[0], id: undefined, network: ETH, address: A, creatorAddress: B })
    // What the permission handler writes: a process of the DAO that is not a body of one.
    await Models.Plugin.create({
      address: SAFE,
      daoAddress: A,
      network: ETH,
      transactionHash: `0x${'3'.repeat(64)}`,
      blockNumber: 1,
      interfaceType: IPluginInterfaceType.safe,
      status: IPluginStatus.installed,
      isSupported: true,
      isProcess: true,
      isBody: false,
    })
    await Models.PluginSlug.create({ network: ETH, daoAddress: A, pluginAddress: SAFE, slug: 'safe' })
    // Both rows, because the owner seeding writes both and `SafeMember` reads the member through it.
    await BaseGovernance.ensureBaseMember(owner)
    await Models.SafeMember.create({ network: ETH, safeAddress: SAFE, memberAddress: owner })

    const accounts = [{ network: ETH, address: A }]
    const governances = await WorkspaceController.getGovernances(
      await ValidationSchema.validateParams(WorkspaceSchema.governances, { accounts }),
    )
    expect(governances.data[0].governances).to.deep.equal([
      {
        address: SAFE,
        type: IPluginInterfaceType.safe,
        slug: 'safe',
        name: null,
        description: null,
        processKey: null,
      },
    ])

    const members = await WorkspaceController.getMembers(
      await ValidationSchema.validateParams(WorkspaceSchema.members, { accounts }),
    )
    expect(members.data.map(member => member.address)).to.deep.equal([owner])
    expect(members.data[0].memberships).to.deep.equal([
      {
        account: { network: ETH, address: A },
        governance: { address: SAFE, type: IPluginInterfaceType.safe },
        role: 'owner',
      },
    ])
    expect(members.partial).to.equal(false)
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
