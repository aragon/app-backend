import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import DelegateController from '@api/controllers/delegate'
import { type HexAddress, type IDelegateExtraParams, type NetworksEnum } from '@types'
import PaginationSchema from '@api/routers/schema/pagination'
import DelegateSchema from '@api/routers/schema/delegate'
import MemberSchema from '@api/routers/schema/member'

const DelegateRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'blockNumber' })
    const extraParams: IDelegateExtraParams = {
      memberAddress: ctx.query.address as HexAddress,
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      tokenAddress: ctx.query.tokenAddress as HexAddress,
    }
    const daoId = ctx.query.daoId as string

    const [formattedPaginationParams, formattedExtraParams, formattedDaoId] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(DelegateSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(MemberSchema.getDaoById, { id: daoId }),
    ])

    ctx.body = await DelegateController.getDelegateWithPagination(
      formattedPaginationParams,
      formattedExtraParams,
      formattedDaoId.id,
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
