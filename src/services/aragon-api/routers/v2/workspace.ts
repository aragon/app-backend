import WorkspaceController from '@api/controllers/workspace'
import WorkspaceSchema from '@api/routers/schema/workspace'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'
import Joi from 'joi'

async function readRequest(ctx: RouterContext, schema: Joi.ObjectSchema) {
  await ValidationSchema.validateParams(Joi.object().max(0), ctx.query)
  const result = await ValidationSchema.validateRoute(ctx, {
    params: { request: ctx.request.body },
    schemas: { params: Joi.object({ request: schema.required() }) },
  })
  // POST responses depend on the account list in the body, not just the URL.
  ctx.set('Cache-Control', 'no-store')
  return result.params.request
}

const WorkspaceRouter = {
  async getAccounts(ctx: RouterContext) {
    ctx.body = await WorkspaceController.getAccounts(await readRequest(ctx, WorkspaceSchema.accounts))
  },

  async getAssets(ctx: RouterContext) {
    ctx.body = await WorkspaceController.getAssets(await readRequest(ctx, WorkspaceSchema.assets))
  },

  async getTransactions(ctx: RouterContext) {
    ctx.body = await WorkspaceController.getTransactions(await readRequest(ctx, WorkspaceSchema.transactions))
  },

  async getProposals(ctx: RouterContext) {
    ctx.body = await WorkspaceController.getProposals(await readRequest(ctx, WorkspaceSchema.proposals))
  },

  async getMembers(ctx: RouterContext) {
    ctx.body = await WorkspaceController.getMembers(await readRequest(ctx, WorkspaceSchema.members))
  },

  router(): Router {
    const router = new Router()
    router.post('/query/accounts', WorkspaceRouter.getAccounts)
    router.post('/query/assets', WorkspaceRouter.getAssets)
    router.post('/query/transactions', WorkspaceRouter.getTransactions)
    router.post('/query/proposals', WorkspaceRouter.getProposals)
    router.post('/query/members', WorkspaceRouter.getMembers)
    return router
  },
}

export default WorkspaceRouter
