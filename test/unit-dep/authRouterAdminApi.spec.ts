import Koa from 'koa'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { ErrorKeyEnum, IJwtTokenType, NetworksEnum } from '@types'
import AuthMiddleware from '@middlewares/auth'
import MainAdminRouter from '@admin-api/routers'
import supertest from 'supertest'
import MainMiddleware from '@src/middlewares'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'

describe('Integ: AuthRouter Admin API', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('should test admin endpoints with authentication', async () => {
    // Start app
    const app = new Koa()
    // app.use(MainAdminRouter.router().routes())
    app.use(MainMiddleware(MainAdminRouter.router(), { useJWT: true }))
    const request = supertest(app.callback())

    // Test no auth endpoint
    await request.get('/').expect(200)

    // Generate a valid token with type admin
    const token = await AuthMiddleware.generateJwtAuth(IJwtTokenType.admin)
    expect(token).to.be.a('string')

    // Test auth endpoint with no token
    const daoAddress = '0x4093dbcd392a46c85762001c9277fecf99a6a1eb'
    const network = NetworksEnum.ethereumSepolia

    const response: any = await request.post(`/queue/dao-plugins/${daoAddress}/${network}`).expect(400)

    expect(response.body.code).to.eq(ErrorKeyEnum.accessDenied)
    expect(response.body.description).to.eq('access denied')
    expect(response.body.status).to.eq(400)

    // Test auth endpoint with token
    const stubDao = sandbox.stub(Models.Dao, 'findOne').resolves(true)
    const stubRabbitMQ = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves(true)

    await request
      .post(`/queue/dao-metrics/${daoAddress}/${network}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)

    expect(stubDao.calledOnce).to.be.true
    expect(stubRabbitMQ.calledOnce).to.be.true
  })
})
