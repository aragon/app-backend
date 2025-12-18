import Device from '@helpers/device'
import Logger from '@logger'
import logger from '@logger'
import LoggerMiddleware from '@middlewares/logger'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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
    const next = sandbox.stub() as any
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

  it('should populate userAgentInfo when user-agent header is present', async () => {
    const deviceInfoStub = sandbox.stub(Device, 'getDeviceInfo').returns({ device: 'TestDevice' } as any)
    const next = sandbox.stub() as any

    const ctx: any = {
      request: {
        method: 'GET',
        headers: {
          'user-agent': 'TestUserAgent',
        },
        path: 'path',
        ip: '127.0.0.1',
        get: (header: string) => {
          if (header === 'deviceId') return 'TestDeviceId'
          if (header === 'origin') return 'TestOrigin'
          return undefined
        },
      },
      response: {
        set: sandbox.stub(),
      },
      requestInfo: {},
    }

    await LoggerMiddleware()(ctx, next)

    expect(deviceInfoStub.calledOnceWith('TestUserAgent')).to.be.true
    expect(ctx.requestInfo.userAgentInfo).to.deep.eq({ device: 'TestDevice' })
    expect(ctx.requestInfo.deviceId).to.eq('TestDeviceId')
    expect(ctx.requestInfo.origin).to.eq('TestOrigin')
    expect(next.calledOnce).to.be.true
  })

  it('should not populate userAgentInfo when user-agent header is not present', async () => {
    const deviceInfoStub = sandbox.stub(Device, 'getDeviceInfo')
    const next = sandbox.stub().resolves()

    const ctx: any = {
      request: {
        method: 'GET',
        headers: {},
        path: 'path',
        ip: '127.0.0.1',
        get: (header: string) => {
          if (header === 'deviceId') return 'TestDeviceId'
          if (header === 'origin') return 'TestOrigin'
          return undefined
        },
      },
      response: {
        set: sandbox.stub(),
      },
      requestInfo: {},
    }

    await LoggerMiddleware()(ctx, next)

    expect(deviceInfoStub.notCalled).to.be.true
    expect(ctx.requestInfo.userAgentInfo).to.be.undefined
    expect(ctx.requestInfo.deviceId).to.eq('TestDeviceId')
    expect(ctx.requestInfo.origin).to.eq('TestOrigin')
    expect(next.calledOnce).to.be.true
  })

  it('should set log level to ERROR if requestInfo.error is not exposeCustom_', async () => {
    const logStub = sandbox.stub(logger, 'error')

    // Define a fake `next` middleware
    const next = sandbox.stub().callsFake(() => {
      ctx.requestInfo.error = { exposeCustom_: false }
    })

    const ctx: any = {
      request: {
        method: 'GET',
        path: 'path',
        get: (header: string) => {
          if (header === 'deviceId') return 'TestDeviceId'
          if (header === 'origin') return 'TestOrigin'
          return undefined
        },
      },
      response: {
        set: sandbox.stub(),
      },
      requestInfo: {},
    }

    await LoggerMiddleware()(ctx, next)

    expect(logStub.calledOnceWith('API request' as any)).to.be.true

    const log: any = logStub.args[0]
    expect(log[1]).to.have.property('service', 'api:logger')
    expect(log[1]).to.have.property('error').that.deep.equals({ exposeCustom_: false })
  })

  it('should set log level to WARN if requestInfo.error is exposeCustom_', async () => {
    const logStub = sandbox.stub(logger, 'warn')

    const next = sandbox.stub().callsFake(() => {
      ctx.requestInfo.error = { exposeCustom_: true }
    })

    const ctx: any = {
      request: {
        method: 'GET',
        path: 'path',
        get: (header: string) => {
          if (header === 'deviceId') return 'TestDeviceId'
          if (header === 'origin') return 'TestOrigin'
          return undefined
        },
      },
      response: {
        set: sandbox.stub(),
      },
      requestInfo: {},
    }

    await LoggerMiddleware()(ctx, next)

    expect(logStub.calledOnceWith('API request' as any)).to.be.true

    const log: any = logStub.args[0]
    expect(log[1]).to.have.property('service', 'api:logger')
    expect(log[1]).to.have.property('error').that.deep.equals({ exposeCustom_: true })
  })

  it('should skip logging for OPTIONS requests', async () => {
    const logStub = sandbox.stub(logger, 'verbose')
    const next = sandbox.stub().resolves() // Ensure `next` is called

    const ctx: any = {
      request: {
        method: 'OPTIONS',
      },
    }

    await LoggerMiddleware()(ctx, next)

    expect(next.calledOnce).to.be.true
    expect(logStub.notCalled).to.be.true
  })
})
