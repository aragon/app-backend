import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import MainMiddleware from '@services/aragon-api/middlewares/index'
import MainRouter from '@services/aragon-api/routers/index'
import Koa from 'koa'
import supertest from 'supertest'
import { ErrorKeyEnum } from '@types'

describe('middlewares: index', () => {
  let sandbox: SinonSandbox
  let app: Koa

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    app = new Koa()
    app.use(MainMiddleware(MainRouter.router()))
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should integrate middleware layers and respond to requests', async () => {
    const response = await supertest(app.callback()).get('/')
    expect(response.status).to.be.oneOf([200, 404])
  })

  it('should handle body parsing errors gracefully', async () => {
    const invalidJson = '{invalidJson: true}'
    const response = await supertest(app.callback()).post('/').send(invalidJson).set('Content-Type', 'application/json')

    expect(response.status).to.equal(400)
    expect(response.body).to.have.property('code', ErrorKeyEnum.badParams)
  })

  it('should apply security middleware', async () => {
    const response = await supertest(app.callback()).get('/')
    expect(response.headers).to.have.property('x-content-type-options', 'nosniff')
    expect(response.headers).to.have.property('x-frame-options', 'DENY')
    expect(response.headers).to.have.property('x-xss-protection', '1; mode=block')
  })
})
