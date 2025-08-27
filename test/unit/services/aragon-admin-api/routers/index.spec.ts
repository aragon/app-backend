import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Router from '@koa/router'
import MainAdminRouter from '@admin-api/routers/index'
import StatusAdminRouter from '@admin-api/routers/status'
import QueueAdminRouter from '@admin-api/routers/queue'
import DaoAdminRouter from '@admin-api/routers/dao'
import utils from '@helpers/utils'
import Koa from 'koa'
import supertest from 'supertest'
import CapitalDistributorAdminRouter from '@admin-api/routers/capitalDistributor'

describe('Router: MainAdminRouter', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should get main admin router', async () => {
    const use = sandbox.stub(Router.prototype, 'use')

    function stubRouter(Rt: any, name: string) {
      return sandbox.stub(Rt, 'router').returns({
        routes: sandbox.stub().returns(`${name}Routes`),
        allowedMethods: sandbox.stub().returns(`${name}AllowedMethod`),
      })
    }

    stubRouter(StatusAdminRouter, 'status')
    stubRouter(QueueAdminRouter, 'queue')
    stubRouter(DaoAdminRouter, 'dao')
    stubRouter(CapitalDistributorAdminRouter, 'capital-distributor')

    // Removed unnecessary 1000ms wait

    const mainRouter = MainAdminRouter.router()
    expect(mainRouter instanceof Router).to.be.true

    const routers = [StatusAdminRouter, QueueAdminRouter, DaoAdminRouter, CapitalDistributorAdminRouter]
    expect(use.callCount).to.be.eq(routers.length)
    expect(use.calledWith(`statusRoutes`, `statusAllowedMethod`)).to.be.true

    function expectRouter(name: string) {
      expect(use.calledWith(`/${name}`, `${name}Routes`, `${name}AllowedMethod`)).to.be.true
    }

    expectRouter('queue')
  })

  it('Should setup main router with all child routers', async () => {
    const app = new Koa()
    app.use(MainAdminRouter.router().routes())
    const request = supertest(app.callback())

    await request.get('/').expect(200)
  })
})
