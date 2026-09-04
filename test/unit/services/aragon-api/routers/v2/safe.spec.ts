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

    const response = await supertest(createApp().callback()).get(`/hemi-mainnet/${ADDRESS}/info`)

    expect(response.status).to.equal(501)
    expect(response.body).to.deep.equal({
      error: 'hemi-mainnet is not served by the Safe transaction service',
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
})
