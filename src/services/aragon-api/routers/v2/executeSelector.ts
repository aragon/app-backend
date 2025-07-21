import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ExecuteSelectorController from '@api/controllers/executeSelector'
import { type HexAddress, type IExecuteSelectorExtraParams, type IPaginationParams, type NetworksEnum } from '@types'
import ExecuteSelectorSchema from '@api/routers/schema/executeSelector'
import PaginationSchema from '@api/routers/schema/pagination'

const ExecuteSelectorRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'blockNumber',
      extraParams: {
        network: ctx.params.network as NetworksEnum,
        pluginAddress: ctx.params.pluginAddress,
        daoAddress: ctx.query.daoAddress as HexAddress,
        conditionAddress: ctx.query.conditionAddress as HexAddress,
      },
      schemas: {
        extra: ExecuteSelectorSchema.getExtraParams,
        pair: PaginationSchema.getPairParams,
      },
    })

    ctx.body = await ExecuteSelectorController.getExecuteSelectorsWithPagination(
      result.paginationParams as IPaginationParams,
      result.extraParams as IExecuteSelectorExtraParams,
    )
  },

  router() {
    const router = new Router()

    /**
     * @api {get} / Get Execute Selectors
     * @apiName ExecuteSelectors
     * @apiGroup ExecuteSelectors
     * @apiDescription Get Execute Selectors with pagination
     *
     * @apiSampleRequest /
     *
     */
    router.get('/:network/:pluginAddress', ExecuteSelectorRouter.getWithPagination)

    return router
  },
}

export default ExecuteSelectorRouter
