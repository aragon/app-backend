import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import Router from '@koa/router'
import MainRouter from '@api/routers'
import StatusRouter from '@api/routers/v1/status'
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
    it('should set up routes with v2 priority and v1 fallback', () => {
      // Create test routers
      const v1Router = new Router()
      v1Router.get('/common', ctx => (ctx.body = 'v1-common'))
      v1Router.get('/v1-only', ctx => (ctx.body = 'v1-only'))

      const v2Router = new Router()
      v2Router.get('/common', ctx => (ctx.body = 'v2-common'))
      v2Router.get('/v2-only', ctx => (ctx.body = 'v2-only'))

      const mainRouter = new Router()

      // Mock router.all and router.use methods
      const allStub = sandbox.stub(mainRouter, 'all')
      const useStub = sandbox.stub(mainRouter, 'use')

      // Call the method
      MainRouter.createVersionedRootPaths(mainRouter, v1Router, v2Router)

      // Check that routes were added correctly
      expect(allStub.callCount).to.be.at.least(3) // 3 unique paths
      expect(useStub.callCount).to.be.equal(2) // 2 allowedMethods calls

      // Verify specific routes
      const paths = allStub.args.map(args => args[0])
      expect(paths).to.include('/common')
      expect(paths).to.include('/v1-only')
      expect(paths).to.include('/v2-only')
    })
  })

  describe('router', () => {
    it('Should create main router with versioned paths', async () => {
      // Set up stubs for the child routers
      const statusRouterStub = {
        routes: () => 'statusRoutes',
        allowedMethods: () => 'statusAllowedMethods',
      }

      const v1RouterStub = {
        routes: () => 'v1Routes',
        allowedMethods: () => 'v1AllowedMethods',
        stack: [{ path: '/v1-path' }],
      }

      const v2RouterStub = {
        routes: () => 'v2Routes',
        allowedMethods: () => 'v2AllowedMethods',
        stack: [{ path: '/v2-path' }],
      }

      sandbox.stub(StatusRouter, 'router').returns(statusRouterStub as any)
      sandbox.stub(V1Router, 'router').returns(v1RouterStub as any)
      sandbox.stub(V2Router, 'router').returns(v2RouterStub as any)

      // Spy on the use method
      const useStub = sandbox.stub(Router.prototype, 'use')
      const getStub = sandbox.stub(Router.prototype, 'get')

      // Create the router
      const mainRouter = MainRouter.router()

      // Check that it's a router instance
      expect(mainRouter instanceof Router).to.be.true

      // Verify health endpoint
      expect(getStub.calledWith('/health')).to.be.true

      // Verify status router was mounted
      expect(useStub.calledWith('statusRoutes', 'statusAllowedMethods')).to.be.true

      // Verify versioned paths were mounted
      expect(useStub.calledWith('/v1', 'v1Routes', 'v1AllowedMethods')).to.be.true
      expect(useStub.calledWith('/v2', 'v2Routes', 'v2AllowedMethods')).to.be.true

      // Verify createVersionedRootPaths was called
      const createVersionedStub = sandbox.stub(MainRouter, 'createVersionedRootPaths')
      MainRouter.router() // Call again with the stub in place
      expect(createVersionedStub.calledOnce).to.be.true
    })

    it('Should setup mainRouter with all routes working', async () => {
      // For this test, we'll need a basic Koa app with the router
      const app = new Koa()

      // Create very simple v1 and v2 routers for testing
      const mockV1Router = new Router()
      mockV1Router.get('/test', ctx => {
        ctx.body = 'v1 response'
      })

      const mockV2Router = new Router()
      mockV2Router.get('/test', ctx => {
        ctx.body = 'v2 response'
      })
      mockV2Router.get('/v2-only', ctx => {
        ctx.body = 'v2 only response'
      })

      // Stub the router methods to return our mocks
      sandbox.stub(V1Router, 'router').returns(mockV1Router)
      sandbox.stub(V2Router, 'router').returns(mockV2Router)

      // Use the main router
      app.use(MainRouter.router().routes())
      const request = supertest(app.callback())

      // Test versioned paths
      const v1Response = await request.get('/v1/test')
      expect(v1Response.status).to.equal(200)
      expect(v1Response.text).to.equal('v1 response')

      const v2Response = await request.get('/v2/test')
      expect(v2Response.status).to.equal(200)
      expect(v2Response.text).to.equal('v2 response')

      // Test root path (should use v2)
      const rootResponse = await request.get('/test')
      expect(rootResponse.status).to.equal(200)
      expect(rootResponse.text).to.equal('v2 response')

      // Test v2-only path at root
      const v2OnlyResponse = await request.get('/v2-only')
      expect(v2OnlyResponse.status).to.equal(200)
      expect(v2OnlyResponse.text).to.equal('v2 only response')
    })
  })
})
