import Router, { type RouterContext } from '@koa/router'
import ValidationSchema, { RequireRules } from '@helpers/validationSchema'
import DelegateController from '@api/controllers/delegate'
import {
  type HexAddress,
  type IDelegateExtraParams,
  type IPaginationParams,
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
    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'blockNumber',
      extraParams: {
        memberAddress: ctx.query.address as HexAddress,
        network: ctx.query.network as NetworksEnum,
        daoAddress: ctx.query.daoAddress as HexAddress,
        pluginAddress: ctx.query.pluginAddress as HexAddress,
        tokenAddress: ctx.query.tokenAddress as HexAddress,
        type: ctx.query.type as ITransferType,
        side: ctx.query.side as ITransferSide,
        excludeZeroAddress: Utils.parseBoolean(ctx.query.excludeZeroAddress),
      },
      pairParams: {
        daoId: ctx.query.daoId as string,
      },
      skipParams: ['address'],
      requireRule: RequireRules.daoIdOrNetworkWithAddress(['memberAddress', 'pluginAddress', 'tokenAddress']),
      schemas: {
        extra: DelegateSchema.getExtraParamsV2,
        pair: PaginationSchema.getPairParams,
      },
    })

    ctx.body = await DelegateController.getDelegateWithPagination(
      result.paginationParams as IPaginationParams,
      result.extraParams as IDelegateExtraParams,
      result.pairParams as IPairParams,
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
