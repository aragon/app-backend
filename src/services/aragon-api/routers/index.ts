// src/services/aragon-api/routers/index.ts

import StatusRouter from '@api/status'
import Router from '@koa/router'
import V1Router from './v1'
import V2Router from './v2'
import V3Router from './v3'

const MainRouter = {
  /**
   * Extract all route paths from a router
   * @param router - Koa router instance
   * @returns Array of route paths
   */
  getRouterPaths(router: Router): string[] {
    if (!router.stack || !Array.isArray(router.stack)) {
      return []
    }

    return router.stack.filter(layer => layer.path !== undefined).map(layer => layer.path as string)
  },

  /**
   * Creates versioned root paths with automatic fallback from v2 to v1
   * @param mainRouter - The main router to add routes to
   * @param v1Router - The v1 router implementation
   * @param v2Router - The v2 router implementation
   */
  createVersionedRootPaths(mainRouter: Router, v1Router: Router, v2Router: Router): void {
    mainRouter.use(v2Router.routes())
    mainRouter.use(v2Router.allowedMethods())

    // Then mount v1 as fallback with deprecation warning
    mainRouter.use(async (ctx, next) => {
      await next()
    })
    mainRouter.use(v1Router.routes())
    mainRouter.use(v1Router.allowedMethods())
  },

  /**
   * Main router that handles API versioning
   * - Explicit versioning via /v1/* and /v2/* paths
   * - Root paths (/*) use v2 where available, falling back to v1
   */
  router(): Router {
    const mainRouter = new Router()

    // Initialize all routers
    const statusRouter = StatusRouter.router()
    const v1Router = V1Router.router()
    const v2Router = V2Router.router()
    const v3Router = V3Router.router()

    // Mount non-versioned endpoints
    mainRouter.get('/health', ctx => (ctx.status = 200))
    mainRouter.use(statusRouter.routes(), statusRouter.allowedMethods())

    // Mount explicit version paths
    mainRouter.use('/v1', v1Router.routes(), v1Router.allowedMethods())
    mainRouter.use('/v2', v2Router.routes(), v2Router.allowedMethods())
    mainRouter.use('/v3', v3Router.routes(), v3Router.allowedMethods())

    // Set up root path versioning with fallback
    MainRouter.createVersionedRootPaths(mainRouter, v1Router, v2Router)

    return mainRouter
  },
}

export default MainRouter
