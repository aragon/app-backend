import config from '@config'
import logger from '@logger'
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

    const service = proxyquire.noCallThru().noPreserveCache()('@modules/safe/safeService', {
      '@dbModels': {
        Models: {
          SafeCache: {
            cacheKey: (network: string, address: string, kind: string, page = '') =>
              `safe|${network}|${address}|${kind}${page ? `|${page}` : ''}`,
          },
        },
      },
      '@modules/safe/safeCache': { __esModule: true, default: cache },
      '@modules/safe/safeChainReader': { __esModule: true, default: chain },
      '@modules/safeTxService': { __esModule: true, default: txService },
      '@modules/safe/safeQueueParser': SafeQueueParserModule,
    }).default

    return { service, cache, chain, txService }
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

  it('fills the lowest hole in the live queue, paging the whole scan', async () => {
    const { service, cache, chain, txService } = loadService()
    // Each allocation reads the chain nonce twice: once to floor the scan, once after it.
    chain.readNonce.resolves('12')
    txService.get
      .onFirstCall()
      .resolves(queuePage([transaction('12')], 3))
      .onSecondCall()
      .resolves(queuePage([transaction('14')], 3))
      .onThirdCall()
      .resolves(queuePage([transaction('15')], 3))

    const result = await service.readNextNonce(NETWORK, ADDRESS)

    // 13 executes ahead of 14 and 15 and displaces nothing; the tail would have been 16.
    expect(result.nextNonce).to.equal('13')
    expect(result.currentNonce).to.equal('12')
    expect(chain.readNonce.callCount).to.equal(2)
    expect(txService.get.callCount).to.equal(3)
    expect(txService.get.firstCall.args[2]).to.include({ nonce__gte: '12' })
    expect(txService.get.secondCall.args[2]).to.include({ nonce__gte: '12', offset: 1 })
    expect(cache.read.notCalled).to.equal(true)
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
