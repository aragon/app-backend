import utils from '@helpers/utils'
import Router from '@koa/router'
import V1Router from '@services/aragon-api/routers/v1'
import AssetRouter from '@services/aragon-api/routers/v1/asset'
import ContractRouter from '@services/aragon-api/routers/v1/contract'
import DaoRouter from '@services/aragon-api/routers/v1/dao'
import MemberRouter from '@services/aragon-api/routers/v1/member'
import PluginRouter from '@services/aragon-api/routers/v1/plugins'
import ProposalRouter from '@services/aragon-api/routers/v1/proposal'
import SettingRouter from '@services/aragon-api/routers/v1/setting'
import TokenRouter from '@services/aragon-api/routers/v1/token'
import TransactionRouter from '@services/aragon-api/routers/v1/transaction'
import VoteRouter from '@services/aragon-api/routers/v1/vote'
import { expect } from 'chai'
import Koa from 'koa'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import supertest from 'supertest'

describe('RouterV1: V1Router', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should correctly initialize and mount all v1 routers', async () => {
    const use = sandbox.stub(Router.prototype, 'use')

    function stubRouter(Rt: any, name: string) {
      return sandbox.stub(Rt, 'router').returns({
        routes: sandbox.stub().returns(`${name}Routes`),
        allowedMethods: sandbox.stub().returns(`${name}AllowedMethod`),
      })
    }

    // Stub all routers
    stubRouter(VoteRouter, 'votes')
    stubRouter(AssetRouter, 'assets')
    stubRouter(DaoRouter, 'daos')
    stubRouter(MemberRouter, 'members')
    stubRouter(ProposalRouter, 'proposals')
    stubRouter(SettingRouter, 'settings')
    stubRouter(TokenRouter, 'tokens')
    stubRouter(TransactionRouter, 'transactions')
    stubRouter(ContractRouter, 'contract')
    stubRouter(PluginRouter, 'plugins')

    await utils.wait(100) // Small wait to ensure stubs are applied

    // Create the v1 router
    const v1Router = V1Router.router()

    // Verify router is created correctly
    expect(v1Router instanceof Router).to.be.true

    // Verify all routers are mounted
    const routers = [
      VoteRouter,
      AssetRouter,
      DaoRouter,
      MemberRouter,
      ProposalRouter,
      SettingRouter,
      TokenRouter,
      TransactionRouter,
      ContractRouter,
      PluginRouter,
    ]
    expect(use.callCount).to.be.eq(routers.length)

    // Helper function to verify router mounting
    function expectRouter(path: string, name: string) {
      expect(use.calledWith(path, `${name}Routes`, `${name}AllowedMethod`)).to.be.true
    }

    // Verify each router is mounted at the correct path
    expectRouter('/assets', 'assets')
    expectRouter('/daos', 'daos')
    expectRouter('/members', 'members')
    expectRouter('/proposals', 'proposals')
    expectRouter('/settings', 'settings')
    expectRouter('/tokens', 'tokens')
    expectRouter('/transactions', 'transactions')
    expectRouter('/votes', 'votes')
    expectRouter('/contract', 'contract')
    expectRouter('/plugins', 'plugins')
  })

  it('Should create a functional router that can be used in a Koa app', async () => {
    // Create a simple stub for one of the routers to test functionality
    const daoRouterStub = new Router()
    daoRouterStub.get('/', ctx => {
      ctx.body = 'v1 daos response'
    })

    // Stub the dao router
    sandbox.stub(DaoRouter, 'router').returns(daoRouterStub)

    // For others, just return empty routers
    function emptyRouterStub(Rt: any) {
      sandbox.stub(Rt, 'router').returns(new Router())
    }

    emptyRouterStub(AssetRouter)
    emptyRouterStub(MemberRouter)
    emptyRouterStub(ProposalRouter)
    emptyRouterStub(SettingRouter)
    emptyRouterStub(TokenRouter)
    emptyRouterStub(TransactionRouter)
    emptyRouterStub(VoteRouter)
    emptyRouterStub(ContractRouter)
    emptyRouterStub(PluginRouter)

    // Create a test Koa app with the v1 router
    const app = new Koa()
    app.use(V1Router.router().routes())
    app.use(V1Router.router().allowedMethods())

    const request = supertest(app.callback())

    // Test that the router works
    const response = await request.get('/daos')
    expect(response.status).to.equal(200)
    expect(response.text).to.equal('v1 daos response')
  })
})
