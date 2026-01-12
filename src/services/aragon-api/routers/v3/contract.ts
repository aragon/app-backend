import ContractController from '@api/controllers/contract'
import ContractDetailsSchema from '@api/routers/schema/contract'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'

const ContractRouterV3 = {
  async decodeActionBatch(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        actions: ctx.request.body as any[],
        network: ctx.params.network,
        from: ctx.params.from,
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
     * /:network/:from/decode-batch
     * @description Decode multiple actions in batch (lightweight, parallel).
     * @param {string} network - The network of the contracts.
     * @param {string} from - The sender address (e.g. DAO address).
     * @body {array} - Array of actions [{ to, data, value }].
     * @returns {array} - The decoded actions.
     */
    router.post('/:network/:from/decode-batch', ContractRouterV3.decodeActionBatch)

    return router
  },
}

export default ContractRouterV3
