import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import LoggerMiddleware from '@services/aragon-api/middlewares/logger'
import Logger from '@logger'

describe('middlewares: logger', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('run', async () => {
    const loginfo = sandbox.stub(Logger, 'verbose')
    const next = sinon.stub() as any
    const query = { a: 1, password: 'password' }
    const ctx = {
      request: {
        path: 'path',
        method: 'method',
        query,
        ip: 'ip',
        route: 'route',
        url: 'url',
        host: 'host',
        protocol: 'protocol',
        get: sandbox.stub().callsFake(arg => `${arg}1`),
      },
      response: {
        set: sandbox.stub(),
      },
      status: 100,
    } as any

    await LoggerMiddleware()(ctx, next)

    expect(ctx.requestInfo.start).to.exist
    expect(ctx.requestInfo.time).to.exist
    expect(ctx.requestInfo.correlationId).to.exist
    expect(ctx.requestInfo.status).to.eq(100)
    expect(ctx.requestInfo.deviceId).to.eq('deviceId1')
    expect(ctx.requestInfo.origin).to.eq('origin1')
    expect(ctx.requestInfo.path).to.eq('path')
    expect(ctx.requestInfo.method).to.eq('method')
    expect(ctx.requestInfo.query).not.to.eq(query)
    expect(ctx.requestInfo.query.a).to.eq(query.a)
    expect(ctx.requestInfo.query.password).to.be.undefined
    expect(ctx.requestInfo.ip).to.eq('ip')
    expect(ctx.requestInfo.url).to.eq('url')
    expect(ctx.requestInfo.host).to.eq('host')
    expect(ctx.requestInfo.protocol).to.eq('protocol')
    expect(ctx.requestInfo.status).to.eq(100)

    expect(next.calledWith()).to.be.true
    expect(ctx.request.get.calledWith('deviceId')).to.be.true
    expect(ctx.response.set.calledWith('X-Correlation-Id', ctx.requestInfo.correlationId)).to.be.true
    expect(loginfo.args[0][0]).to.eq('API request')
  })
})
