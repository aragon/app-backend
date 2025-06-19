import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Router from '@koa/router'
import MainRouter from '@api/routers'
import V1Router from '@services/aragon-api/routers/v1'
import V2Router from '@services/aragon-api/routers/v2'
import Koa from 'koa'
import supertest from 'supertest'

describe('Router: MainRouter', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getRouterPaths', () => {
    it('should extract paths from router stack', () => {
      const testRouter = new Router()
      testRouter.get('/test1', ctx => (ctx.body = 'test1'))
      testRouter.post('/test2', ctx => (ctx.body = 'test2'))

      const paths = MainRouter.getRouterPaths(testRouter)
      expect(paths).to.deep.equal(['/test1', '/test2'])
    })

    it('should return empty array for invalid router', () => {
      const paths = MainRouter.getRouterPaths({} as Router)
      expect(paths).to.deep.equal([])
    })
  })

  describe('createVersionedRootPaths', () => {
    it('should mount v2 routes first, then v1 routes with middleware', () => {
      // Create test routers
      const v1Router = new Router()
      const v2Router = new Router()
      const mainRouter = new Router()

      // Create stubs for router methods
      const v1RoutesStub = sandbox.stub().returns('v1Routes')
      const v1AllowedMethodsStub = sandbox.stub().returns('v1AllowedMethods')
      const v2RoutesStub = sandbox.stub().returns('v2Routes')
      const v2AllowedMethodsStub = sandbox.stub().returns('v2AllowedMethods')

      v1Router.routes = v1RoutesStub
      v1Router.allowedMethods = v1AllowedMethodsStub
      v2Router.routes = v2RoutesStub
      v2Router.allowedMethods = v2AllowedMethodsStub

      // Spy on mainRouter.use
      const useStub = sandbox.stub(mainRouter, 'use')

      // Call the method
      MainRouter.createVersionedRootPaths(mainRouter, v1Router, v2Router)

      // Verify the order of calls
      expect(useStub.callCount).to.equal(5)

      // First call: v2 routes
      expect(useStub.getCall(0).args[0]).to.equal('v2Routes')

      // Second call: v2 allowed methods
      expect(useStub.getCall(1).args[0]).to.equal('v2AllowedMethods')

      // Third call: middleware function
      expect(typeof useStub.getCall(2).args[0]).to.equal('function')

      // Fourth call: v1 routes
      expect(useStub.getCall(3).args[0]).to.equal('v1Routes')

      // Fifth call: v1 allowed methods
      expect(useStub.getCall(4).args[0]).to.equal('v1AllowedMethods')
    })
  })

  describe('router', () => {
    it('Should create main router with versioned paths', async () => {
      // Create the router first to spy on it
      const mainRouter = MainRouter.router()

      // Check that it's a router instance
      expect(mainRouter instanceof Router).to.be.true

      // Check that routes are set up properly by testing actual functionality
      const app = new Koa()
      app.use(mainRouter.routes())
      const request = supertest(app.callback())

      // Test health endpoint
      const healthResponse = await request.get('/health')
      expect(healthResponse.status).to.equal(200)
    })

    it('Should handle v2 priority over v1 for overlapping routes', async () => {
      // Create test routers with overlapping routes
      const mockV1Router = new Router()
      mockV1Router.get('/test', ctx => {
        ctx.body = 'v1 response'
      })
      mockV1Router.get('/v1-only', ctx => {
        ctx.body = 'v1 only'
      })

      const mockV2Router = new Router()
      mockV2Router.get('/test', ctx => {
        ctx.body = 'v2 response'
      })
      mockV2Router.get('/v2-only', ctx => {
        ctx.body = 'v2 only'
      })

      // Stub the router methods to return our mocks
      sandbox.stub(V1Router, 'router').returns(mockV1Router)
      sandbox.stub(V2Router, 'router').returns(mockV2Router)

      // Create app with main router
      const app = new Koa()
      app.use(MainRouter.router().routes())
      const request = supertest(app.callback())

      // Test versioned paths work correctly
      const v1Response = await request.get('/v1/test')
      expect(v1Response.status).to.equal(200)
      expect(v1Response.text).to.equal('v1 response')

      const v2Response = await request.get('/v2/test')
      expect(v2Response.status).to.equal(200)
      expect(v2Response.text).to.equal('v2 response')

      // Test root path with overlapping route (should use v2)
      const rootResponse = await request.get('/test')
      expect(rootResponse.status).to.equal(200)
      expect(rootResponse.text).to.equal('v2 response')

      // Test v2-only path at root
      const v2OnlyResponse = await request.get('/v2-only')
      expect(v2OnlyResponse.status).to.equal(200)
      expect(v2OnlyResponse.text).to.equal('v2 only')

      // Test v1-only path at root (should work with v1)
      const v1OnlyResponse = await request.get('/v1-only')
      expect(v1OnlyResponse.status).to.equal(200)
      expect(v1OnlyResponse.text).to.equal('v1 only')
    })
  })
})
