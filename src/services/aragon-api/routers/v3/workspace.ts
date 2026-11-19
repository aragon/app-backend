import WorkspaceController from '@api/controllers/workspace'
import QueryParams from '@api/helpers/queryParams'
import WorkspaceSchema from '@api/routers/schema/workspace'
import Router, { type RouterContext } from '@koa/router'

const WorkspaceRouterV3 = {
  async getAccounts(ctx: RouterContext) {
    ctx.body = await WorkspaceController.getAccounts(await QueryParams.readQuery(ctx, WorkspaceSchema.accounts))
  },

  async getGovernances(ctx: RouterContext) {
    ctx.body = await WorkspaceController.getGovernances(await QueryParams.readQuery(ctx, WorkspaceSchema.governances))
  },

  async getAssets(ctx: RouterContext) {
    ctx.body = await WorkspaceController.getAssets(await QueryParams.readQuery(ctx, WorkspaceSchema.assets))
  },

  async getTransactions(ctx: RouterContext) {
    ctx.body = await WorkspaceController.getTransactions(await QueryParams.readQuery(ctx, WorkspaceSchema.transactions))
  },

  async getProposals(ctx: RouterContext) {
    ctx.body = await WorkspaceController.getProposals(await QueryParams.readQuery(ctx, WorkspaceSchema.proposals))
  },

  async getMembers(ctx: RouterContext) {
    ctx.body = await WorkspaceController.getMembers(await QueryParams.readQuery(ctx, WorkspaceSchema.members))
  },

  async getTodo(ctx: RouterContext) {
    ctx.body = await WorkspaceController.getTodo(
      await QueryParams.readQuery(ctx, WorkspaceSchema.todo, ['memberAddress']),
    )
  },

  router(): Router {
    const router = new Router()
    router.get('/query/accounts', WorkspaceRouterV3.getAccounts)
    router.get('/query/governances', WorkspaceRouterV3.getGovernances)
    router.get('/query/assets', WorkspaceRouterV3.getAssets)
    router.get('/query/transactions', WorkspaceRouterV3.getTransactions)
    router.get('/query/proposals', WorkspaceRouterV3.getProposals)
    router.get('/query/members', WorkspaceRouterV3.getMembers)
    router.get('/query/todo', WorkspaceRouterV3.getTodo)
    return router
  },
}

export default WorkspaceRouterV3
