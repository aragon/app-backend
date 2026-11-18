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
  async getSuggestions(ctx: RouterContext) {
    const { address } = await ValidationSchema.validateParams(WorkspaceSchema.suggestionAddress, ctx.params)
    const pagination = await ValidationSchema.validateParams(WorkspaceSchema.suggestionPagination, ctx.query)
    ctx.body = await WorkspaceController.getSuggestions(address, pagination)
  },

  async getAccounts(ctx: RouterContext) {
    ctx.body = await WorkspaceController.getAccounts(await readRequest(ctx, WorkspaceSchema.accounts))
  },

  async getGovernances(ctx: RouterContext) {
    ctx.body = await WorkspaceController.getGovernances(await readRequest(ctx, WorkspaceSchema.governances))
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

  async getTodo(ctx: RouterContext) {
    ctx.body = await WorkspaceController.getTodo(await readRequest(ctx, WorkspaceSchema.todo))
  },

  router(): Router {
    const router = new Router()
    router.get('/suggestions/:address', WorkspaceRouter.getSuggestions)
    router.post('/query/accounts', WorkspaceRouter.getAccounts)
    router.post('/query/governances', WorkspaceRouter.getGovernances)
    router.post('/query/assets', WorkspaceRouter.getAssets)
    router.post('/query/transactions', WorkspaceRouter.getTransactions)
    router.post('/query/proposals', WorkspaceRouter.getProposals)
    router.post('/query/members', WorkspaceRouter.getMembers)
    router.post('/query/todo', WorkspaceRouter.getTodo)
    return router
  },
}

export default WorkspaceRouter
