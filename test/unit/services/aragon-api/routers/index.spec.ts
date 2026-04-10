import MainRouter from '@api/routers'
import Router from '@koa/router'
import V2Router from '@services/aragon-api/routers/v2'
import V3Router from '@services/aragon-api/routers/v3'
import { expect } from 'chai'
import Koa from 'koa'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
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
    it('should mount priority router first, then fallback router', () => {
      const priorityRouter = new Router()
      const fallbackRouter = new Router()
      const mainRouter = new Router()

      const priorityRoutesStub = sandbox.stub().returns('priorityRoutes')
      const priorityAllowedMethodsStub = sandbox.stub().returns('priorityAllowedMethods')
      const fallbackRoutesStub = sandbox.stub().returns('fallbackRoutes')
      const fallbackAllowedMethodsStub = sandbox.stub().returns('fallbackAllowedMethods')

      priorityRouter.routes = priorityRoutesStub
      priorityRouter.allowedMethods = priorityAllowedMethodsStub
      fallbackRouter.routes = fallbackRoutesStub
      fallbackRouter.allowedMethods = fallbackAllowedMethodsStub

      const useStub = sandbox.stub(mainRouter, 'use')

      MainRouter.createVersionedRootPaths(mainRouter, priorityRouter, fallbackRouter)

      expect(useStub.callCount).to.equal(4)

      // Priority routes mounted first
      expect(useStub.getCall(0).args[0]).to.equal('priorityRoutes')
      expect(useStub.getCall(1).args[0]).to.equal('priorityAllowedMethods')

      // Fallback routes mounted second
      expect(useStub.getCall(2).args[0]).to.equal('fallbackRoutes')
      expect(useStub.getCall(3).args[0]).to.equal('fallbackAllowedMethods')
    })

    it('should call routes() and allowedMethods() on both routers', () => {
      const priorityRouter = new Router()
      const fallbackRouter = new Router()
      const mainRouter = new Router()

      const priorityRoutesSpy = sandbox.spy(priorityRouter, 'routes')
      const priorityAllowedMethodsSpy = sandbox.spy(priorityRouter, 'allowedMethods')
      const fallbackRoutesSpy = sandbox.spy(fallbackRouter, 'routes')
      const fallbackAllowedMethodsSpy = sandbox.spy(fallbackRouter, 'allowedMethods')

      MainRouter.createVersionedRootPaths(mainRouter, priorityRouter, fallbackRouter)

      expect(priorityRoutesSpy.calledOnce).to.be.true
      expect(priorityAllowedMethodsSpy.calledOnce).to.be.true
      expect(fallbackRoutesSpy.calledOnce).to.be.true
      expect(fallbackAllowedMethodsSpy.calledOnce).to.be.true
    })
  })

  describe('router', () => {
    it('Should create main router with versioned paths', async () => {
      const mainRouter = MainRouter.router()

      expect(mainRouter instanceof Router).to.be.true

      const app = new Koa()
      app.use(mainRouter.routes())
      const request = supertest(app.callback())

      const healthResponse = await request.get('/health')
      expect(healthResponse.status).to.equal(200)
    })

    it('Should prioritize v3 over v2 for overlapping root routes', async () => {
      const mockV2Router = new Router()
      mockV2Router.get('/test', ctx => {
        ctx.body = 'v2 response'
      })
      mockV2Router.get('/v2-only', ctx => {
        ctx.body = 'v2 only'
      })

      const mockV3Router = new Router()
      mockV3Router.get('/test', ctx => {
        ctx.body = 'v3 response'
      })

      sandbox.stub(V2Router, 'router').returns(mockV2Router)
      sandbox.stub(V3Router, 'router').returns(mockV3Router)

      const app = new Koa()
      app.use(MainRouter.router().routes())
      const request = supertest(app.callback())

      // Explicit versioned paths
      const v2Response = await request.get('/v2/test')
      expect(v2Response.status).to.equal(200)
      expect(v2Response.text).to.equal('v2 response')

      const v3Response = await request.get('/v3/test')
      expect(v3Response.status).to.equal(200)
      expect(v3Response.text).to.equal('v3 response')

      // Root path should use v3 (priority)
      const rootResponse = await request.get('/test')
      expect(rootResponse.status).to.equal(200)
      expect(rootResponse.text).to.equal('v3 response')

      // v2-only path should still be served at root (fallback)
      const v2OnlyResponse = await request.get('/v2-only')
      expect(v2OnlyResponse.status).to.equal(200)
      expect(v2OnlyResponse.text).to.equal('v2 only')
    })

    it('should return 404 for removed /v1 paths', async () => {
      const mockV2Router = new Router()
      mockV2Router.get('/endpoint', ctx => {
        ctx.body = 'v2 endpoint'
      })

      sandbox.stub(V2Router, 'router').returns(mockV2Router)

      const app = new Koa()
      app.use(MainRouter.router().routes())
      const request = supertest(app.callback())

      const v1Response = await request.get('/v1/endpoint')
      expect(v1Response.status).to.equal(404)

      const v2Response = await request.get('/v2/endpoint')
      expect(v2Response.status).to.equal(200)
      expect(v2Response.text).to.equal('v2 endpoint')
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

      const response = await request.get('/health')
      expect(response.status).to.equal(200)
    })

    it('should handle HTTP methods for /health endpoint', async () => {
      const app = new Koa()
      const mainRouter = MainRouter.router()
      app.use(mainRouter.routes())
      const request = supertest(app.callback())

      const getResponse = await request.get('/health')
      expect(getResponse.status).to.equal(200)

      const postResponse = await request.post('/health')
      expect([404, 405]).to.include(postResponse.status)
    })

    it('should call createVersionedRootPaths with correct routers', () => {
      const createVersionedRootPathsSpy = sandbox.spy(MainRouter, 'createVersionedRootPaths')

      MainRouter.router()

      expect(createVersionedRootPathsSpy.calledOnce).to.be.true

      const call = createVersionedRootPathsSpy.getCall(0)
      expect(call.args[0]).to.be.instanceOf(Router) // mainRouter
      expect(call.args[1]).to.be.instanceOf(Router) // priorityRouter (v3)
      expect(call.args[2]).to.be.instanceOf(Router) // fallbackRouter (v2)
    })

    it('should handle different HTTP methods on versioned routes', async () => {
      const mockV2Router = new Router()
      mockV2Router.post('/create', ctx => {
        ctx.body = 'v2 create'
        ctx.status = 201
      })

      // Stub v3 with an empty router so root /create deterministically falls back to v2
      const emptyV3Router = new Router()

      sandbox.stub(V2Router, 'router').returns(mockV2Router)
      sandbox.stub(V3Router, 'router').returns(emptyV3Router)

      const app = new Koa()
      app.use(MainRouter.router().routes())
      const request = supertest(app.callback())

      const v2Post = await request.post('/v2/create')
      expect(v2Post.status).to.equal(201)
      expect(v2Post.text).to.equal('v2 create')

      const rootPost = await request.post('/create')
      expect(rootPost.status).to.equal(201)
      expect(rootPost.text).to.equal('v2 create')
    })
  })
})
