import GaugeController from '@api/controllers/gauge'
import GaugeSchema from '@api/routers/schema/gauge'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'
import { type IGaugeEpochMetricParams, type IGaugeParams, type IPaginationParams, type NetworksEnum } from '@types'

const GaugeRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'blockNumber',
      params: {
        pluginAddress: ctx.params.pluginAddress,
        network: ctx.params.network as NetworksEnum,
      },
      extraParams: {
        status: ctx.query.status as string,
      },
      schemas: {
        params: GaugeSchema.getGaugeParams,
        extra: GaugeSchema.getGaugeQuery,
      },
    })

    const controllerParams: IGaugeParams = {
      ...(result.params as IGaugeParams),
      ...(result.extraParams as Partial<IGaugeParams>),
    }

    Object.keys(controllerParams).forEach(key => {
      if (controllerParams[key as keyof IGaugeParams] === undefined) {
        delete controllerParams[key as keyof IGaugeParams]
      }
    })

    ctx.body = await GaugeController.getGaugesWithPagination(
      result.paginationParams as IPaginationParams,
      controllerParams,
    )
  },

  getGaugeEpochMetrics: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'blockNumber',
      params: {
        pluginAddress: ctx.params.pluginAddress,
        network: ctx.params.network as NetworksEnum,
        memberAddress: ctx.query.memberAddress as NetworksEnum,
      },
      schemas: {
        params: GaugeSchema.getGaugeEpochMetricsParams,
      },
    })

    ctx.body = await GaugeController.getGaugeEpochMetrics(result.params as IGaugeEpochMetricParams)
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

    /**
     * @api {get} / Get GaugeEpochMetrics
     * @apiName Gauges
     * @apiGroup Gauges
     * @apiDescription Get GaugeEpochMetrics
     *
     * @apiSampleRequest /gauges/epochMetrics/:pluginAddress/:network
     *
     */
    router.get('/epochMetrics/:pluginAddress/:network', GaugeRouter.getGaugeEpochMetrics)

    return router
  },
}

export default GaugeRouter
