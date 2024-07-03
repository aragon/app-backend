import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import MemberSchema from '@api/routers/schema/member'
import MemberController from '@api/controllers/member'
import { type HexAddress, type IActiveMemberExtraParams, type IMemberExtraParams, type NetworksEnum } from '@types'
import PaginationSchema from '@api/routers/schema/pagination'

const MemberRouter = {
  getActiveMembersWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'fromBlockNumber' })
    const extraParams: IActiveMemberExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      tokenAddress: ctx.query.tokenAddress as HexAddress,
    }
    const daoId = ctx.query.daoId as string

    const [formattedPaginationParams, formattedExtraParams, formattedDaoId] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(MemberSchema.getActiveMembersWithPagination, extraParams),
      ValidationSchema.validateParams(MemberSchema.getDaoById, { id: daoId }),
    ])

    ctx.body = await MemberController.getActiveMembersWithPagination(
      formattedPaginationParams,
      formattedExtraParams,
      formattedDaoId.id,
    )
  },

  getActiveMemberByAddress: async function (ctx: RouterContext) {
    const params = {
      address: ctx.params.address,
    }

    const extraParams: IActiveMemberExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
    }

    const [formattedParams, formattedExtraParams] = await Promise.all([
      ValidationSchema.validateParams(MemberSchema.getMemberByAddress, params),
      ValidationSchema.validateParams(MemberSchema.getActiveMembersWithPagination, extraParams),
    ])

    ctx.body = await MemberController.getActiveMemberByAddress(formattedParams.address, formattedExtraParams)
  },

  getHistoryMembersWithPagination: async function (ctx: RouterContext) {
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

  getHistoryMemberByAddress: async function (ctx: RouterContext) {
    const params = {
      address: ctx.params.address,
    }

    const formattedValues = await ValidationSchema.validateParams(MemberSchema.getMemberByAddress, params)

    ctx.body = await MemberController.getMemberById(formattedValues.address)
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
    router.get('/', MemberRouter.getActiveMembersWithPagination)

    /**
     * @api {get} /history/ Get History Members
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get History Members
     *
     * @apiSampleRequest /history
     */
    router.get('/history', MemberRouter.getHistoryMembersWithPagination)

    /**
     * @api {get} /:address Get Member by address
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Member by address
     *
     * @apiSampleRequest /:address
     */
    router.get('/:address', MemberRouter.getActiveMemberByAddress)

    /**
     * @api {get} /:address Get History Member by address
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get History Member by address
     *
     * @apiSampleRequest /member/:address/history
     */
    router.get('/history/:address', MemberRouter.getHistoryMemberByAddress)

    return router
  },
}

export default MemberRouter
