import { SafeGateway } from '@services/aragon-gateway/safe'
import SafeServiceModule from '@modules/safe/safeService'
import { SafeReadError } from '@modules/safe/safeError'
import { ISafeErrorCode, type IQueueSafeRead, ISafeReadKind, ISafeSource, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const NETWORK = NetworksEnum.ethereumMainnet
const ADDRESS = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'
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

const params = (kind: ISafeReadKind): IQueueSafeRead => ({
  sentAt: Date.now(),
  network: NETWORK,
  address: ADDRESS,
  kind,
  limit: 20,
  offset: 0,
})

describe('Gateway: safe', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => sandbox.restore())

  it('dispatches each Safe read kind to its service method', async () => {
    const readInfo = sandbox.stub(SafeServiceModule, 'readInfo').resolves(INFO)
    const readQueue = sandbox.stub(SafeServiceModule, 'readQueue').resolves(QUEUE)
    const readHistory = sandbox.stub(SafeServiceModule, 'readHistory').resolves(QUEUE)
    const readNextNonce = sandbox.stub(SafeServiceModule, 'readNextNonce').resolves(NEXT_NONCE)

    expect(await SafeGateway.read(params(ISafeReadKind.info))).to.deep.equal(INFO)
    expect(await SafeGateway.read(params(ISafeReadKind.queue))).to.deep.equal(QUEUE)
    expect(await SafeGateway.read(params(ISafeReadKind.history))).to.deep.equal(QUEUE)
    expect(await SafeGateway.read(params(ISafeReadKind.nextNonce))).to.deep.equal(NEXT_NONCE)
    expect(readInfo.calledOnceWith(NETWORK, ADDRESS)).to.equal(true)
    expect(readQueue.calledOnceWith(NETWORK, ADDRESS, 20, 0)).to.equal(true)
    expect(readNextNonce.calledOnceWith(NETWORK, ADDRESS)).to.equal(true)
    expect(
      readHistory.calledOnceWith(NETWORK, ADDRESS, {
        limit: 20,
        offset: 0,
        to: undefined,
        nonceGte: undefined,
        nonceLte: undefined,
      }),
    ).to.equal(true)
  })

  it('carries the history filters across the queue', async () => {
    const readHistory = sandbox.stub(SafeServiceModule, 'readHistory').resolves(QUEUE)

    await SafeGateway.read({
      ...params(ISafeReadKind.history),
      to: ADDRESS,
      nonceGte: '3',
      nonceLte: '9',
    })

    expect(
      readHistory.calledOnceWith(NETWORK, ADDRESS, {
        limit: 20,
        offset: 0,
        to: ADDRESS,
        nonceGte: '3',
        nonceLte: '9',
      }),
    ).to.equal(true)
  })

  it('serializes typed service failures for RabbitMQ', async () => {
    sandbox.stub(SafeServiceModule, 'readInfo').rejects(new SafeReadError(ISafeErrorCode.notFound, 'missing', 404))

    const result = await SafeGateway.read(params(ISafeReadKind.info))

    expect(result).to.deep.equal({
      safeError: { code: ISafeErrorCode.notFound, error: 'missing', status: 404, retryAfter: undefined },
    })
  })

  it('serializes unknown read kinds and unexpected failures', async () => {
    const unknown = await SafeGateway.read({ ...params(ISafeReadKind.info), kind: 'unknown' as ISafeReadKind })
    expect(unknown).to.deep.equal({
      safeError: {
        code: ISafeErrorCode.upstreamError,
        error: 'Unknown Safe read kind unknown',
        status: 400,
        retryAfter: undefined,
      },
    })

    sandbox.stub(SafeServiceModule, 'readInfo').rejects(new Error('unexpected'))
    const unexpected = await SafeGateway.read(params(ISafeReadKind.info))
    expect(unexpected).to.deep.equal({
      safeError: {
        code: ISafeErrorCode.upstreamError,
        error: 'The Safe read could not be completed',
        status: 502,
        retryAfter: undefined,
      },
    })
  })

  it('answers a typed error for a job carrying no params', async () => {
    const readInfo = sandbox.stub(SafeServiceModule, 'readInfo').resolves(INFO)

    expect(await SafeGateway.read(undefined as unknown as IQueueSafeRead)).to.deep.equal({
      safeError: {
        code: ISafeErrorCode.upstreamError,
        error: 'Malformed Safe read request',
        status: 400,
        retryAfter: undefined,
      },
    })
    expect(readInfo.called).to.equal(false)
  })
})
