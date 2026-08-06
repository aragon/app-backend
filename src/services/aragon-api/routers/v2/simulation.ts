import CrossChainGasController from '@api/controllers/crossChainGas'
import DispatchSimulationController from '@api/controllers/dispatchSimulation'
import SimulationController from '@api/controllers/simulation'
import CrossChainGasSchema from '@api/routers/schema/crossChainGas'
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

  async simulateDirectExecute(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        daoAddress: ctx.params.daoAddress,
        network: ctx.params.network,
        from: (ctx.request as any).body.from,
        actions: (ctx.request as any).body.actions,
      },
      schemas: {
        params: SimulationSchema.simulateDirectExecute,
      },
    })

    ctx.body = await SimulationController.simulateDirectExecute(
      result.params.daoAddress,
      result.params.from,
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

  /**
   * POST /:network/cross-chain/:controllerAddress/gas-limit
   *
   * Measure the `_gasLimit` a cross-chain `forwardMessage` proposal needs, by simulating the
   * delivery on the destination chain and reading how much gas it consumed.
   *
   * `network` and `controllerAddress` identify the DAO's own chain - the origin - and the
   * `CrossChainController` deployed there.
   *
   * Request body:
   * - destinationChainId: number (required) - standard EVM chain id, not a CCIP selector
   * - actions: Array<{ to, value, data }> (required) - the calls to run on the destination chain
   *
   * Response:
   * - status: 'success' | 'reverted'
   * - requiredGas?: string - the measurement, with no safety margin and not checked against the
   *   lane's per-message gas cap; applying a margin and deciding whether it fits are the client's
   * - revertReason?: string
   * - revertedActionIndex?: number
   * - simulationUrl?: string
   * - runAt: number
   */
  async estimateCrossChainGasLimit(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        controllerAddress: ctx.params.controllerAddress,
        network: ctx.params.network,
        destinationChainId: (ctx.request as any).body?.destinationChainId,
        actions: (ctx.request as any).body?.actions,
      },
      schemas: {
        params: CrossChainGasSchema.estimateGasLimit,
      },
    })

    ctx.body = await CrossChainGasController.estimateGasLimit(
      result.params.network,
      result.params.controllerAddress,
      result.params.destinationChainId,
      result.params.actions,
    )
  },

  router(): Router {
    const router = new Router()

    router.post('/:network/plugin/:pluginAddress/simulate', SimulationRouter.simulate)
    router.post('/:network/dao/:daoAddress/simulate', SimulationRouter.simulateDirectExecute)
    router.post('/proposal/:proposalId', SimulationRouter.simulateProposal)
    router.get('/proposal/:proposalId', SimulationRouter.getSimulationResultOfProposal)
    router.post('/:network/dispatch/:policyAddress', SimulationRouter.simulateDispatch)
    router.post('/:network/cross-chain/:controllerAddress/gas-limit', SimulationRouter.estimateCrossChainGasLimit)

    return router
  },
}

export default SimulationRouter
