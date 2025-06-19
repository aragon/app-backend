// src/services/aragon-api/routers/index.ts

import Router from '@koa/router'
import StatusRouter from './v1/status'
import V1Router from './v1'
import V2Router from './v2'
import config from '@config'

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
    // Extract all unique paths from both routers
    const v1Routes = new Set(MainRouter.getRouterPaths(v1Router))
    const v2Routes = new Set(MainRouter.getRouterPaths(v2Router))

    // Combine unique paths from both routers
    const allPaths = new Set([...v1Routes, ...v2Routes])

    // For each route, create appropriate handlers
    allPaths.forEach(path => {
      const existsInV2 = v2Routes.has(path)
      const existsInV1 = v1Routes.has(path)

      if (existsInV2) {
        // Path exists in v2 - use v2 implementation
        mainRouter.all(path, async (ctx, next) => {
          await v2Router.routes()(ctx, next)
        })
      } else if (existsInV1) {
        if (config.SERVICES.ARAGON_API.DEPRECATION_WARNING) {
          // Use v1 with deprecation warning
          mainRouter.all(path, async (ctx, next) => {
            ctx.response.set('X-API-Warning', 'This endpoint is using v1 API. No v2 version available.')
            await v1Router.routes()(ctx, next)
          })
        }
      }
    })

    // Add allowed methods middleware for both routers to handle OPTIONS requests
    mainRouter.use(v2Router.allowedMethods())
    mainRouter.use(v1Router.allowedMethods())
  },

  /**
   * Main router that handles API versioning
   * - Explicit versioning via /v1/* and /v2/* paths
   * - Root paths (/*) use v2 where available, falling back to v1
   */
  router() {
    const mainRouter = new Router()

    // Initialize all routers
    const statusRouter = StatusRouter.router()
    const v1Router = V1Router.router()
    const v2Router = V2Router.router()

    // Mount non-versioned endpoints
    mainRouter.get('/health', ctx => (ctx.status = 200))
    mainRouter.use(statusRouter.routes(), statusRouter.allowedMethods())

    // Mount explicit version paths
    mainRouter.use('/v1', v1Router.routes(), v1Router.allowedMethods())
    mainRouter.use('/v2', v2Router.routes(), v2Router.allowedMethods())

    // Set up root path versioning with fallback
    MainRouter.createVersionedRootPaths(mainRouter, v1Router, v2Router)

    return mainRouter
  },
}

export default MainRouter
