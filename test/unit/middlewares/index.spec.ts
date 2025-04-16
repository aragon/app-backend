import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Koa from 'koa'
import supertest from 'supertest'
import MainMiddleware from '@src/middlewares'
import MainRouter from '@api/routers'
import JwtHelper from '@helpers/jwt'
import { ErrorKeyEnum } from '@types'

describe('Middleware: Main', () => {
  let sandbox: SinonSandbox
  let readJWTSpy: sinon.SinonSpy

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    readJWTSpy = sandbox.spy(JwtHelper, 'readJWT')
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should NOT call JwtHelper.readJWT when useJWT is false', async () => {
    const app = new Koa()
    app.use(MainMiddleware(MainRouter.router(), { useJWT: false }))

    await supertest(app.callback()).get('/')

    expect(readJWTSpy.called).to.be.false
  })

  it('should call JwtHelper.readJWT when useJWT is true', async () => {
    const app = new Koa()
    app.use(MainMiddleware(MainRouter.router(), { useJWT: true }))

    await supertest(app.callback()).get('/')

    expect(readJWTSpy.calledOnce).to.be.true
  })

  it('should integrate middleware layers and respond to requests', async () => {
    const app = new Koa()
    app.use(MainMiddleware(MainRouter.router(), { useJWT: true }))

    const response = await supertest(app.callback()).get('/')
    expect(response.status).to.eq(200)
  })

  it('should handle body parsing errors gracefully', async () => {
    const app = new Koa()
    app.use(MainMiddleware(MainRouter.router()))
    const invalidJson = '{invalidJson: true}'
    const response = await supertest(app.callback()).post('/').send(invalidJson).set('Content-Type', 'application/json')

    expect(response.status).to.equal(400)
    expect(response.body).to.have.property('code', ErrorKeyEnum.badParams)
  })

  it('should apply security middleware', async () => {
    const app = new Koa()
    app.use(MainMiddleware(MainRouter.router()))

    const response = await supertest(app.callback()).get('/')
    expect(response.headers).to.have.property('x-content-type-options', 'nosniff')
    expect(response.headers).to.have.property('x-frame-options', 'DENY')
    expect(response.headers).to.have.property('x-xss-protection', '1; mode=block')
  })
})
