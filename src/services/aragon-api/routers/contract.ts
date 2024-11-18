import Router, { type RouterContext } from '@koa/router'
import ContractController from '@api/controllers/contract'
import ValidationSchema from '@helpers/validationSchema'
import ContractDetailsSchema from '@api/routers/schema/contract'

const ContractRouter = {
  async getDetails(ctx: RouterContext) {
    const params = {
      network: ctx.params.network,
      address: ctx.params.address,
    }
    const formattedValues = await ValidationSchema.validateParams(ContractDetailsSchema.getContractDetails, params)
    ctx.body = await ContractController.getContractDetails(formattedValues)
  },

  router() {
    const router = new Router()

    /**
     * @api {get} / Get status
     * @apiName status
     * @apiGroup Status
     * @apiDescription Get status
     *
     * @apiSampleRequest /
     *
     */
    router.get('/:network/:address', ContractRouter.getDetails)

    return router
  },
}

export default ContractRouter
