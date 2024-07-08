import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import DelegateController from '@api/controllers/delegate'
import { type HexAddress, type IDelegateExtraParams, type NetworksEnum } from '@types'
import PaginationSchema from '@api/routers/schema/pagination'
import DelegateSchema from '@api/routers/schema/delegate'

const DelegateRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultOrder: 'blockNumber' })
    const extraParams: IDelegateExtraParams = {
      memberAddress: ctx.query.memberAddress as HexAddress,
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      tokenAddress: ctx.query.tokenAddress as HexAddress,
    }

    const [formattedPaginationParams, formattedExtraParams] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(DelegateSchema.getExtraParams, extraParams),
    ])

    ctx.body = await DelegateController.getDelegateWithPagination(formattedPaginationParams, formattedExtraParams)
  },

  router() {
    const router = new Router()

    /**
     * @api {get} / Get Delegate
     * @apiName Delegate
     * @apiGroup Delegate
     * @apiDescription Get Delegate
     *
     * @apiSampleRequest /
     *
     */
    router.get('/', DelegateRouter.getWithPagination)

    return router
  },
}

export default DelegateRouter
