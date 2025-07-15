import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Router from '@koa/router'
import V2Router from '@services/aragon-api/routers/v2'
import MemberRouter from '@services/aragon-api/routers/v2/member'
import ProposalRouter from '@services/aragon-api/routers/v2/proposal'
import utils from '@helpers/utils'
import Koa from 'koa'
import supertest from 'supertest'
import VoteRouter from '@api/routers/v2/vote'
import DelegateRouter from '@api/routers/v2/delegate'
import AssetRouter from '@api/routers/v2/asset'
import DaoRouter from '@api/routers/v2/dao'
import SettingRouter from '@api/routers/v2/setting'
import TokenRouter from '@api/routers/v2/token'
import TransactionRouter from '@api/routers/v2/transaction'
import ContractRouter from '@api/routers/v2/contract'
import PluginRouter from '@api/routers/v2/plugins'
import ExecuteSelectorRouter from '@api/routers/v2/executeSelector'

describe('RouterV2: V2Router', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should correctly initialize and mount all v2 routers', async () => {
    const use = sandbox.stub(Router.prototype, 'use')

    function stubRouter(Rt: any, name: string) {
      return sandbox.stub(Rt, 'router').returns({
        routes: sandbox.stub().returns(`${name}Routes`),
        allowedMethods: sandbox.stub().returns(`${name}AllowedMethod`),
      })
    }

    // Stub all v2 routers
    stubRouter(VoteRouter, 'votes')
    stubRouter(DelegateRouter, 'delegates')
    stubRouter(AssetRouter, 'assets')
    stubRouter(DaoRouter, 'daos')
    stubRouter(MemberRouter, 'members')
    stubRouter(ProposalRouter, 'proposals')
    stubRouter(SettingRouter, 'settings')
    stubRouter(TokenRouter, 'tokens')
    stubRouter(TransactionRouter, 'transactions')
    stubRouter(ContractRouter, 'contract')
    stubRouter(PluginRouter, 'plugins')
    stubRouter(ExecuteSelectorRouter, 'execute-selectors')

    await utils.wait(100) // Small wait to ensure stubs are applied

    // Create the v2 router
    const v2Router = V2Router.router()

    // Verify router is created correctly
    expect(v2Router instanceof Router).to.be.true

    const routers = [
      VoteRouter,
      DelegateRouter,
      AssetRouter,
      DaoRouter,
      MemberRouter,
      ProposalRouter,
      SettingRouter,
      TokenRouter,
      TransactionRouter,
      ContractRouter,
      PluginRouter,
      ExecuteSelectorRouter,
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
    expectRouter('/delegates', 'delegates')
    expectRouter('/votes', 'votes')
    expectRouter('/contract', 'contract')
    expectRouter('/plugins', 'plugins')
    expectRouter('/execute-selectors', 'execute-selectors')
  })

  it('Should create a functional router that can be used in a Koa app', async () => {
    // Create a simple stub for one of the routers to test functionality
    const daoRouterStub = new Router()
    daoRouterStub.get('/', ctx => {
      ctx.body = 'v2 daos response'
    })

    // Stub the proposal router
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
    emptyRouterStub(DelegateRouter)
    emptyRouterStub(VoteRouter)
    emptyRouterStub(ContractRouter)
    emptyRouterStub(PluginRouter)
    emptyRouterStub(ExecuteSelectorRouter)

    // Create a test Koa app with the v2 router
    const app = new Koa()
    app.use(V2Router.router().routes())
    app.use(V2Router.router().allowedMethods())

    const request = supertest(app.callback())

    // Test that the router works
    const response = await request.get('/daos')
    expect(response.status).to.equal(200)
    expect(response.text).to.equal('v2 daos response')
  })
})
