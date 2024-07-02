import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import MemberSchema from '@api/routers/schema/member'
import MemberController from '@api/controllers/member'
import { type HexAddress, type IMemberExtraParams, type NetworksEnum } from '@types'
import PaginationSchema from '@api/routers/schema/pagination'

const MemberRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'fromBlockNumber' })
    const extraParams: IMemberExtraParams = {
      onlyActive: ctx.query.onlyActive ? Boolean(ctx.query.onlyActive) : undefined,
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      tokenAddress: ctx.query.tokenAddress as HexAddress,
    }
    const daoId = ctx.query.daoId as string

    const [formattedPaginationParams, formattedExtraParams, formattedDaoId] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(MemberSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(MemberSchema.getDaoById, { id: daoId }),
    ])

    ctx.body = await MemberController.getMembersWithPagination(
      formattedPaginationParams,
      formattedExtraParams,
      formattedDaoId.id,
    )
  },

  getMemberById: async function (ctx: RouterContext) {
    const params = {
      id: ctx.params.id || ctx.params.address,
    }

    const formattedValues = await ValidationSchema.validateParams(MemberSchema.getMemberById, params)

    ctx.body = await MemberController.getMemberById(formattedValues.id)
  },

  getActiveMembersByPluginAddress: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'fromBlockNumber' })
    const extraParams: IMemberExtraParams = {
      network: ctx.params.network as NetworksEnum,
      pluginAddress: ctx.params.pluginAddress,
    }

    const [formattedPaginationParams, formattedExtraParams] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(MemberSchema.getActiveMembersByPluginAddress, extraParams),
    ])

    ctx.body = await MemberController.getActiveMembersByPluginAddress(formattedPaginationParams, formattedExtraParams)
  },

  router() {
    const router = new Router()

    /**
     * @api {get} / Get Members
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Members
     *
     * @apiSampleRequest /
     *
     */
    router.get('/', MemberRouter.getWithPagination)

    /**
     * @api {get} /:id Get Member by id
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Member by id
     *
     * @apiSampleRequest /:id
     */
    router.get('/:id', MemberRouter.getMemberById)

    /**
     * @api {get} /:address Get Member by address
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Member by address
     *
     * @apiSampleRequest /:address
     */
    router.get('/:address', MemberRouter.getMemberById)

    /**
     * @api {get} /active/:network:pluginAddress Get Active Member by plugin address
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Active Member by address
     *
     * @apiSampleRequest /active/:network/:pluginAddress
     */
    router.get('/active/:network/:pluginAddress', MemberRouter.getActiveMembersByPluginAddress)

    return router
  },
}

export default MemberRouter
