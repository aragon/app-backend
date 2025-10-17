import Router, { type RouterContext } from '@koa/router'
import GaugeController from '@api/controllers/gauge'
import { type IGaugeParams, type IPaginationParams, type NetworksEnum } from '@types'
import ValidationSchema from '@helpers/validationSchema'
import GaugeSchema from '@api/routers/schema/gauge'

const GaugeRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'blockNumber',
      params: {
        pluginAddress: ctx.params.pluginAddress,
        network: ctx.params.network as NetworksEnum,
      },
      schemas: {
        params: GaugeSchema.getGaugeParams,
      },
    })

    ctx.body = await GaugeController.getGaugesWithPagination(
      result.paginationParams as IPaginationParams,
      result.params as IGaugeParams,
    )
  },

  router(): Router {
    const router = new Router()

    /**
     * @api {get} / Get Gauges
     * @apiName Gauges
     * @apiGroup Gauges
     * @apiDescription Get Gauges
     *
     * @apiSampleRequest /gauges
     *
     */
    router.get('/:pluginAddress/:network', GaugeRouter.getWithPagination)

    return router
  },
}

export default GaugeRouter
