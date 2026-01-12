import AssetRouter from '@api/routers/v2/asset'
import CapitalDistributorRouter from '@api/routers/v2/capitalDistributor'
import ContractRouter from '@api/routers/v2/contract'
import DaoRouter from '@api/routers/v2/dao'
import ExecuteSelectorRouter from '@api/routers/v2/executeSelector'
import GaugeRouter from '@api/routers/v2/gauge'
import PermissionRouter from '@api/routers/v2/permission'
import PluginRouter from '@api/routers/v2/plugins'
import PolicyRouter from '@api/routers/v2/policy'
import SettingRouter from '@api/routers/v2/setting'
import SimulationRouter from '@api/routers/v2/simulation'
import TokenRouter from '@api/routers/v2/token'
import TransactionRouter from '@api/routers/v2/transaction'
import VoteRouter from '@api/routers/v2/vote'
import utils from '@helpers/utils'
import Router from '@koa/router'
import V2Router from '@services/aragon-api/routers/v2'
import MemberRouter from '@services/aragon-api/routers/v2/member'
import ProposalRouter from '@services/aragon-api/routers/v2/proposal'
import { expect } from 'chai'
import Koa from 'koa'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import supertest from 'supertest'

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
    stubRouter(CapitalDistributorRouter, 'capital-distributors')
    stubRouter(SimulationRouter, 'simulations')
    stubRouter(GaugeRouter, 'gauge')
    stubRouter(PermissionRouter, 'permissions')
    stubRouter(PolicyRouter, 'policies')

    await utils.wait(100) // Small wait to ensure stubs are applied

    // Create the v2 router
    const v2Router = V2Router.router()

    // Verify router is created correctly
    expect(v2Router instanceof Router).to.be.true

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
      ExecuteSelectorRouter,
      CapitalDistributorRouter,
      SimulationRouter,
      GaugeRouter,
      PermissionRouter,
      PolicyRouter,
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
    expectRouter('/execute-selectors', 'execute-selectors')
    expectRouter('/capital-distributor', 'capital-distributors')
    expectRouter('/simulations', 'simulations')
    expectRouter('/permissions', 'permissions')
    expectRouter('/policies', 'policies')
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
    emptyRouterStub(VoteRouter)
    emptyRouterStub(ContractRouter)
    emptyRouterStub(PluginRouter)
    emptyRouterStub(ExecuteSelectorRouter)
    emptyRouterStub(CapitalDistributorRouter)
    emptyRouterStub(PermissionRouter)

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
