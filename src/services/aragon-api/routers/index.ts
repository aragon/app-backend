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
   * Creates versioned root paths with automatic fallback from a priority router to a fallback router
   * @param mainRouter - The main router to add routes to
   * @param priorityRouter - The router to mount first (takes priority for overlapping routes)
   * @param fallbackRouter - The router to mount as fallback for routes not handled by priorityRouter
   */
  createVersionedRootPaths(mainRouter: Router, priorityRouter: Router, fallbackRouter: Router): void {
    mainRouter.use(priorityRouter.routes())
    mainRouter.use(priorityRouter.allowedMethods())

    mainRouter.use(fallbackRouter.routes())
    mainRouter.use(fallbackRouter.allowedMethods())
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
    MainRouter.createVersionedRootPaths(mainRouter, v3Router, v2Router)

    return mainRouter
  },
}

export default MainRouter
