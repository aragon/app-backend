import Router, { type RouterContext } from '@koa/router'
import TokenController from '@services/aragon-api/controllers/token'
import ValidationSchema from '@helpers/validationSchema'
import TokenSchema from '@services/aragon-api/routers/schema/token'
import ModelUtils from '@models/utils/models'
import { type ITokenExtraParams, type ITokenType, type NetworksEnum } from '@types'
import PaginationSchema from '@api/routers/schema/pagination'

const TokenRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'name' })
    const extraParams: ITokenExtraParams = {
      network: ctx.query.network as NetworksEnum,
      type: ctx.query.type as ITokenType,
    }

    const [formattedPaginationParams, formattedExtraParams] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(TokenSchema.getExtraParams, extraParams),
    ])

    ctx.body = await TokenController.getTokensWithPagination(formattedPaginationParams, formattedExtraParams)
  },

  getTokenByAddress: async function (ctx: RouterContext) {
    const params = {
      network: ctx.params.network,
      address: ctx.params.address,
    }

    const formattedParams = await ValidationSchema.validateParams(TokenSchema.getTokenByAddress, params)

    ctx.body = await TokenController.getTokenByAddress(formattedParams)
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
