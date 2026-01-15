import ContractController from '@api/controllers/contract'
import ContractDetailsSchema from '@api/routers/schema/contract'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'

const ContractRouter = {
  async getDetails(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        network: ctx.params.network,
        address: ctx.params.address,
      },
      schemas: {
        params: ContractDetailsSchema.getContractDetailsV2,
      },
    })

    ctx.body = await ContractController.getContractDetails(result.params)
  },

  async decodeActionData(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        network: ctx.params.network,
        to: ctx.params.address,
        from: (ctx.request.body as any).from,
        data: (ctx.request.body as any).data,
        value: (ctx.request.body as any).value,
      },
      schemas: {
        params: ContractDetailsSchema.decodeActionDataV2,
      },
    })

    ctx.body = await ContractController.decodeContractData(result.params)
  },

  async decodeActionBatch(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        actions: ctx.request.body as any[],
        network: ctx.params.network,
        from: ctx.params.from,
      },
      schemas: {
        params: ContractDetailsSchema.decodeActionBatchV2,
      },
    })

    ctx.body = await ContractController.decodeContractDataBatch(result.params)
  },

  router(): Router {
    const router = new Router()

    /**
     * /:network/:address/decode
     * @description Decode the action data of a contract.
     * @param {string} network - The network of the contract.
     * @param {string} address - The address of the contract.
     * @returns {object} - The decoded action data.
     */
    router.post('/:network/:address/decode', ContractRouter.decodeActionData)

    /**
     * /:network/:from/decode-batch
     * @description Decode multiple actions in batch (lightweight, parallel).
     * @param {string} network - The network of the contracts.
     * @param {string} from - The sender address (e.g. DAO address).
     * @body {array} - Array of actions [{ to, data, value }].
     * @returns {array} - The decoded actions.
     */
    router.post('/:network/:from/decode-batch', ContractRouter.decodeActionBatch)

    /**
     * /:network/:address
     * @description Get the details of a contract.
     * @param {string} network - The network of the contract.
     * @param {string} address - The address of the contract.
     * @returns {object} - The details of the contract.
     */
    router.get('/:network/:address', ContractRouter.getDetails)

    return router
  },
}

export default ContractRouter
