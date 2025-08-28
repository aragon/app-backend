import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import SimulationSchema from '@api/routers/schema/simulation'
import SimulationController from '@api/controllers/simulation'

const SimulationRouter = {
  async simulateBundle(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        actions: (ctx.request.body as any).actions,
        network: ctx.params.network,
      },
      schemas: {
        params: SimulationSchema.simulateBundle,
      },
    })

    ctx.body = await SimulationController.simulateBundle(result.params.actions, result.params.network)
  },

  async simulateProposal(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        proposalId: ctx.params.proposalId,
      },
      schemas: {
        params: SimulationSchema.simulateProposal,
      },
    })

    ctx.body = await SimulationController.simulateProposal(result.params.proposalId)
  },

  async getSimulationResultOfProposal(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        proposalId: ctx.params.proposalId,
      },
      schemas: {
        params: SimulationSchema.getSimulationByProposalId,
      },
    })

    ctx.body = await new SimulationController().getSimulationResultOfProposal(result.params.proposalId)
  },

  router(): Router {
    const router = new Router()

    router.post('/:network/simulate', SimulationRouter.simulateBundle)
    router.post('/proposal/:proposalId', SimulationRouter.simulateProposal)
    router.get('/proposal/:proposalId', SimulationRouter.getSimulationResultOfProposal)

    return router
  },
}

export default SimulationRouter
