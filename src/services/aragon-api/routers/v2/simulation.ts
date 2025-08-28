import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import SimulationSchema from '@api/routers/schema/simulation'
import SimulationController from '@api/controllers/simulation'

const SimulationRouter = {
  async simulate(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        actions: (ctx.request.body as any).actions,
        pluginAddress: ctx.params.pluginAddress,
        network: ctx.params.network,
      },
      schemas: {
        params: SimulationSchema.simulate,
      },
    })

    ctx.body = await SimulationController.simulate(
      result.params.pluginAddress,
      result.params.actions,
      result.params.network,
    )
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

    ctx.body = await SimulationController.getSimulationResultOfProposal(result.params.proposalId)
  },

  router(): Router {
    const router = new Router()

    router.post('/:network/plugin/:pluginAddress/simulate', SimulationRouter.simulate)
    router.post('/proposal/:proposalId', SimulationRouter.simulateProposal)
    router.get('/proposal/:proposalId', SimulationRouter.getSimulationResultOfProposal)

    return router
  },
}

export default SimulationRouter
