import SafeController from '@api/controllers/safe'
import SafeRouter from '@api/routers/v2/safe'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { SafeReadError } from '@modules/safe/safeError'
import { ISafeErrorCode, ISafeSource } from '@types'
import { expect } from 'chai'
import Koa from 'koa'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'
import supertest from 'supertest'

const ADDRESS = '0xd84C233A7D1578021d21E39785439bEdDB165F3D'

const createApp = () => {
  const app = new Koa()
  const router = SafeRouter.router()
  app.use(router.routes()).use(router.allowedMethods())
  return app
}

describe('RouterV2: Safe', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => sandbox.restore())

  it('renders the Safe error vocabulary and Retry-After field', async () => {
    sandbox.stub(SafeController, 'getInfo').rejects(new SafeReadError(ISafeErrorCode.rateLimited, 'try later', 429, 30))

    const response = await supertest(createApp().callback()).get(`/ethereum-mainnet/${ADDRESS}/info`)

    expect(response.status).to.equal(429)
    expect(response.body).to.deep.equal({ error: 'try later', code: 'rate-limited', retryAfter: 30 })
    expect(response.headers['cache-control']).to.equal('no-store')
  })

  it('propagates unexpected controller errors to the shared middleware', async () => {
    sandbox.stub(SafeController, 'getInfo').rejects(new Error('unexpected'))

    const response = await supertest(createApp().callback()).get(`/ethereum-mainnet/${ADDRESS}/info`)

    expect(response.status).to.equal(500)
  })

  it('returns unsupported-chain before sending a RabbitMQ request', async () => {
    const sendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage')

    const response = await supertest(createApp().callback()).get(`/citrea-mainnet/${ADDRESS}/info`)

    expect(response.status).to.equal(501)
    expect(response.body).to.deep.equal({
      error: 'citrea-mainnet is not served by the Safe transaction service',
      code: 'unsupported-chain',
    })
    expect(sendMessage.notCalled).to.equal(true)
  })

  it('sets no-store for next-nonce and short caching for successful queue reads', async () => {
    sandbox.stub(SafeController, 'getInfo').resolves({
      address: ADDRESS,
      owners: ['0x1111111111111111111111111111111111111111'],
      threshold: 1,
      version: '1.4.1',
      nonce: '6',
      modules: [],
      guard: null,
      meta: { source: ISafeSource.chain, fetchedAt: '2026-08-26T12:00:00.000Z', stale: false },
    })
    sandbox.stub(SafeController, 'getNextNonce').resolves({
      nextNonce: '7',
      currentNonce: '6',
      meta: { source: ISafeSource.safeApi, fetchedAt: '2026-08-26T12:00:00.000Z', stale: false },
    })
    sandbox.stub(SafeController, 'getQueue').resolves({
      count: 0,
      next: null,
      previous: null,
      results: [],
      meta: { source: ISafeSource.safeApi, fetchedAt: '2026-08-26T12:00:00.000Z', stale: false },
    })

    const app = createApp()
    const info = await supertest(app.callback()).get(`/ethereum-mainnet/${ADDRESS}/info`)
    const nextNonce = await supertest(app.callback()).get(`/ethereum-mainnet/${ADDRESS}/next-nonce`)
    const queue = await supertest(app.callback()).get(`/ethereum-mainnet/${ADDRESS}/queue`)

    expect(info.status).to.equal(200)
    expect(info.headers['cache-control']).to.equal('public, max-age=0, s-maxage=10, must-revalidate')
    expect(nextNonce.status).to.equal(200)
    expect(nextNonce.headers['cache-control']).to.equal('no-store')
    expect(queue.status).to.equal(200)
    expect(queue.headers['cache-control']).to.equal('public, max-age=0, s-maxage=10, must-revalidate')
  })

  it('forwards history filters and checksums the target address', async () => {
    const getHistory = sandbox.stub(SafeController, 'getHistory').resolves({
      count: 0,
      next: null,
      previous: null,
      results: [],
      meta: { source: ISafeSource.safeApi, fetchedAt: '2026-08-26T12:00:00.000Z', stale: false },
    })

    const response = await supertest(createApp().callback()).get(
      `/ethereum-mainnet/${ADDRESS}/history?limit=10&offset=2&to=${ADDRESS.toLowerCase()}&nonce__gte=3&nonce__lte=9`,
    )

    expect(response.status).to.equal(200)
    expect(response.headers['cache-control']).to.equal('public, max-age=0, s-maxage=10, must-revalidate')
    expect(getHistory.firstCall.args[2]).to.deep.equal({
      limit: 10,
      offset: 2,
      // Lower-cased on the wire, checksummed before it reaches a cache key or the upstream.
      to: ADDRESS,
      nonceGte: '3',
      nonceLte: '9',
    })
  })

  it('defaults history pagination and leaves absent filters undefined', async () => {
    const getHistory = sandbox.stub(SafeController, 'getHistory').resolves({
      count: 0,
      next: null,
      previous: null,
      results: [],
      meta: { source: ISafeSource.safeApi, fetchedAt: '2026-08-26T12:00:00.000Z', stale: false },
    })

    const response = await supertest(createApp().callback()).get(`/ethereum-mainnet/${ADDRESS}/history`)

    expect(response.status).to.equal(200)
    expect(getHistory.firstCall.args[2]).to.deep.equal({
      limit: 20,
      offset: 0,
      to: undefined,
      nonceGte: undefined,
      nonceLte: undefined,
    })
  })

  it('rejects history filters that are not a nonce or an address', async () => {
    const getHistory = sandbox.stub(SafeController, 'getHistory')
    const app = createApp()

    // `-1`, `1e3` and `0x2` are all accepted by BigInt but are not nonces.
    const negative = await supertest(app.callback()).get(`/ethereum-mainnet/${ADDRESS}/history?nonce__gte=-1`)
    const exponent = await supertest(app.callback()).get(`/ethereum-mainnet/${ADDRESS}/history?nonce__lte=1e3`)
    const badTarget = await supertest(app.callback()).get(`/ethereum-mainnet/${ADDRESS}/history?to=0xnope`)
    const hugeLimit = await supertest(app.callback()).get(`/ethereum-mainnet/${ADDRESS}/history?limit=1000`)

    expect(negative.status).to.equal(400)
    expect(exponent.status).to.equal(400)
    expect(badTarget.status).to.equal(400)
    expect(hugeLimit.status).to.equal(400)
    expect(getHistory.notCalled).to.equal(true)
  })
})
