import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import DelegateController from '@api/controllers/delegate'
import {
  type HexAddress,
  type IDelegateExtraParams,
  type IPairParams,
  type ITransferSide,
  type ITransferType,
  type NetworksEnum,
} from '@types'
import PaginationSchema from '@api/routers/schema/pagination'
import DelegateSchema from '@api/routers/schema/delegate'
import Utils from '@helpers/utils'

const DelegateRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'blockNumber' })
    const extraParams: IDelegateExtraParams = {
      memberAddress: ctx.query.address as HexAddress,
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      tokenAddress: ctx.query.tokenAddress as HexAddress,
      type: ctx.query.type as ITransferType,
      side: ctx.query.side as ITransferSide,
      excludeZeroAddress: Utils.parseBoolean(ctx.query.excludeZeroAddress),
    }
    const pairParams: IPairParams = {
      daoId: ctx.query.daoId as string,
    }
    const anyInvalidParams = Utils.extractAdditionalParams(
      { ...paginationParams, ...extraParams, ...pairParams },
      ctx.query,
      ['address'],
    )

    const [formattedPaginationParams, formattedExtraParams, formattedPairParams] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(DelegateSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(PaginationSchema.getPairParams, pairParams),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await DelegateController.getDelegateWithPagination(
      formattedPaginationParams,
      formattedExtraParams,
      formattedPairParams,
    )
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
