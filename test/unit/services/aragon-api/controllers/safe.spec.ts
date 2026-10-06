import SafeController from '@api/controllers/safe'
import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import { SafeReadError } from '@modules/safe/safeError'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import { ISafeErrorCode, ISafeReadKind, ISafeSource, NetworksEnum } from '@types'
import { expect } from 'chai'
import { AbiCoder, concat, id } from 'ethers'
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
    sandbox
      .stub(SafeBodyMembersModule, 'findDaosWithSafeBody')
      .resolves([{ daoAddress: '0xdao', network: NETWORK }] as any)
    // never settles, so an answer proves nothing waited on it
    const pull = sandbox.stub(RabbitMQHelper, 'sendMessage').returns(new Promise(() => {}))
    const queueFetchedAt = new Date()
    await Models.SafeAccount.create({
      id: Models.SafeAccount.buildId(NETWORK, ADDRESS),
      network: NETWORK,
      safeAddress: ADDRESS,
      queueFetchedAt,
      queueComplete: true,
    })
    sandbox.stub(SafeTransactionsModule, 'list').resolves({ count: 1, next: null, previous: null, results: [] })

    const result = await SafeController.getTransactions(NETWORK, ADDRESS, { limit: 10, offset: 20 })

    expect(pull.firstCall.args[0]).to.equal('safe.refresh')
    expect(pull.firstCall.args[1].params).to.deep.equal({ network: NETWORK, address: ADDRESS })
    expect(result.meta).to.deep.equal({
      source: ISafeSource.store,
      stale: false,
      partial: false,
      fetchedAt: queueFetchedAt.toISOString(),
    })
  })

  it('attaches the proposal reports to a stored report transaction', async () => {
    const SPP = '0xc18021bF09671A21F474A8C059c987BA895bDBF7'
    const DAO = '0x2222222222222222222222222222222222222222'
    const reportCalldata = concat([
      id('reportProposalResult(uint256,uint16,uint8,bool)').slice(0, 10),
      AbiCoder.defaultAbiCoder().encode(['uint256', 'uint16', 'uint8', 'bool'], [123n, 0, 2, true]),
    ])
    sandbox
      .stub(SafeBodyMembersModule, 'findDaosWithSafeBody')
      .resolves([{ daoAddress: '0xdao', network: NETWORK }] as any)
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(SafeTransactionsModule, 'list').resolves({
      count: 1,
      next: null,
      previous: null,
      results: [{ safeTxHash: `0x${'a'.repeat(64)}`, nonce: '9', to: SPP, data: reportCalldata } as any],
    })
    sandbox.stub(Models.Proposal, 'find').returns({
      select: () => ({
        lean: () => ({
          exec: async () => [{ pluginAddress: SPP, proposalIndex: '123', incrementalId: 7, daoAddress: DAO }],
        }),
      }),
    } as any)
    sandbox.stub(Models.Setting, 'find').returns({
      select: () => ({
        lean: () => ({ exec: async () => [{ pluginAddress: SPP, stages: [{ plugins: [{ address: ADDRESS }] }] }] }),
      }),
    } as any)

    const result = await SafeController.getTransactions(NETWORK, ADDRESS, { limit: 10, offset: 0 })

    expect((result.results[0] as any).aragonReports).to.have.length(1)
    expect((result.results[0] as any).aragonReports[0].proposalId).to.equal(7)
  })

  it('calls the store stale when it was never pulled or not pulled inside the queue window', async () => {
    sandbox
      .stub(SafeBodyMembersModule, 'findDaosWithSafeBody')
      .resolves([{ daoAddress: '0xdao', network: NETWORK }] as any)
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(SafeTransactionsModule, 'list').resolves({ count: 0, next: null, previous: null, results: [] })

    const never = await SafeController.getTransactions(NETWORK, ADDRESS, { limit: 10, offset: 0 })
    await Models.SafeAccount.create({
      id: Models.SafeAccount.buildId(NETWORK, ADDRESS),
      network: NETWORK,
      safeAddress: ADDRESS,
      queueFetchedAt: new Date(Date.now() - config.SAFE_API.QUEUE_STALE_WINDOW - 1000),
      queueComplete: true,
    })
    const old = await SafeController.getTransactions(NETWORK, ADDRESS, { limit: 10, offset: 0 })

    expect(never.meta.stale).to.equal(true)
    expect(never.meta.fetchedAt).to.equal(null)
    expect(old.meta.stale).to.equal(true)
    expect(old.meta.fetchedAt).to.be.a('string')
  })

  it('marks the store partial and stale when the last pull did not fit one page', async () => {
    sandbox
      .stub(SafeBodyMembersModule, 'findDaosWithSafeBody')
      .resolves([{ daoAddress: '0xdao', network: NETWORK }] as any)
    sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    sandbox.stub(SafeTransactionsModule, 'list').resolves({ count: 0, next: null, previous: null, results: [] })
    await Models.SafeAccount.create({
      id: Models.SafeAccount.buildId(NETWORK, ADDRESS),
      network: NETWORK,
      safeAddress: ADDRESS,
      queueFetchedAt: new Date(),
      queueComplete: false,
    })

    const result = await SafeController.getTransactions(NETWORK, ADDRESS, { limit: 10, offset: 0 })

    expect(result.meta.partial).to.equal(true)
    expect(result.meta.stale).to.equal(true)
  })

  it('warns but still answers when the background pull cannot be queued', async () => {
    const warn = sandbox.stub(logger, 'warn')
    sandbox
      .stub(SafeBodyMembersModule, 'findDaosWithSafeBody')
      .resolves([{ daoAddress: '0xdao', network: NETWORK }] as any)
    sandbox.stub(RabbitMQHelper, 'sendMessage').rejects(new Error('queue down'))
    sandbox.stub(SafeTransactionsModule, 'list').resolves({ count: 0, next: null, previous: null, results: [] })

    const result = await SafeController.getTransactions(NETWORK, ADDRESS, { limit: 10, offset: 0 })
    await Promise.resolve()

    expect(result.meta.source).to.equal(ISafeSource.store)
    expect(warn.calledOnce).to.be.true
  })

  it('returns the stored decoded actions of a tracked Safe transaction', async () => {
    const safeTxHash = `0x${'a'.repeat(64)}`
    sandbox
      .stub(SafeBodyMembersModule, 'findDaosWithSafeBody')
      .resolves([{ daoAddress: '0xdao', network: NETWORK }] as any)
    sandbox.stub(Models.SafeTransaction, 'findOne').returns({
      lean: async () => ({ decoding: false, actions: [{ to: ADDRESS }], rawActions: [{ to: ADDRESS, data: '0x' }] }),
    } as any)

    const result = await SafeController.getTransactionActions(NETWORK, ADDRESS, safeTxHash)

    expect(result).to.deep.equal({
      decoding: false,
      actions: [{ to: ADDRESS }],
      rawActions: [{ to: ADDRESS, data: '0x' }],
    })
  })

  it('defaults the actions of a tracked transaction that has none stored', async () => {
    const safeTxHash = `0x${'b'.repeat(64)}`
    sandbox
      .stub(SafeBodyMembersModule, 'findDaosWithSafeBody')
      .resolves([{ daoAddress: '0xdao', network: NETWORK }] as any)
    sandbox.stub(Models.SafeTransaction, 'findOne').returns({ lean: async () => ({}) } as any)

    const result = await SafeController.getTransactionActions(NETWORK, ADDRESS, safeTxHash)

    expect(result).to.deep.equal({ decoding: true, actions: [], rawActions: [] })
  })

  it('answers not found when a tracked Safe has no such stored transaction', async () => {
    sandbox
      .stub(SafeBodyMembersModule, 'findDaosWithSafeBody')
      .resolves([{ daoAddress: '0xdao', network: NETWORK }] as any)
    sandbox.stub(Models.SafeTransaction, 'findOne').returns({ lean: async () => null } as any)

    try {
      await SafeController.getTransactionActions(NETWORK, ADDRESS, `0x${'c'.repeat(64)}`)
      expect.fail('expected not found')
    } catch (error) {
      expect((error as { description?: string }).description).to.equal('Not found')
    }
  })

  it('answers an untracked Safe with not found before reading anything', async () => {
    sandbox.stub(SafeBodyMembersModule, 'findDaosWithSafeBody').resolves([])
    const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
    const list = sandbox.stub(SafeTransactionsModule, 'list').resolves()
    const findOne = sandbox.stub(Models.SafeTransaction, 'findOne')

    for (const call of [
      () => SafeController.getTransactions(NETWORK, ADDRESS, { limit: 10, offset: 0 }),
      () => SafeController.getTransactionActions(NETWORK, ADDRESS, '0x'.padEnd(66, '1')),
    ]) {
      try {
        await call()
        expect.fail('expected not found')
      } catch (error) {
        expect((error as { status?: number }).status).to.equal(404)
      }
    }

    expect(sendMessage.notCalled).to.equal(true)
    expect(list.notCalled).to.equal(true)
    expect(findOne.notCalled).to.equal(true)
  })
})
