import SafeController from '@api/controllers/safe'
import config from '@config'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { SafeReadError } from '@modules/safe/safeError'
import SafeTrackingModule from '@modules/safe/safeTracking'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import { ISafeErrorCode, ISafeReadKind, ISafeSource, ISafeTransactionState, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const ADDRESS = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'
const NETWORK = NetworksEnum.ethereumMainnet
const INFO = {
  address: ADDRESS,
  owners: ['0x1111111111111111111111111111111111111111'],
  threshold: 1,
  version: '1.4.1',
  nonce: '6',
  modules: [],
  guard: null,
  meta: { source: ISafeSource.chain, fetchedAt: '2026-08-26T12:00:00.000Z', stale: false },
}
const QUEUE = {
  count: 0,
  next: null,
  previous: null,
  results: [],
  meta: { source: ISafeSource.safeApi, fetchedAt: '2026-08-26T12:00:00.000Z', stale: false },
}
const NEXT_NONCE = {
  nextNonce: '7',
  currentNonce: '6',
  meta: { source: ISafeSource.safeApi, fetchedAt: '2026-08-26T12:00:00.000Z', stale: false },
}

describe('Controller: safe', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => sandbox.restore())

  it('routes info reads through the Safe gateway queue', async () => {
    const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(INFO)

    const result = await SafeController.getInfo(NETWORK, ADDRESS)

    expect(result).to.deep.equal(INFO)
    expect(sendMessage.calledOnce).to.equal(true)
    expect(sendMessage.firstCall.args[0]).to.equal('safe.read')
    const infoParams = (sendMessage.firstCall.args[1] as { params: Record<string, unknown> }).params
    expect(infoParams).to.include({ network: NETWORK, address: ADDRESS, kind: ISafeReadKind.info })
  })

  it('routes queue and next-nonce reads with their distinct kinds', async () => {
    const sendMessage = sandbox
      .stub(RabbitMQHelper, 'sendMessage')
      .onFirstCall()
      .resolves(QUEUE)
      .onSecondCall()
      .resolves(NEXT_NONCE)

    expect(await SafeController.getQueue(NETWORK, ADDRESS, 20, 5)).to.deep.equal(QUEUE)
    expect(await SafeController.getNextNonce(NETWORK, ADDRESS)).to.deep.equal(NEXT_NONCE)
    const queueParams = (sendMessage.firstCall.args[1] as { params: Record<string, unknown> }).params
    const nextNonceParams = (sendMessage.secondCall.args[1] as { params: Record<string, unknown> }).params
    expect(queueParams).to.include({
      network: NETWORK,
      address: ADDRESS,
      kind: ISafeReadKind.queue,
      limit: 20,
      offset: 5,
    })
    expect(nextNonceParams).to.include({ network: NETWORK, address: ADDRESS, kind: ISafeReadKind.nextNonce })
  })

  it('routes history reads with their filters, and keys the job by them', async () => {
    const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(QUEUE)

    const result = await SafeController.getHistory(NETWORK, ADDRESS, {
      limit: 10,
      offset: 0,
      to: ADDRESS,
      nonceGte: '3',
      nonceLte: '9',
    })

    expect(result).to.deep.equal(QUEUE)
    const job = sendMessage.firstCall.args[1] as { id: string; params: Record<string, unknown> }
    expect(job.params).to.include({
      network: NETWORK,
      address: ADDRESS,
      kind: ISafeReadKind.history,
      limit: 10,
      offset: 0,
      to: ADDRESS,
      nonceGte: '3',
      nonceLte: '9',
    })
    // Two different windows must not collapse onto one in-flight job id.
    expect(job.id).to.contain('3').and.to.contain('9')
  })

  it('returns typed errors for missing gateway replies and gateway error payloads', async () => {
    sandbox
      .stub(RabbitMQHelper, 'sendMessage')
      .onFirstCall()
      .resolves(null)
      .onSecondCall()
      .resolves({
        safeError: { code: ISafeErrorCode.rateLimited, error: 'try later', status: 429, retryAfter: 30 },
      })

    try {
      await SafeController.getInfo(NETWORK, ADDRESS)
      expect.fail('expected connection-error')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal(ISafeErrorCode.connectionError)
    }

    try {
      await SafeController.getQueue(NETWORK, ADDRESS, 20, 0)
      expect.fail('expected rate-limited')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal(ISafeErrorCode.rateLimited)
      expect((error as SafeReadError).retryAfter).to.equal(30)
    }
  })

  it('rejects unsupported chains before touching RabbitMQ', async () => {
    const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage')

    try {
      await SafeController.getInfo(NetworksEnum.citreaMainnet, ADDRESS)
      expect.fail('expected unsupported-chain')
    } catch (error) {
      expect(error).to.be.instanceOf(SafeReadError)
      expect((error as SafeReadError).code).to.equal(ISafeErrorCode.unsupportedChain)
      expect((error as SafeReadError).status).to.equal(501)
    }

    expect(sendMessage.notCalled).to.equal(true)
  })

  it('answers a tracked Safe from the store and queues a background pull without waiting on it', async () => {
    sandbox.stub(SafeTrackingModule, 'isTracked').resolves(true)
    // never settles, so an answer proves nothing waited on it
    const pull = sandbox.stub(RabbitMQHelper, 'sendMessage').returns(new Promise(() => {}))
    sandbox.stub(SafeTransactionsModule, 'list').resolves({
      count: 1,
      next: null,
      previous: null,
      results: [],
      refreshedAt: new Date().toISOString(),
    })

    const result = await SafeController.getTransactions(NETWORK, ADDRESS, { limit: 10, offset: 20 })

    expect(pull.firstCall.args[0]).to.equal('safe.refresh')
    expect(pull.firstCall.args[1].params).to.deep.equal({ network: NETWORK, address: ADDRESS })
    expect(result.meta).to.deep.equal({ source: ISafeSource.store, stale: false })
  })

  it('calls the store stale when it is empty or has not been pulled inside the queue window', async () => {
    sandbox.stub(SafeTrackingModule, 'isTracked').resolves(true)
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    const list = sandbox.stub(SafeTransactionsModule, 'list')
    list.onFirstCall().resolves({ count: 0, next: null, previous: null, results: [], refreshedAt: null })
    list.onSecondCall().resolves({
      count: 1,
      next: null,
      previous: null,
      results: [],
      refreshedAt: new Date(Date.now() - config.SAFE_API.QUEUE_STALE_WINDOW - 1000).toISOString(),
    })

    const empty = await SafeController.getTransactions(NETWORK, ADDRESS, { limit: 10, offset: 0 })
    const old = await SafeController.getTransactions(NETWORK, ADDRESS, { limit: 10, offset: 0 })

    expect(empty.meta.stale).to.equal(true)
    expect(old.meta.stale).to.equal(true)
  })

  it('pages a single upstream list as asked when a state is given', async () => {
    const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(QUEUE)

    await SafeController._readTransactionsLive(NETWORK, ADDRESS, {
      limit: 2,
      offset: 150,
      state: ISafeTransactionState.executed,
    })

    // one list, so upstream pages it and the cap on the merged view does not apply
    expect(sendMessage.calledOnce).to.equal(true)
    const params = (sendMessage.firstCall.args[1] as { params: Record<string, unknown> }).params
    expect(params).to.include({ kind: ISafeReadKind.history, limit: 2, offset: 150 })
  })

  it('merges the queue and the history into one page, newest first', async () => {
    const page = (results: Array<{ safeTxHash: string; submissionDate: string }>) => ({
      ...QUEUE,
      results: results.map(result => ({ ...result, to: ADDRESS, value: '0', data: null, confirmations: [] })),
    })
    sandbox
      .stub(RabbitMQHelper, 'sendMessage')
      .onFirstCall()
      .resolves(
        page([
          { safeTxHash: '0xqueue-new', submissionDate: '2026-09-20T12:00:00.000Z' },
          { safeTxHash: '0xqueue-old', submissionDate: '2026-09-01T12:00:00.000Z' },
        ]),
      )
      .onSecondCall()
      .resolves(page([{ safeTxHash: '0xhistory', submissionDate: '2026-09-10T12:00:00.000Z' }]))

    const result = await SafeController._readTransactionsLive(NETWORK, ADDRESS, { limit: 2, offset: 0 })

    expect(result.count).to.equal(2)
    expect(result.results.map(row => row.safeTxHash)).to.deep.equal(['0xqueue-new', '0xhistory'])
  })

  it('pages the merged live list, reading both upstream lists from zero up to the page end', async () => {
    const page = (results: Array<{ safeTxHash: string; submissionDate: string }>) => ({
      ...QUEUE,
      results: results.map(result => ({ ...result, to: ADDRESS, value: '0', data: null, confirmations: [] })),
    })
    const sendMessage = sandbox
      .stub(RabbitMQHelper, 'sendMessage')
      .onFirstCall()
      .resolves(
        page([
          { safeTxHash: '0xqueue-new', submissionDate: '2026-09-20T12:00:00.000Z' },
          { safeTxHash: '0xqueue-old', submissionDate: '2026-09-01T12:00:00.000Z' },
        ]),
      )
      .onSecondCall()
      .resolves(page([{ safeTxHash: '0xhistory', submissionDate: '2026-09-10T12:00:00.000Z' }]))

    const result = await SafeController._readTransactionsLive(NETWORK, ADDRESS, { limit: 1, offset: 1 })

    // the second row of the merged view, not the second row of each list
    expect(result.results.map(row => row.safeTxHash)).to.deep.equal(['0xhistory'])
    const queueParams = (sendMessage.firstCall.args[1] as { params: Record<string, unknown> }).params
    const historyParams = (sendMessage.secondCall.args[1] as { params: Record<string, unknown> }).params
    expect(queueParams).to.include({ limit: 2, offset: 0 })
    expect(historyParams).to.include({ limit: 2, offset: 0 })
  })
})
