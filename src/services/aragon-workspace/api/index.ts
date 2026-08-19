import Router from '@koa/router'
import WorkspaceRouter from '@workspace/api/router'

const MainWorkspaceRouter = {
  router(): Router {
    const workspaceRouter = WorkspaceRouter.router()

    const mainWorkspaceRouter = new Router()

    mainWorkspaceRouter.get('/health', ctx => (ctx.status = 200))
    mainWorkspaceRouter.use('/workspace', workspaceRouter.routes(), workspaceRouter.allowedMethods())

    return mainWorkspaceRouter
  },
}

export default MainWorkspaceRouter
