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
