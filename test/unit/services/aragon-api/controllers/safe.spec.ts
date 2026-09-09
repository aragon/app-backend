import SafeController from '@api/controllers/safe'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { SafeReadError } from '@modules/safe/safeError'
import { ISafeErrorCode, ISafeReadKind, ISafeSource, NetworksEnum } from '@types'
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
})
