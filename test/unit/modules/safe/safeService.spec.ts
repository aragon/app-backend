import config from '@config'
import logger from '@logger'
import { SafeReadError } from '@modules/safe/safeError'
import * as SafeQueueParserModule from '@modules/safe/safeQueueParser'
import { NetworksEnum } from '@types'
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

  const loadService = () => {
    const cache: SafeCacheStub = {
      read: sandbox.stub().resolves(null),
      readExpired: sandbox.stub().resolves(null),
      write: sandbox.stub().resolves(),
      consumeBudget: sandbox.stub().resolves(true),
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
    sandbox.stub(logger, 'info')
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

  it('allocates above the highest queued nonce and floors at current chain nonce', async () => {
    const { service, cache, chain, txService } = loadService()
    chain.readNonce.onFirstCall().resolves('12').onSecondCall().resolves('30')
    txService.get
      .onFirstCall()
      .resolves(queuePage([transaction('9007199254740995')], 2))
      .onSecondCall()
      .resolves(queuePage([transaction('6')], 2))
      .onThirdCall()
      .resolves(queuePage([transaction('19')]))

    const aboveCurrent = await service.readNextNonce(NETWORK, ADDRESS)
    const aboveQueue = await service.readNextNonce(NETWORK, ADDRESS)

    expect(aboveCurrent.nextNonce).to.equal('9007199254740996')
    expect(aboveCurrent.currentNonce).to.equal('12')
    expect(aboveQueue.nextNonce).to.equal('30')
    expect(aboveQueue.currentNonce).to.equal('30')
    expect(chain.readNonce.callCount).to.equal(2)
    expect(txService.get.callCount).to.equal(3)
    expect(txService.get.firstCall.args[2]).to.include({ nonce__gte: '12' })
    expect(txService.get.secondCall.args[2]).to.include({ nonce__gte: '12', offset: 1 })
    expect(txService.get.thirdCall.args[2]).to.include({ nonce__gte: '30' })
    expect(cache.read.notCalled).to.equal(true)
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
      await service.readInfo(NetworksEnum.hemiMainnet, ADDRESS)
      expect.fail('expected unsupported chain')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal('unsupported-chain')
      expect((error as SafeReadError).status).to.equal(501)
    }

    expect(chain.readInfo.notCalled).to.equal(true)
  })
})
