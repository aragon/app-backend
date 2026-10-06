import config from '@config'
import logger from '@logger'
import SafeCache from '@models/schema/safeCache'
import { SafeReadError } from '@modules/safe/safeError'
import * as SafeQueueParserModule from '@modules/safe/safeQueueParser'
import { ISafeErrorCode, ISafeSource, NetworksEnum } from '@types'
import { expect } from 'chai'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const ADDRESS = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'
const OWNER = '0x1111111111111111111111111111111111111111'
const NETWORK = NetworksEnum.ethereumMainnet

const info = {
  address: ADDRESS,
  owners: [OWNER],
  threshold: 1,
  version: '1.4.1',
  nonce: '6',
  modules: [],
  guard: null,
}

const transaction = (nonce: string | number): Record<string, unknown> => ({
  safeTxHash: `0x${'a'.repeat(64)}`,
  nonce,
  proposer: OWNER,
  to: OWNER,
  value: '0',
  data: '0x',
  operation: 0,
  safeTxGas: '0',
  baseGas: '0',
  gasPrice: '0',
  gasToken: OWNER,
  refundReceiver: OWNER,
  confirmations: [],
  confirmationsRequired: 1,
  signatures: null,
  isExecuted: false,
  isSuccessful: null,
  submissionDate: '2026-08-26T12:00:00.000Z',
})

/** What the upstream adds once a transaction has executed, and only then. */
const executedTransaction = (nonce: string | number): Record<string, unknown> => ({
  ...transaction(nonce),
  confirmations: [{ owner: OWNER, signature: `0x${'c'.repeat(130)}`, submissionDate: '2026-08-26T12:00:00.000Z' }],
  isExecuted: true,
  isSuccessful: true,
  executionDate: '2026-08-26T12:00:00.000Z',
  transactionHash: `0x${'b'.repeat(64)}`,
})

const queuePage = (results: Array<Record<string, unknown>>, count = results.length) => ({
  count,
  next: null,
  previous: null,
  results,
})

type SafeCacheStub = {
  read: sinon.SinonStub
  readExpired: sinon.SinonStub
  write: sinon.SinonStub
  consumeBudget: sinon.SinonStub
  refundBudget: sinon.SinonStub
}

type SafeChainReaderStub = {
  readInfo: sinon.SinonStub
  readNonce: sinon.SinonStub
}

type SafeTxServiceStub = {
  get: sinon.SinonStub
}

