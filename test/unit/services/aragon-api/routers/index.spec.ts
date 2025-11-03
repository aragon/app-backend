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

    it('should return empty array for router with null stack', () => {
      const testRouter = { stack: null } as any
      const paths = MainRouter.getRouterPaths(testRouter)
      expect(paths).to.deep.equal([])
    })

    it('should return empty array for router with undefined stack', () => {
      const testRouter = { stack: undefined } as any
      const paths = MainRouter.getRouterPaths(testRouter)
      expect(paths).to.deep.equal([])
    })

    it('should return empty array for router with non-array stack', () => {
      const testRouter = { stack: 'not-an-array' } as any
      const paths = MainRouter.getRouterPaths(testRouter)
      expect(paths).to.deep.equal([])
    })

    it('should filter out layers without paths', () => {
      const testRouter = new Router()
      testRouter.get('/test1', ctx => (ctx.body = 'test1'))
      // Manually add a layer without a path
      testRouter.stack.push({ path: undefined } as any)
      testRouter.get('/test2', ctx => (ctx.body = 'test2'))

      const paths = MainRouter.getRouterPaths(testRouter)
      expect(paths).to.deep.equal(['/test1', '/test2'])
    })

    it('should handle router with empty stack', () => {
      const testRouter = new Router()
      const paths = MainRouter.getRouterPaths(testRouter)
      expect(paths).to.deep.equal([])
    })

    it('should handle routes with different HTTP methods', () => {
      const testRouter = new Router()
      testRouter.get('/get-route', ctx => (ctx.body = 'get'))
      testRouter.post('/post-route', ctx => (ctx.body = 'post'))
      testRouter.put('/put-route', ctx => (ctx.body = 'put'))
      testRouter.delete('/delete-route', ctx => (ctx.body = 'delete'))
      testRouter.patch('/patch-route', ctx => (ctx.body = 'patch'))

      const paths = MainRouter.getRouterPaths(testRouter)
      expect(paths).to.deep.equal(['/get-route', '/post-route', '/put-route', '/delete-route', '/patch-route'])
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

    it('should call routes() and allowedMethods() on v1 and v2 routers', () => {
      const v1Router = new Router()
      const v2Router = new Router()
      const mainRouter = new Router()

      const v1RoutesSpy = sandbox.spy(v1Router, 'routes')
      const v1AllowedMethodsSpy = sandbox.spy(v1Router, 'allowedMethods')
      const v2RoutesSpy = sandbox.spy(v2Router, 'routes')
      const v2AllowedMethodsSpy = sandbox.spy(v2Router, 'allowedMethods')

      MainRouter.createVersionedRootPaths(mainRouter, v1Router, v2Router)

      expect(v1RoutesSpy.calledOnce).to.be.true
      expect(v1AllowedMethodsSpy.calledOnce).to.be.true
      expect(v2RoutesSpy.calledOnce).to.be.true
      expect(v2AllowedMethodsSpy.calledOnce).to.be.true
    })

    it('should add middleware between v2 and v1 routes', async () => {
      const v1Router = new Router()
      const v2Router = new Router()
      const mainRouter = new Router()

      const useStub = sandbox.stub(mainRouter, 'use')

      MainRouter.createVersionedRootPaths(mainRouter, v1Router, v2Router)

      // Get the middleware function (3rd call)
      const middleware = useStub.getCall(2).args[0] as any

      // Verify it's an async function
      expect(middleware).to.be.a('function')

      // Test the middleware by calling it
      let nextCalled = false
      const mockNext = async () => {
        nextCalled = true
      }
      const mockCtx = {}

      await middleware(mockCtx, mockNext)

      // Verify next was called
      expect(nextCalled).to.be.true
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

    it('should mount explicit version paths with /v1 and /v2 prefixes', async () => {
      const mockV1Router = new Router()
      mockV1Router.get('/endpoint', ctx => {
        ctx.body = 'v1 endpoint'
      })

      const mockV2Router = new Router()
      mockV2Router.get('/endpoint', ctx => {
        ctx.body = 'v2 endpoint'
      })

      sandbox.stub(V1Router, 'router').returns(mockV1Router)
      sandbox.stub(V2Router, 'router').returns(mockV2Router)

      const app = new Koa()
      app.use(MainRouter.router().routes())
      const request = supertest(app.callback())

      // Test that explicit versions work
      const v1Explicit = await request.get('/v1/endpoint')
      expect(v1Explicit.status).to.equal(200)
      expect(v1Explicit.text).to.equal('v1 endpoint')

      const v2Explicit = await request.get('/v2/endpoint')
      expect(v2Explicit.status).to.equal(200)
      expect(v2Explicit.text).to.equal('v2 endpoint')
    })

    it('should create a new Router instance each time', () => {
      const router1 = MainRouter.router()
      const router2 = MainRouter.router()

      expect(router1).to.be.instanceOf(Router)
      expect(router2).to.be.instanceOf(Router)
      expect(router1).to.not.equal(router2)
    })

    it('should mount status router', async () => {
      const app = new Koa()
      const mainRouter = MainRouter.router()
      app.use(mainRouter.routes())
      const request = supertest(app.callback())

      // The status router should be mounted and accessible
      // Note: We're testing that the router is mounted, not specific status endpoints
      // as those might vary
      const response = await request.get('/health')
      expect(response.status).to.equal(200)
    })

    it('should handle HTTP methods for /health endpoint', async () => {
      const app = new Koa()
      const mainRouter = MainRouter.router()
      app.use(mainRouter.routes())
      const request = supertest(app.callback())

      // GET should work
      const getResponse = await request.get('/health')
      expect(getResponse.status).to.equal(200)

      // POST should return 404 or method not allowed
      const postResponse = await request.post('/health')
      expect([404, 405]).to.include(postResponse.status)
    })

    it('should call createVersionedRootPaths with correct routers', () => {
      const createVersionedRootPathsSpy = sandbox.spy(MainRouter, 'createVersionedRootPaths')

      MainRouter.router()

      expect(createVersionedRootPathsSpy.calledOnce).to.be.true

      // Verify that it was called with the main router and both v1 and v2 routers
      const call = createVersionedRootPathsSpy.getCall(0)
      expect(call.args[0]).to.be.instanceOf(Router) // mainRouter
      expect(call.args[1]).to.be.instanceOf(Router) // v1Router
      expect(call.args[2]).to.be.instanceOf(Router) // v2Router
    })

    it('should handle different HTTP methods on versioned routes', async () => {
      const mockV1Router = new Router()
      mockV1Router.post('/create', ctx => {
        ctx.body = 'v1 create'
        ctx.status = 201
      })

      const mockV2Router = new Router()
      mockV2Router.post('/create', ctx => {
        ctx.body = 'v2 create'
        ctx.status = 201
      })

      sandbox.stub(V1Router, 'router').returns(mockV1Router)
      sandbox.stub(V2Router, 'router').returns(mockV2Router)

      const app = new Koa()
      app.use(MainRouter.router().routes())
      const request = supertest(app.callback())

      // Test POST on v1
      const v1Post = await request.post('/v1/create')
      expect(v1Post.status).to.equal(201)
      expect(v1Post.text).to.equal('v1 create')

      // Test POST on v2
      const v2Post = await request.post('/v2/create')
      expect(v2Post.status).to.equal(201)
      expect(v2Post.text).to.equal('v2 create')

      // Test POST on root (should use v2)
      const rootPost = await request.post('/create')
      expect(rootPost.status).to.equal(201)
      expect(rootPost.text).to.equal('v2 create')
    })
  })
})
