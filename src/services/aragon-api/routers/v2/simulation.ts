import DispatchSimulationController from '@api/controllers/dispatchSimulation'
import SimulationController from '@api/controllers/simulation'
import DispatchSimulationSchema from '@api/routers/schema/dispatchSimulation'
import SimulationSchema from '@api/routers/schema/simulation'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'

const SimulationRouter = {
  async simulate(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        actions: (ctx.request as any).body.actions,
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
        params: SimulationSchema.simulationProposal,
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
        params: SimulationSchema.simulationProposal,
      },
    })

    ctx.body = await SimulationController.getSimulationResultOfProposal(result.params.proposalId)
  },

  /**
   * POST /:network/dispatch/:policyAddress
   *
   * Simulate a dispatch operation and return processed summary
   * with address mappings and grouped asset changes.
   *
   * Request body:
   * - from: string (required) - The wallet address initiating the dispatch
   * - data: string (optional) - Encoded calldata, defaults to dispatch() selector
   *
   * Response:
   * - status: 'success' | 'failed'
   * - error?: string
   * - tenderlyUrl?: string
   * - summaryGroups: ISummaryGroup[]
   */
  async simulateDispatch(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        policyAddress: ctx.params.policyAddress,
        network: ctx.params.network,
        from: (ctx.request as any).body?.from,
        data: (ctx.request as any).body?.data,
      },
      schemas: {
        params: DispatchSimulationSchema.simulateDispatch,
      },
    })

    ctx.body = await DispatchSimulationController.simulateDispatchSummary(
      result.params.policyAddress,
      result.params.network,
      result.params.from,
      result.params.data,
    )
  },

  router(): Router {
    const router = new Router()

    router.post('/:network/plugin/:pluginAddress/simulate', SimulationRouter.simulate)
    router.post('/proposal/:proposalId', SimulationRouter.simulateProposal)
    router.get('/proposal/:proposalId', SimulationRouter.getSimulationResultOfProposal)
    router.post('/:network/dispatch/:policyAddress', SimulationRouter.simulateDispatch)

    return router
  },
}

export default SimulationRouter
