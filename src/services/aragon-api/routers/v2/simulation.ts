import CrossChainGasController from '@api/controllers/crossChainGas'
import DispatchSimulationController from '@api/controllers/dispatchSimulation'
import SimulationController from '@api/controllers/simulation'
import CrossChainGasSchema from '@api/routers/schema/crossChainGas'
import DispatchSimulationSchema from '@api/routers/schema/dispatchSimulation'
import SimulationSchema from '@api/routers/schema/simulation'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'
import { type HexAddress, type NetworksEnum } from '@types'
import { getAddress } from 'ethers'

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
    await ValidationSchema.validateParams(SimulationSchema.proposalBody, ctx.request.body ?? {})
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

  async _safeTransactionParams(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        network: ctx.params.network,
        safeAddress: ctx.params.safeAddress,
        safeTxHash: ctx.params.safeTxHash,
      },
      schemas: {
        params: SimulationSchema.safeTransaction,
      },
    })
    return {
      network: result.params.network as NetworksEnum,
      // Rows store the checksummed Safe address.
      safeAddress: getAddress(result.params.safeAddress as string) as HexAddress,
      safeTxHash: result.params.safeTxHash as string,
    }
  },

  /**
   * POST /:network/safe/:safeAddress/transactions/:safeTxHash
   *
   * Simulate one pending Safe transaction of a tracked Safe. The transaction is read from the
   * stored Safe queue by its hash; the request carries no calldata. It runs as `execTransaction`
   * from a current owner with the threshold overridden to 1 and the nonce to the transaction's own,
   * so earlier queued transactions are not applied first.
   *
   * A run within ten minutes of the last one returns that run. Runs count against the Safe's hourly
   * Tenderly budget, 429 when it is used up.
   *
   * Response: { status: 'success' | 'failed', url, runAt, network }
   */
  async simulateSafeTransaction(ctx: RouterContext) {
    await ValidationSchema.validateParams(SimulationSchema.proposalBody, ctx.request.body ?? {})
    const { network, safeAddress, safeTxHash } = await SimulationRouter._safeTransactionParams(ctx)

    ctx.body = await SimulationController.simulateSafeTransaction(network, safeAddress, safeTxHash)
  },

  /**
   * GET /:network/safe/:safeAddress/transactions/:safeTxHash
   *
   * The last stored simulation of a Safe transaction: { status, url, runAt }. 404 when it was never run.
   */
  async getSimulationResultOfSafeTransaction(ctx: RouterContext) {
    const { network, safeAddress, safeTxHash } = await SimulationRouter._safeTransactionParams(ctx)

    ctx.body = await SimulationController.getSimulationResultOfSafeTransaction(network, safeAddress, safeTxHash)
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
   * - staleSince?: number - set when the hourly budget is finished and we returned an older
   *   measurement of the same request. Unix ms of the run the number comes from
   * - runAt: number
   *
   * Every simulation costs money, so there is an hourly budget per DAO and one for all DAOs. When
   * it is finished, and we have no earlier measurement of the same request, the endpoint returns
   * 429. It never calculates a gas limit without a simulation.
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
    router.post('/:network/safe/:safeAddress/transactions/:safeTxHash', SimulationRouter.simulateSafeTransaction)
    router.get(
      '/:network/safe/:safeAddress/transactions/:safeTxHash',
      SimulationRouter.getSimulationResultOfSafeTransaction,
    )

    return router
  },
}

export default SimulationRouter