describe('Module: safe/safeService', () => {
  let sandbox: SinonSandbox
  let clock: sinon.SinonFakeTimers
  let loggerInfo: sinon.SinonStub

  const loadService = () => {
    const cache: SafeCacheStub = {
      read: sandbox.stub().resolves(null),
      readExpired: sandbox.stub().resolves(null),
      write: sandbox.stub().resolves(),
      consumeBudget: sandbox.stub().resolves(true),
      refundBudget: sandbox.stub().resolves(undefined),
    }
    const chain: SafeChainReaderStub = {
      readInfo: sandbox.stub(),
      readNonce: sandbox.stub(),
    }
    const txService: SafeTxServiceStub = { get: sandbox.stub() }
    // Recording a page is gated on the Safe being one we track, so both sides are stubbed here:
    // tracked by default, because most of these tests are about the read, not the write.
    const tracking = { findDaosWithSafeBody: sandbox.stub().resolves([{ daoAddress: '0xdao' }]) }
    const transactions = { record: sandbox.stub().resolves(undefined), reconcileQueue: sandbox.stub().resolves(0) }
    const stored = { countDocuments: sandbox.stub().resolves(0) }
    // The per-Safe sync stamps. `findOneAndUpdate` returns the row before the pull, so a null stamp
    // means "never pulled" and every page below is newer; `updateOne` is the forward-only stamp write.
    const account = {
      buildId: (network: string, safeAddress: string) => `${network}-${safeAddress}`,
      findOneAndUpdate: sandbox.stub().returns({ lean: sandbox.stub().resolves(null) }),
      updateOne: sandbox.stub().resolves(undefined),
    }

    const service = proxyquire.noCallThru().noPreserveCache()('@modules/safe/safeService', {
      '@dbModels': {
        Models: {
          // The real key builders, not a copy: these keys are also read by the API to decide whether
          // a refresh is owed, so a spelling that only exists here would prove nothing.
          SafeCache: {
            cacheKey: SafeCache.cacheKey.bind(SafeCache),
            queuePage: SafeCache.queuePage.bind(SafeCache),
            historyPage: SafeCache.historyPage.bind(SafeCache),
          },
          SafeTransaction: stored,
          SafeAccount: account,
        },
      },
      '@modules/safe/safeCache': { __esModule: true, default: cache },
      '@modules/safe/safeChainReader': { __esModule: true, default: chain },
      '@modules/safeTxService': { __esModule: true, default: txService },
      '@modules/safe/safeBodyMembers': { __esModule: true, default: tracking },
      '@modules/safe/safeTransactions': { __esModule: true, default: transactions },
      '@modules/safe/safeQueueParser': SafeQueueParserModule,
    }).default

    return { service, cache, chain, txService, tracking, transactions, stored, account }
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    clock = sandbox.useFakeTimers(1000)
    loggerInfo = sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'error')
  })

  afterEach(() => sandbox.restore())

  it('serves info from cache after the first chain read', async () => {
    const { service, cache, chain } = loadService()
    chain.readInfo.resolves(info)

    const first = await service.readInfo(NETWORK, ADDRESS.toLowerCase())
    cache.read.onSecondCall().resolves({ result: first, fresh: true })
    const second = await service.readInfo(NETWORK, ADDRESS)

    expect(first.meta).to.include({ source: 'chain', stale: false })
    expect(second).to.deep.equal(first)
    expect(chain.readInfo.calledOnce).to.equal(true)
  })

  it('serves stale info when the fresh chain refresh fails', async () => {
    sandbox.stub(config.SAFE_API, 'INFO_CACHE_TTL').value(10)
    sandbox.stub(config.SAFE_API, 'INFO_STALE_WINDOW').value(20)
    const { service, cache, chain } = loadService()
    chain.readInfo.onFirstCall().resolves(info).onSecondCall().rejects(new Error('RPC down'))

    const first = await service.readInfo(NETWORK, ADDRESS)
    cache.read.onSecondCall().resolves({ result: first, fresh: false })
    clock.tick(10)
    const stale = await service.readInfo(NETWORK, ADDRESS)

    expect(stale.meta.stale).to.equal(true)
    expect(stale.nonce).to.equal('6')
    expect(chain.readInfo.callCount).to.equal(2)
  })

  it('serves a fresh queue cache hit without calling Safe API twice', async () => {
    const { service, cache, txService } = loadService()
    txService.get.resolves(queuePage([transaction(6)]))

    const first = await service.readQueue(NETWORK, ADDRESS, 20, 0)
    cache.read.onSecondCall().resolves({ result: first, fresh: true })
    const second = await service.readQueue(NETWORK, ADDRESS, 20, 0)

    expect(first.results[0].nonce).to.equal('6')
    expect(second.meta.stale).to.equal(false)
    expect(txService.get.calledOnce).to.equal(true)
  })

  it('syncs the queue and as many history pages as asked, and nothing for an untracked Safe', async () => {
    const { service, txService, transactions, tracking } = loadService()
    txService.get.resolves({ ...queuePage([transaction(6)]), next: 'more' })

    await service.syncStore(NETWORK, ADDRESS, 3)

    // the queue page reconciles, then three history pages while upstream still says there is more
    expect(txService.get.callCount).to.equal(4)
    expect(txService.get.firstCall.args[2]).to.include({ executed: false, limit: config.SAFE_API.BACKFILL_PAGE_SIZE })
    expect(txService.get.secondCall.args[2]).to.include({ executed: true, offset: 0 })
    expect(txService.get.lastCall.args[2]).to.include({
      executed: true,
      offset: 2 * config.SAFE_API.BACKFILL_PAGE_SIZE,
    })
    expect(transactions.reconcileQueue.calledOnce).to.equal(true)
    expect(transactions.record.callCount).to.equal(4)

    txService.get.resetHistory()
    transactions.record.resetHistory()
    tracking.findDaosWithSafeBody.resolves([])
    await service.syncStore(NETWORK, ADDRESS)

    expect(txService.get.notCalled).to.equal(true)
    expect(transactions.record.called).to.equal(false)
  })

  it('still reads the history on a poll when the queue read fails', async () => {
    const { service, txService, transactions } = loadService()
    txService.get.onFirstCall().rejects(new Error('Safe API down'))
    txService.get.onSecondCall().resolves(queuePage([transaction(6)]))

    await service.syncStore(NETWORK, ADDRESS)

    expect(txService.get.callCount).to.equal(2)
    expect(txService.get.secondCall.args[2]).to.include({ executed: true, offset: 0 })
    expect(transactions.record.getCalls().map(call => (call.args[2] as any[])[0].nonce)).to.deep.equal(['6'])
  })

  it('reads the history from upstream on a full-depth sync when the cached page is fresh', async () => {
    const { service, cache, txService, transactions, account } = loadService()
    const history = {
      ...queuePage([executedTransaction('5')]),
      meta: { source: 'safe-api', fetchedAt: new Date(0).toISOString(), stale: false },
    }
    // The stamp already covers the cached page, so only a newer read brings in what executed since.
    account.findOneAndUpdate.returns({ lean: sandbox.stub().resolves({ historyFetchedAt: new Date(0) }) })
    cache.read.callsFake(async (key: string) => (key.includes('|history|') ? { result: history, fresh: true } : null))
    txService.get.onFirstCall().resolves(queuePage([]))
    txService.get.onSecondCall().resolves(queuePage([executedTransaction('6')]))

    await service.syncStore(NETWORK, ADDRESS, 2)

    const historyFetches = txService.get.getCalls().filter(call => (call.args[2] as any).executed === true)
    const stored = transactions.record.getCalls().find(call => (call.args[2] as any[]).some(row => row.isExecuted))
    expect(historyFetches).to.have.length(1)
    expect((stored?.args[2] as any[])[0].nonce).to.equal('6')
  })

  it('does not re-store a fresh cached history page on a one-page poll', async () => {
    const { service, cache, txService, transactions, account } = loadService()
    const history = {
      ...queuePage([executedTransaction('5')]),
      meta: { source: 'safe-api', fetchedAt: '2026-08-26T12:00:00.000Z', stale: false },
    }
    // The stamp already covers this page's time, so a poll must not store it again.
    account.findOneAndUpdate.returns({
      lean: sandbox.stub().resolves({ historyFetchedAt: new Date('2026-08-26T12:00:00.000Z') }),
    })
    cache.read.callsFake(async (key: string) => (key.includes('|history|') ? { result: history, fresh: true } : null))
    txService.get.resolves(queuePage([]))

    await service.syncStore(NETWORK, ADDRESS, 1)

    const historyFetches = txService.get.getCalls().filter(call => (call.args[2] as any).executed === true)
    const storedHistory = transactions.record
      .getCalls()
      .some(call => (call.args[2] as any[]).some(row => row.isExecuted))
    expect(historyFetches).to.have.length(0)
    expect(storedHistory).to.equal(false)
  })

  it('serves stale queue data when an upstream refresh fails', async () => {
    sandbox.stub(config.SAFE_API, 'QUEUE_CACHE_TTL').value(10)
    sandbox.stub(config.SAFE_API, 'QUEUE_STALE_WINDOW').value(20)
    const { service, cache, txService } = loadService()
    txService.get
      .onFirstCall()
      .resolves(queuePage([transaction(6)]))
      .onSecondCall()
      .rejects(new Error('Safe API down'))

    const first = await service.readQueue(NETWORK, ADDRESS, 20, 0)
    cache.read.onSecondCall().resolves({ result: first, fresh: false })
    clock.tick(10)
    const stale = await service.readQueue(NETWORK, ADDRESS, 20, 0)

    expect(stale.meta.stale).to.equal(true)
    expect(stale.results[0].nonce).to.equal('6')
    expect(txService.get.callCount).to.equal(2)
  })

  it('serves retained stale queue data when the hourly budget is exhausted', async () => {
    sandbox.stub(config.SAFE_API, 'BUDGET_GLOBAL_PER_HOUR').value(1)
    sandbox.stub(config.SAFE_API, 'QUEUE_CACHE_TTL').value(10)
    sandbox.stub(config.SAFE_API, 'QUEUE_STALE_WINDOW').value(20)
    const { service, cache, txService } = loadService()
    txService.get.resolves(queuePage([transaction(6)]))

    const first = await service.readQueue(NETWORK, ADDRESS, 20, 0)
    cache.read.onSecondCall().resolves(null)
    cache.readExpired.resolves({ result: first, fresh: false })
    cache.consumeBudget.onSecondCall().resolves(false)
    clock.tick(30)
    const stale = await service.readQueue(NETWORK, ADDRESS, 20, 0)

    expect(stale.meta.stale).to.equal(true)
    expect(txService.get.calledOnce).to.equal(true)
    expect(loggerInfo.lastCall.calledWith('safe.usage', sinon.match({ cache: 'stale', upstreamCalls: 0 }))).to.equal(
      true,
    )
  })

  it('reads executed transactions newest-first and forwards every filter', async () => {
    const { service, txService } = loadService()
    txService.get.resolves(queuePage([executedTransaction('5')]))

    const result = await service.readHistory(NETWORK, ADDRESS, {
      limit: 10,
      offset: 0,
      to: OWNER,
      nonceGte: '3',
      nonceLte: '9',
    })

    expect(result.results[0].isExecuted).to.equal(true)
    expect(result.results[0].executionDate).to.equal('2026-08-26T12:00:00.000Z')
    expect(result.results[0].transactionHash).to.equal(`0x${'b'.repeat(64)}`)
    expect(txService.get.firstCall.args[2]).to.include({
      executed: true,
      limit: 10,
      offset: 0,
      ordering: '-nonce',
      to: OWNER,
      nonce__gte: '3',
      nonce__lte: '9',
    })
  })

  it('omits absent history filters rather than sending them as undefined', async () => {
    const { service, txService } = loadService()
    txService.get.resolves(queuePage([]))

    await service.readHistory(NETWORK, ADDRESS, { limit: 20, offset: 0 })

    const params = txService.get.firstCall.args[2] as Record<string, unknown>
    expect(params).to.include({ executed: true })
    expect(params).to.not.have.property('to')
    expect(params).to.not.have.property('nonce__gte')
    expect(params).to.not.have.property('nonce__lte')
  })

  it('keys the history cache by every filter so one caller cannot be served another window', async () => {
    const { service, cache, txService } = loadService()
    txService.get.resolves(queuePage([]))

    // Each variant differs from the baseline in exactly one dimension. A key builder that dropped
    // any one of them would serve a narrowed page to a caller who asked for a different scan.
    const base = { limit: 20, offset: 0 }
    await service.readHistory(NETWORK, ADDRESS, base)
    await service.readHistory(NETWORK, ADDRESS, { ...base, nonceGte: '3' })
    await service.readHistory(NETWORK, ADDRESS, { ...base, nonceGte: '4' })
    await service.readHistory(NETWORK, ADDRESS, { ...base, nonceLte: '9' })
    await service.readHistory(NETWORK, ADDRESS, { ...base, to: OWNER })
    await service.readHistory(NETWORK, ADDRESS, { ...base, limit: 10 })
    await service.readHistory(NETWORK, ADDRESS, { ...base, offset: 10 })

    const keys = cache.write.getCalls().map(call => call.args[0] as string)

    expect(txService.get.callCount).to.equal(7)
    expect(new Set(keys).size).to.equal(7)
  })

  it('keeps a read of a tracked Safe away from the store and the stamps', async () => {
    const { service, txService, transactions, account } = loadService()
    txService.get.resolves(queuePage([transaction(6)]))

    await service.readQueue(NETWORK, ADDRESS, 20, 0)
    await service.readHistory(NETWORK, ADDRESS, { limit: 20, offset: 0 })

    expect(transactions.record.called).to.equal(false)
    expect(transactions.reconcileQueue.called).to.equal(false)
    expect(account.findOneAndUpdate.called).to.equal(false)
    expect(account.updateOne.called).to.equal(false)
  })

  it('stamps queueFetchedAt with queueComplete and historyFetchedAt after a sync', async () => {
    const { service, txService, account } = loadService()
    txService.get.onFirstCall().resolves(queuePage([transaction(6)]))
    txService.get.onSecondCall().resolves(queuePage([executedTransaction('5')]))

    await service.syncStore(NETWORK, ADDRESS, 1)

    const stamps = account.updateOne.getCalls().map(call => call.args[1].$set)
    expect(stamps).to.deep.equal([
      { queueFetchedAt: new Date(1000), queueComplete: true },
      { historyFetchedAt: new Date(1000) },
    ])
  })

  it('moves queueFetchedAt even when the queue page is empty', async () => {
    const { service, txService, account } = loadService()
    txService.get.resolves(queuePage([]))

    await service.syncStore(NETWORK, ADDRESS, 1)

    const queueStamp = account.updateOne.getCalls().find(call => 'queueFetchedAt' in call.args[1].$set)
    expect(queueStamp?.args[1].$set).to.deep.equal({ queueFetchedAt: new Date(1000), queueComplete: true })
  })

  it('sets queueComplete false when the queue spills past one page', async () => {
    const { service, txService, account } = loadService()
    // more than one page: `next` is set and the count is larger than the results
    txService.get.onFirstCall().resolves({ ...queuePage([transaction(6)], 5), next: 'more' })
    txService.get.onSecondCall().resolves(queuePage([]))

    await service.syncStore(NETWORK, ADDRESS, 1)

    const queueStamp = account.updateOne.getCalls().find(call => 'queueFetchedAt' in call.args[1].$set)
    expect(queueStamp?.args[1].$set.queueComplete).to.equal(false)
  })

  it('does not store or stamp a queue page the stamp already covers', async () => {
    const { service, txService, transactions, account } = loadService()
    // The row was pulled at the same instant this page carries, so the queue holds nothing newer.
    account.findOneAndUpdate.returns({ lean: sandbox.stub().resolves({ queueFetchedAt: new Date(1000) }) })
    txService.get.onFirstCall().resolves(queuePage([transaction(6)]))
    txService.get.onSecondCall().resolves(queuePage([executedTransaction('5')]))

    await service.syncStore(NETWORK, ADDRESS, 1)

    const queueStamp = account.updateOne.getCalls().find(call => 'queueFetchedAt' in call.args[1].$set)
    expect(queueStamp, 'an already-covered queue page was stamped again').to.equal(undefined)
    expect(transactions.reconcileQueue.called).to.equal(false)
    // only the history page reaches the store
    const recordedNonces = transactions.record.getCalls().map(call => (call.args[2] as any[])[0].nonce)
    expect(recordedNonces).to.deep.equal(['5'])
  })

  it('stores the queue page and the history page the sync reads', async () => {
    const { service, txService, transactions } = loadService()
    txService.get.onFirstCall().resolves({ ...queuePage([transaction(6)]), next: 'more' })
    txService.get.onSecondCall().resolves(queuePage([executedTransaction('5')]))

    await service.syncStore(NETWORK, ADDRESS, 2)

    // A freshly fetched page is stamped with the read time, so both records carry now.
    const queueRecord = transactions.record.firstCall
    expect((queueRecord.args[2] as any[])[0].nonce).to.equal('6')
    expect(queueRecord.args[3]).to.equal(1000)
    const historyRecord = transactions.record.lastCall
    expect((historyRecord.args[2] as any[])[0].isExecuted).to.equal(true)
    expect(historyRecord.args[3]).to.equal(1000)
    expect(transactions.reconcileQueue.calledOnce).to.equal(true)
  })

  it('rejects a full-depth job when the queue read throws', async () => {
    const { service, txService, transactions } = loadService()
    txService.get.rejects(new SafeReadError(ISafeErrorCode.rateLimited, 'quota', 429, 30))

    await expect(service.syncStore(NETWORK, ADDRESS, 2)).to.be.rejected

    expect(transactions.record.called).to.equal(false)
    expect(transactions.reconcileQueue.called).to.equal(false)
  })

  it('rejects when recording a page fails', async () => {
    const { service, txService, transactions } = loadService()
    txService.get.resolves(queuePage([transaction(6)]))
    transactions.record.rejects(new Error('database down'))

    await expect(service.syncStore(NETWORK, ADDRESS, 2)).to.be.rejectedWith('database down')
  })

  it('stores nothing from a stale queue answer but still reads the history', async () => {
    const { service, cache, txService, transactions, account } = loadService()
    const stale = {
      ...queuePage([transaction(6)]),
      meta: { source: 'safe-api', fetchedAt: '2026-08-26T12:00:00.000Z', stale: false },
    }
    // The queue read fails and falls back to the stale cache; the history fetches succeed.
    cache.read.callsFake(async (key: string) => (key.includes('|queue|') ? { result: stale, fresh: false } : null))
    txService.get.onCall(0).rejects(new Error('Safe API down'))
    txService.get.onCall(1).resolves({ ...queuePage([executedTransaction('5')]), next: 'more' })
    txService.get.onCall(2).resolves(queuePage([executedTransaction('5')]))

    await service.syncStore(NETWORK, ADDRESS, 2)

    expect(transactions.reconcileQueue.called).to.equal(false)
    const queueStamp = account.updateOne.getCalls().find(call => 'queueFetchedAt' in call.args[1].$set)
    expect(queueStamp, 'a stale queue answer moved the stamp').to.equal(undefined)
    const recordedNonces = transactions.record.getCalls().map(call => (call.args[2] as any[])[0].nonce)
    expect(recordedNonces).to.deep.equal(['5', '5'])
  })

  it('re-reads history page 0 past the cache when a row was removed, and records it', async () => {
    const { service, cache, txService, transactions } = loadService()
    const history = {
      ...queuePage([executedTransaction(6)]),
      meta: { source: 'safe-api', fetchedAt: '2026-08-26T12:00:00.000Z', stale: false },
    }
    // A fresh cache exists, but the removal forces a real read past it.
    cache.read.callsFake(async (key: string) => (key.includes('|history|') ? { result: history, fresh: true } : null))
    transactions.reconcileQueue.resolves(1)
    txService.get.onFirstCall().resolves(queuePage([]))
    txService.get.onSecondCall().resolves(queuePage([executedTransaction(6)]))

    await service.syncStore(NETWORK, ADDRESS, 1)

    const historyCacheReads = cache.read.getCalls().filter(call => String(call.args[0]).includes('|history|'))
    expect(historyCacheReads, 'the fresh cache was not bypassed').to.have.length(0)
    const executedRecords = transactions.record
      .getCalls()
      .filter(call => (call.args[2] as any[]).some(row => row.isExecuted))
    expect(executedRecords, 'the bypass page was not stored').to.have.length(1)
  })

  it('resolves without recording when the bypass re-read is refused or stale', async () => {
    const { service, cache, txService, transactions } = loadService()
    const staleHistory = {
      ...queuePage([executedTransaction(6)]),
      meta: { source: 'safe-api', fetchedAt: '2026-08-26T12:00:00.000Z', stale: false },
    }
    // Queue read is fine and removes a row, but the forced history re-read fails and only a stale
    // page is left, so nothing is stored.
    cache.readExpired.resolves({ result: staleHistory, fresh: false })
    transactions.reconcileQueue.resolves(1)
    txService.get.onFirstCall().resolves(queuePage([]))
    txService.get.onSecondCall().rejects(new Error('Safe API down'))

    await service.syncStore(NETWORK, ADDRESS, 1)

    const executedRecords = transactions.record
      .getCalls()
      .filter(call => (call.args[2] as any[]).some(row => row.isExecuted))
    expect(executedRecords, 'a refused or stale bypass answer was stored').to.have.length(0)
  })

  it('answers for a Safe we do not track without writing anything down', async () => {
    // `/v2/safe/*` is unauthenticated and open to any origin, and these rows are permanent. Ungated,
    // a stranger could make us store a row for every Safe on the chain. A workspace query passes its
    // addresses in the request body and is served live for the same reason.
    const { service, txService, tracking, transactions } = loadService()
    tracking.findDaosWithSafeBody.resolves([])
    txService.get.resolves(queuePage([transaction(7)]))

    const page = await service.readQueue(NETWORK, ADDRESS, 20, 0)
    await clock.tickAsync(0)

    expect(page.results).to.have.length(1)
    expect(transactions.record.called).to.be.false
  })

  it('separates the queue and history caches for identical pagination', async () => {
    // Same Safe, same page, different read kind: sharing a key would serve executed transactions as
    // the live queue, which drives the signing CTA.
    const { service, cache, txService } = loadService()
    txService.get.resolves(queuePage([]))

    await service.readQueue(NETWORK, ADDRESS, 20, 0)
    await service.readHistory(NETWORK, ADDRESS, { limit: 20, offset: 0 })

    const keys = cache.write.getCalls().map(call => call.args[0] as string)

    expect(keys[0]).to.not.equal(keys[1])
    expect(keys[0]).to.contain('|queue|')
    expect(keys[1]).to.contain('|history|')
  })

  it('caches history far longer than the live queue', async () => {
    const { service, cache, txService } = loadService()
    txService.get.resolves(queuePage([executedTransaction('5')]))

    await service.readHistory(NETWORK, ADDRESS, { limit: 20, offset: 0 })

    // Immutable once executed, so the write carries the history windows, not the queue's.
    expect(cache.write.firstCall.args[3]).to.equal(config.SAFE_API.HISTORY_CACHE_TTL)
    expect(cache.write.firstCall.args[4]).to.equal(config.SAFE_API.HISTORY_STALE_WINDOW)
  })

  it('rejects a full-depth job when a history page fails, keeping what earlier pages stored', async () => {
    const { service, txService, transactions } = loadService()
    // call 0 is the queue, calls 1 and 2 are history pages 0 and 1, call 3 is history page 2
    txService.get
      .onCall(0)
      .resolves({ ...queuePage([transaction(6)]), next: 'more' })
      .onCall(1)
      .resolves({ ...queuePage([executedTransaction('5')]), next: 'more' })
      .onCall(2)
      .resolves({ ...queuePage([executedTransaction('5')]), next: 'more' })
      .onCall(3)
      .rejects(new Error('Safe API down'))

    await expect(service.syncStore(NETWORK, ADDRESS, 3)).to.be.rejected

    // page 2 threw, but the queue page and history pages 0 and 1 were already recorded
    const recordedNonces = transactions.record.getCalls().map(call => (call.args[2] as any[])[0].nonce)
    expect(recordedNonces).to.deep.equal(['6', '5', '5'])
    expect(txService.get.callCount).to.equal(4)
  })

  it('serves stale history when the upstream is rate limited', async () => {
    const { service, cache, txService } = loadService()
    txService.get.resolves(queuePage([executedTransaction('5')]))

    const first = await service.readHistory(NETWORK, ADDRESS, { limit: 20, offset: 0 })
    cache.read.resolves(null)
    cache.readExpired.resolves({ result: first, fresh: false })
    txService.get.rejects(new SafeReadError(ISafeErrorCode.rateLimited, 'quota', 429, 30))

    const stale = await service.readHistory(NETWORK, ADDRESS, { limit: 20, offset: 0 })

    expect(stale.meta.stale).to.equal(true)
    expect(stale.results[0].transactionHash).to.equal(`0x${'b'.repeat(64)}`)
  })

  it('rejects a malformed history payload when no stale value exists', async () => {
    const { service, txService } = loadService()
    txService.get.resolves({ count: 1, next: null, previous: null, results: [{ nope: true }] })

    try {
      await service.readHistory(NETWORK, ADDRESS, { limit: 20, offset: 0 })
      expect.fail('expected invalid response')
    } catch (error) {
      expect((error as SafeReadError).code).to.equal(ISafeErrorCode.invalidResponse)
      expect((error as SafeReadError).status).to.equal(502)
    }
  })

  it('coalesces concurrent cold queue reads into one Safe API call', async () => {
    // The project targets ES2020, whose lib does not declare Promise.withResolvers.
    let resolveRequest: ((value: unknown) => void) | undefined
    const pendingRequest = new Promise<unknown>(resolve => {
      resolveRequest = resolve
    })
    const { service, txService } = loadService()
    txService.get.callsFake(() => pendingRequest)

    const first = service.readQueue(NETWORK, ADDRESS, 20, 0)
    const second = service.readQueue(NETWORK, ADDRESS, 20, 0)
    resolveRequest?.(queuePage([transaction(6)]))

    const results = await Promise.all([first, second])

    expect(results[0].results[0].nonce).to.equal('6')
    expect(results[1].results[0].nonce).to.equal('6')
    expect(txService.get.calledOnce).to.equal(true)
  })

  it('does not overcount upstream calls for a coalesced stale fallback', async () => {
    const stale = {
      ...queuePage([]),
      meta: { source: ISafeSource.safeApi, fetchedAt: '2026-08-26T12:00:00.000Z', stale: false },
    }
    let rejectRequest: ((reason?: unknown) => void) | undefined
    const pendingRequest = new Promise<unknown>((_resolve, reject) => {
      rejectRequest = reject
    })
    const { service, cache, txService } = loadService()
    cache.read.resolves({ result: stale, fresh: false })
    txService.get.callsFake(() => pendingRequest)

    const first = service.readQueue(NETWORK, ADDRESS, 20, 0)
    const second = service.readQueue(NETWORK, ADDRESS, 20, 0)
    rejectRequest?.(new Error('Safe API down'))
    await Promise.all([first, second])

    const usage = loggerInfo
      .getCalls()
      .filter(call => call.args[0] === 'safe.usage')
      .map(call => (call.args[1] as { upstreamCalls: number }).upstreamCalls)
    expect(usage).to.deep.equal([1, 0])
    expect(txService.get.calledOnce).to.equal(true)
  })

  it('starts a fresh request after a failed one rather than coalescing onto it', async () => {
    // If a rejected promise leaked into `inFlight`, every later read of that key would attach to a
    // permanently rejected request and fail instantly until the process restarted.
    let rejectRequest: ((reason?: unknown) => void) | undefined
    const failing = new Promise<unknown>((_resolve, reject) => {
      rejectRequest = reject
    })
    const { service, txService } = loadService()
    txService.get.onFirstCall().callsFake(() => failing)
    txService.get.onSecondCall().resolves(queuePage([transaction(6)]))

    const first = service.readQueue(NETWORK, ADDRESS, 20, 0)
    rejectRequest?.(new Error('Safe API down'))
    await first.catch(() => undefined)

    const second = await service.readQueue(NETWORK, ADDRESS, 20, 0)

    expect(second.results).to.have.lengthOf(1)
    expect(txService.get.callCount).to.equal(2)
  })

  it('coalesces concurrent cold history reads into one Safe API call', async () => {
    // History shares `readCachedPage` with the queue, so this proves the wiring, not the helper.
    let resolveRequest: ((value: unknown) => void) | undefined
    const pendingRequest = new Promise<unknown>(resolve => {
      resolveRequest = resolve
    })
    const { service, txService } = loadService()
    txService.get.callsFake(() => pendingRequest)

    const first = service.readHistory(NETWORK, ADDRESS, { limit: 20, offset: 0 })
    const second = service.readHistory(NETWORK, ADDRESS, { limit: 20, offset: 0 })
    resolveRequest?.(queuePage([executedTransaction('5')]))
    const [a, b] = await Promise.all([first, second])

    expect(a).to.deep.equal(b)
    expect(txService.get.calledOnce).to.equal(true)
  })

  it('reserves the tail of the hourly budget for nonce allocation', async () => {
    const { service, cache, chain, txService } = loadService()
    chain.readNonce.resolves('12')
    txService.get.resolves(queuePage([]))

    await service.readQueue(NETWORK, ADDRESS, 20, 0)
    await service.readHistory(NETWORK, ADDRESS, { limit: 20, offset: 0 })
    await service.readNextNonce(NETWORK, ADDRESS)

    const reservations = cache.consumeBudget.getCalls().map(call => call.args[1] as string)

    // Page reads share the throttled share; the nonce scan may spend the reserved remainder,
    // because a refusal there stops every DAO from proposing a Safe transaction at all.
    expect(reservations).to.deep.equal(['page', 'page', 'nonce'])
  })

  it('refunds a budget unit when the limiter drops the call before it reaches upstream', async () => {
    const { service, cache, txService } = loadService()
    txService.get.rejects(
      new SafeReadError(ISafeErrorCode.rateLimited, 'Too many Safe reads in flight right now', 429, 10, false),
    )

    await service.readQueue(NETWORK, ADDRESS, 20, 0).catch(() => undefined)

    expect(cache.refundBudget.calledOnce).to.equal(true)
  })

  it('keeps the budget charged when the Safe API itself rate limits us', async () => {
    // Same code and status as a limiter drop, but the call was made and upstream quota was spent.
    // Refunding here would undercount real calls and let the hour overspend.
    const { service, cache, txService } = loadService()
    txService.get.rejects(new SafeReadError(ISafeErrorCode.rateLimited, 'upstream quota', 429, 60))

    await service.readQueue(NETWORK, ADDRESS, 20, 0).catch(() => undefined)

    expect(cache.refundBudget.notCalled).to.equal(true)
  })

  it('rejects a malformed queue response when no stale value exists', async () => {
    const { service, txService } = loadService()
    txService.get.resolves({ invalid: true })

    try {
      await service.readQueue(NETWORK, ADDRESS, 20, 0)
      expect.fail('expected invalid response')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal('invalid-response')
      expect((error as SafeReadError).status).to.equal(502)
    }
  })

  it('fills the lowest hole in the live queue, paging the scan by a descending nonce bound', async () => {
    const { service, cache, chain, txService } = loadService()
    // A configured limit of one is raised to two so every full page can be checked for ordering.
    sandbox.stub(config.SAFE_API, 'NEXT_NONCE_SCAN_LIMIT').value(1)
    // Each allocation reads the chain nonce twice: once to floor the scan, once after it.
    chain.readNonce.resolves('12')
    txService.get
      .onFirstCall()
      .resolves(queuePage([transaction('15'), transaction('14')], 3))
      .onSecondCall()
      .resolves(queuePage([transaction('12')], 3))

    const result = await service.readNextNonce(NETWORK, ADDRESS)

    // 13 executes ahead of 14 and 15 and displaces nothing; the tail would have been 16.
    expect(result.nextNonce).to.equal('13')
    expect(result.currentNonce).to.equal('12')
    expect(chain.readNonce.callCount).to.equal(2)
    expect(txService.get.callCount).to.equal(2)
    // Deletions between pages shift offsets but not a nonce bound, so the scan pages by
    // `nonce__lte = lowestSeen - 1` and cannot skip a still-queued nonce.
    expect(txService.get.firstCall.args[2]).to.include({ nonce__gte: '12' })
    expect(txService.get.firstCall.args[2]).to.include({ limit: 2 })
    expect(txService.get.firstCall.args[2]).to.not.have.property('nonce__lte')
    expect(txService.get.secondCall.args[2]).to.include({ nonce__gte: '12', nonce__lte: '13' })
    expect(cache.read.notCalled).to.equal(true)
  })

  it('rejects an unsorted nonce scan page instead of skipping occupied nonces', async () => {
    const { service, chain, txService } = loadService()
    sandbox.stub(config.SAFE_API, 'NEXT_NONCE_SCAN_LIMIT').value(3)
    chain.readNonce.resolves('41')
    txService.get.resolves(queuePage([transaction('41'), transaction('45'), transaction('46')], 6))

    try {
      await service.readNextNonce(NETWORK, ADDRESS)
      expect.fail('expected invalid response')
    } catch (error) {
      if (!SafeReadError.isSafeReadError(error)) throw error
      expect(error.code).to.equal(ISafeErrorCode.invalidResponse)
      expect(error.status).to.equal(502)
    }

    expect(txService.get.calledOnce).to.equal(true)
  })

  it('allocates the tail when the queue is gapless, past the safe-integer boundary', async () => {
    const { service, chain, txService } = loadService()
    chain.readNonce.resolves('9007199254740993')
    txService.get.resolves(queuePage([transaction('9007199254740993'), transaction('9007199254740994')]))

    const result = await service.readNextNonce(NETWORK, ADDRESS)

    expect(result.nextNonce).to.equal('9007199254740995')
    expect(result.currentNonce).to.equal('9007199254740993')
  })

  it('never allocates a nonce the Safe has already spent', async () => {
    // `executed=false` still returns transactions below the current nonce: they are permanently
    // dead, and a hole among them is dead with them.
    const { service, chain, txService } = loadService()
    chain.readNonce.resolves('30')
    txService.get.resolves(queuePage([transaction('19')]))

    const result = await service.readNextNonce(NETWORK, ADDRESS)

    expect(result.nextNonce).to.equal('30')
    expect(result.currentNonce).to.equal('30')
  })

  it('does not hand back a nonce the Safe consumed while the queue was paging', async () => {
    // The scan waits on the budget gate and the limiter per page, so it can take seconds. If a
    // queued transaction executes in that window the pre-scan floor is already spent, and an empty
    // remaining queue would otherwise return a dead nonce - the failure this read exists to avoid.
    const { service, chain, txService } = loadService()
    chain.readNonce.onFirstCall().resolves('6').onSecondCall().resolves('7')
    txService.get.resolves(queuePage([]))

    const result = await service.readNextNonce(NETWORK, ADDRESS)

    expect(result.nextNonce).to.equal('7')
    expect(result.currentNonce).to.equal('7')
  })

  it('never reads next-nonce from the cache', async () => {
    const { service, chain, txService, cache } = loadService()
    chain.readNonce.resolves('12')
    txService.get.resolves(queuePage([]))

    await service.readNextNonce(NETWORK, ADDRESS)
    await service.readNextNonce(NETWORK, ADDRESS)

    expect(txService.get.callCount).to.equal(2)
    expect(cache.read.notCalled).to.equal(true)
  })

  it('propagates a chain failure when no stale info exists', async () => {
    const { service, chain } = loadService()
    const error = new Error('RPC down')
    chain.readInfo.rejects(error)

    try {
      await service.readInfo(NETWORK, ADDRESS)
      expect.fail('expected chain failure')
    } catch (caught) {
      expect(caught).to.equal(error)
    }
  })

  it('rejects an unsupported chain before any read', async () => {
    const { service, chain } = loadService()

    try {
      await service.readInfo(NetworksEnum.citreaMainnet, ADDRESS)
      expect.fail('expected unsupported chain')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal('unsupported-chain')
      expect((error as SafeReadError).status).to.equal(501)
    }

    expect(chain.readInfo.notCalled).to.equal(true)
  })
})
