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

describe('Router: V2Router', () => {
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
    stubRouter(MemberRouter, 'members')
    stubRouter(ProposalRouter, 'proposals')

    await utils.wait(100) // Small wait to ensure stubs are applied

    // Create the v2 router
    const v2Router = V2Router.router()

    // Verify router is created correctly
    expect(v2Router instanceof Router).to.be.true

    // Verify all routers are mounted
    expect(use.callCount).to.be.eq(2) // 3 routers should be mounted

    // Helper function to verify router mounting
    function expectRouter(path: string, name: string) {
      expect(use.calledWith(path, `${name}Routes`, `${name}AllowedMethod`)).to.be.true
    }

    // Verify each router is mounted at the correct path
    expectRouter('/members', 'members')
    expectRouter('/proposals', 'proposals')
  })

  it('Should create a functional router that can be used in a Koa app', async () => {
    // Create a simple stub for one of the routers to test functionality
    const proposalRouterStub = new Router()
    proposalRouterStub.get('/', ctx => {
      ctx.body = 'v2 proposals response'
    })

    // Stub the proposal router
    sandbox.stub(ProposalRouter, 'router').returns(proposalRouterStub)

    // For others, just return empty routers
    function emptyRouterStub(Rt: any) {
      sandbox.stub(Rt, 'router').returns(new Router())
    }

    emptyRouterStub(MemberRouter)

    // Create a test Koa app with the v2 router
    const app = new Koa()
    app.use(V2Router.router().routes())
    app.use(V2Router.router().allowedMethods())

    const request = supertest(app.callback())

    // Test that the router works
    const response = await request.get('/proposals')
    expect(response.status).to.equal(200)
    expect(response.text).to.equal('v2 proposals response')
  })

  it('Should handle routes differently than v1 implementations', async () => {
    // This test verifies that v2 routes can provide different implementations
    // Create a router that responds differently than the v1 equivalent would
    const memberRouterStub = new Router()
    memberRouterStub.get('/enhanced', ctx => {
      ctx.body = { version: 'v2', enhanced: true }
    })

    sandbox.stub(MemberRouter, 'router').returns(memberRouterStub)
    sandbox.stub(ProposalRouter, 'router').returns(new Router())

    // Create a test Koa app with the v2 router
    const app = new Koa()
    app.use(V2Router.router().routes())
    app.use(V2Router.router().allowedMethods())

    const request = supertest(app.callback())

    // Test v2-specific functionality
    const response = await request.get('/members/enhanced')
    expect(response.status).to.equal(200)
    expect(response.body).to.deep.equal({ version: 'v2', enhanced: true })
  })
})
