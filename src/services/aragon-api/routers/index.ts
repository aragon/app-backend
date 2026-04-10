// src/services/aragon-api/routers/index.ts

import StatusRouter from '@api/status'
import Router from '@koa/router'
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
   * Creates versioned root paths with automatic fallback from v3 to v2
   * @param mainRouter - The main router to add routes to
   * @param v2Router - The v2 router (fallback)
   * @param v3Router - The v3 router (priority)
   */
  createVersionedRootPaths(mainRouter: Router, v2Router: Router, v3Router: Router): void {
    mainRouter.use(v3Router.routes())
    mainRouter.use(v3Router.allowedMethods())

    mainRouter.use(v2Router.routes())
    mainRouter.use(v2Router.allowedMethods())
  },

  /**
   * Main router that handles API versioning
   * - Explicit versioning via /v2/* and /v3/* paths
   * - Root paths (/*) use v3 where available, falling back to v2
   */
  router(): Router {
    const mainRouter = new Router()

    // Initialize all routers
    const statusRouter = StatusRouter.router()
    const v2Router = V2Router.router()
    const v3Router = V3Router.router()

    // Mount non-versioned endpoints
    mainRouter.get('/health', ctx => (ctx.status = 200))
    mainRouter.use(statusRouter.routes(), statusRouter.allowedMethods())

    // Mount explicit version paths
    mainRouter.use('/v2', v2Router.routes(), v2Router.allowedMethods())
    mainRouter.use('/v3', v3Router.routes(), v3Router.allowedMethods())

    // Set up root path versioning: v3 first, v2 as fallback
    MainRouter.createVersionedRootPaths(mainRouter, v2Router, v3Router)

    return mainRouter
  },
}

export default MainRouter
