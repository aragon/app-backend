import Router, { type RouterContext } from '@koa/router'
import TokenController from '@api/controllers/token'
import ValidationSchema from '@helpers/validationSchema'
import TokenSchema from '@api/routers/schema/token'
import ModelUtils from '@models/utils/models'
import { type ITokenExtraParams, type ITokenType, type NetworksEnum } from '@types'
import PaginationSchema from '@api/routers/schema/pagination'
import Utils from '@helpers/utils'

const TokenRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'name' })
    const extraParams: ITokenExtraParams = {
      network: ctx.query.network as NetworksEnum,
      type: ctx.query.type as ITokenType,
      isGovernance: Utils.parseBoolean(ctx.query.isGovernance),
    }
    const anyInvalidParams = Utils.extractAdditionalParams({ ...paginationParams, ...extraParams }, ctx.query)

    const [formattedPaginationParams, formattedExtraParams] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(TokenSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await TokenController.getTokensWithPagination(formattedPaginationParams, formattedExtraParams)
  },

  getTokenByAddress: async function (ctx: RouterContext) {
    const params = {
      network: ctx.params.network,
      address: ctx.params.address,
    }
    const anyInvalidParams = Utils.extractAdditionalParams({}, ctx.query)

    const [formattedValues] = await Promise.all([
      ValidationSchema.validateParams(TokenSchema.getTokenByAddress, params),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await TokenController.getTokenByAddress(formattedValues)
  },

  router() {
    const router = new Router()

    /**
     * @api {get} / Get Tokens
     * @apiName Tokens
     * @apiGroup Tokens
     * @apiDescription Get Tokens
     *
     * @apiSampleRequest /
     *
     */
    router.get('/', TokenRouter.getWithPagination)

    /**
     * @api {get} /:network/:address Get Token by address
     * @apiName Tokens
     * @apiGroup Tokens
     * @apiDescription Get Token by address
     *
     * @apiSampleRequest /:network/:address
     *
     */
    router.get('/:network/:address', TokenRouter.getTokenByAddress)

    return router
  },
}

export default TokenRouter
