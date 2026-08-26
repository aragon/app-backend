import config from '@config'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import SafeChainReaderModule from '@modules/safe/safeChainReader'
import SafeCacheModule from '@modules/safe/safeCache'
import { SafeReadError } from '@modules/safe/safeError'
import SafeServiceModule from '@modules/safe/safeService'
import SafeTxServiceModule from '@modules/safeTxService'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
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

describe('Module: safe/safeService', () => {
  let sandbox: SinonSandbox
  let clock: sinon.SinonFakeTimers

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    clock = sandbox.useFakeTimers(1000)
    SafeCacheModule.reset()
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({ schedule: (fn: () => unknown) => fn() } as never)
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    SafeCacheModule.reset()
    sandbox.restore()
  })

  it('serves info from cache after the first chain read', async () => {
    const readInfo = sandbox.stub(SafeChainReaderModule, 'readInfo').resolves(info)

    const first = await SafeServiceModule.readInfo(NETWORK, ADDRESS.toLowerCase())
    const second = await SafeServiceModule.readInfo(NETWORK, ADDRESS)

    expect(first.meta).to.include({ source: 'chain', stale: false })
    expect(second).to.deep.equal(first)
    expect(readInfo.calledOnce).to.equal(true)
  })

  it('serves stale info when the fresh chain refresh fails', async () => {
    sandbox.stub(config.SAFE_API, 'INFO_CACHE_TTL').value(10)
    sandbox.stub(config.SAFE_API, 'INFO_STALE_WINDOW').value(20)
    const readInfo = sandbox
      .stub(SafeChainReaderModule, 'readInfo')
      .onFirstCall()
      .resolves(info)
      .onSecondCall()
      .rejects(new Error('RPC down'))

    await SafeServiceModule.readInfo(NETWORK, ADDRESS)
    clock.tick(10)
    const stale = await SafeServiceModule.readInfo(NETWORK, ADDRESS)

    expect(stale.meta.stale).to.equal(true)
    expect(stale.nonce).to.equal('6')
    expect(readInfo.callCount).to.equal(2)
  })

  it('serves a fresh queue cache hit without calling Safe API twice', async () => {
    const get = sandbox.stub(SafeTxServiceModule, 'get').resolves(queuePage([transaction(6)]))

    const first = await SafeServiceModule.readQueue(NETWORK, ADDRESS, 20, 0)
    const second = await SafeServiceModule.readQueue(NETWORK, ADDRESS, 20, 0)

    expect(first.results[0].nonce).to.equal('6')
    expect(second.meta.stale).to.equal(false)
    expect(get.calledOnce).to.equal(true)
  })

  it('serves stale queue data when an upstream refresh fails', async () => {
    sandbox.stub(config.SAFE_API, 'QUEUE_CACHE_TTL').value(10)
    sandbox.stub(config.SAFE_API, 'QUEUE_STALE_WINDOW').value(20)
    const get = sandbox
      .stub(SafeTxServiceModule, 'get')
      .onFirstCall()
      .resolves(queuePage([transaction(6)]))
      .onSecondCall()
      .rejects(new Error('Safe API down'))

    await SafeServiceModule.readQueue(NETWORK, ADDRESS, 20, 0)
    clock.tick(10)
    const stale = await SafeServiceModule.readQueue(NETWORK, ADDRESS, 20, 0)

    expect(stale.meta.stale).to.equal(true)
    expect(stale.results[0].nonce).to.equal('6')
    expect(get.callCount).to.equal(2)
  })

  it('serves retained stale queue data when the hourly budget is exhausted', async () => {
    sandbox.stub(config.SAFE_API, 'BUDGET_GLOBAL_PER_HOUR').value(1)
    sandbox.stub(config.SAFE_API, 'QUEUE_CACHE_TTL').value(10)
    sandbox.stub(config.SAFE_API, 'QUEUE_STALE_WINDOW').value(20)
    const get = sandbox.stub(SafeTxServiceModule, 'get').resolves(queuePage([transaction(6)]))

    await SafeServiceModule.readQueue(NETWORK, ADDRESS, 20, 0)
    clock.tick(30)
    const stale = await SafeServiceModule.readQueue(NETWORK, ADDRESS, 20, 0)

    expect(stale.meta.stale).to.equal(true)
    expect(get.calledOnce).to.equal(true)
  })

  it('coalesces concurrent cold queue reads into one Safe API call', async () => {
    let release: ((value: unknown) => void) | undefined
    const get = sandbox.stub(SafeTxServiceModule, 'get').callsFake(
      () =>
        new Promise(resolve => {
          release = resolve
        }),
    )

    const first = SafeServiceModule.readQueue(NETWORK, ADDRESS, 20, 0)
    const second = SafeServiceModule.readQueue(NETWORK, ADDRESS, 20, 0)
    release?.(queuePage([transaction(6)]))

    const results = await Promise.all([first, second])

    expect(results[0].results[0].nonce).to.equal('6')
    expect(results[1].results[0].nonce).to.equal('6')
    expect(get.calledOnce).to.equal(true)
  })

  it('rejects a malformed queue response when no stale value exists', async () => {
    sandbox.stub(SafeTxServiceModule, 'get').resolves({ invalid: true })

    try {
      await SafeServiceModule.readQueue(NETWORK, ADDRESS, 20, 0)
      expect.fail('expected invalid response')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal('invalid-response')
      expect((error as SafeReadError).status).to.equal(502)
    }
  })

  it('allocates above the highest queued nonce and floors at current chain nonce', async () => {
    const readNonce = sandbox
      .stub(SafeChainReaderModule, 'readNonce')
      .onFirstCall()
      .resolves('12')
      .onSecondCall()
      .resolves('30')
    const get = sandbox
      .stub(SafeTxServiceModule, 'get')
      .onFirstCall()
      .resolves(queuePage([transaction('9007199254740995')], 2))
      .onSecondCall()
      .resolves(queuePage([transaction('6')], 2))
      .onThirdCall()
      .resolves(queuePage([transaction('19')]))

    const aboveCurrent = await SafeServiceModule.readNextNonce(NETWORK, ADDRESS)
    const aboveQueue = await SafeServiceModule.readNextNonce(NETWORK, ADDRESS)

    expect(aboveCurrent.nextNonce).to.equal('9007199254740996')
    expect(aboveCurrent.currentNonce).to.equal('12')
    expect(aboveQueue.nextNonce).to.equal('30')
    expect(aboveQueue.currentNonce).to.equal('30')
    expect(readNonce.callCount).to.equal(2)
    expect(get.callCount).to.equal(3)
    expect(get.firstCall.args[2]).to.deep.include({ executed: false, nonce__gte: '12', offset: 0 })
    expect(get.secondCall.args[2]).to.deep.include({ executed: false, nonce__gte: '12', offset: 1 })
    expect(get.thirdCall.args[2]).to.deep.include({ executed: false, nonce__gte: '30', offset: 0 })
  })

  it('never reads next-nonce from the cache', async () => {
    sandbox.stub(SafeChainReaderModule, 'readNonce').resolves('12')
    const get = sandbox.stub(SafeTxServiceModule, 'get').resolves(queuePage([]))

    await SafeServiceModule.readNextNonce(NETWORK, ADDRESS)
    await SafeServiceModule.readNextNonce(NETWORK, ADDRESS)

    expect(get.callCount).to.equal(2)
  })

  it('propagates a chain failure when no stale info exists', async () => {
    const readInfo = sandbox.stub(SafeChainReaderModule, 'readInfo').rejects(new Error('RPC down'))

    try {
      await SafeServiceModule.readInfo(NETWORK, ADDRESS)
      expect.fail('expected chain failure')
    } catch (error) {
      expect((error as Error).message).to.equal('RPC down')
    }

    expect(readInfo.calledOnce).to.equal(true)
  })

  it('rejects an unsupported chain before any read', async () => {
    const readInfo = sandbox.stub(SafeChainReaderModule, 'readInfo')

    try {
      await SafeServiceModule.readInfo(NetworksEnum.hemiMainnet, ADDRESS)
      expect.fail('expected unsupported chain')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal('unsupported-chain')
      expect((error as SafeReadError).status).to.equal(501)
    }

    expect(readInfo.notCalled).to.equal(true)
  })
})
