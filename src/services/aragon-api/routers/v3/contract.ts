import ContractController from '@api/controllers/contract'
import ContractDetailsSchema from '@api/routers/schema/contract'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'

/**
 * V3 Contract Router - batch decoding without a DAO address in the path.
 *
 * The light decoder never uses the sender address to decode (it resolves proxies, ABIs and
 * selectors from each action's `to`), it only echoes it back on every result. V3 therefore
 * moves it out of the path and into an optional `?from=` query param, so callers with no DAO
 * context (imports, previews, standalone tooling) do not have to invent an address.
 */
const ContractRouterV3 = {
  async decodeActionBatch(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        actions: (ctx.request as any).body as any[],
        network: ctx.params.network,
        from: ctx.query.from as string | undefined,
      },
      schemas: {
        params: ContractDetailsSchema.decodeActionBatchV3,
      },
    })

    ctx.body = await ContractController.decodeContractDataBatch(result.params)
  },

  router(): Router {
    const router = new Router()

    /**
     * /:network/decode-batch
     * @description Decode multiple actions in batch (lightweight, parallel).
     * @param {string} network - The network of the contracts.
     * @query {string} [from] - Optional sender address (e.g. DAO address), echoed back on each
     * result. Omit it when there is no sender context; results then carry an empty `from`.
     * @body {array} - Array of actions [{ to, data, value }].
     * @returns {array} - The decoded actions.
     */
    router.post('/:network/decode-batch', ContractRouterV3.decodeActionBatch)

    return router
  },
}

export default ContractRouterV3
