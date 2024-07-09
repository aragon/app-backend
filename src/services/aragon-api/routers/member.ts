import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import MemberSchema from '@api/routers/schema/member'
import MemberController from '@api/controllers/member'
import {
  type HexAddress,
  type IActiveMemberExtraParams,
  type IMemberExtraParams,
  type IPairParams,
  type NetworksEnum,
} from '@types'
import PaginationSchema from '@api/routers/schema/pagination'

const MemberRouter = {
  getMembersWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'fromBlockNumber' })
    const extraParams: IMemberExtraParams = {
      onlyActive: ctx.query.onlyActive ? Boolean(ctx.query.onlyActive) : undefined,
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      tokenAddress: ctx.query.tokenAddress as HexAddress,
    }
    const pairParams: IPairParams = {
      daoId: ctx.query.daoId as string,
    }

    const [formattedPaginationParams, formattedExtraParams, formattedPairParams] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(MemberSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(PaginationSchema.getPairParams, pairParams),
    ])

    ctx.body = await MemberController.getMembersWithPagination(
      formattedPaginationParams,
      formattedExtraParams,
      formattedPairParams,
    )
  },

  getMemberByAddress: async function (ctx: RouterContext) {
    const params = {
      address: ctx.params.address,
    }
    const extraParams: IMemberExtraParams = {
      onlyActive: ctx.query.onlyActive ? Boolean(ctx.query.onlyActive) : undefined,
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      tokenAddress: ctx.query.tokenAddress as HexAddress,
    }

    const [formattedParams, formattedExtraParams] = await Promise.all([
      ValidationSchema.validateParams(MemberSchema.getMemberByAddress, params),
      ValidationSchema.validateParams(MemberSchema.getExtraParams, extraParams),
    ])

    ctx.body = await MemberController.getMemberByAddress(formattedParams.address, formattedExtraParams)
  },

  getActiveMembersWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'fromBlockNumber' })
    const extraParams: IActiveMemberExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      tokenAddress: ctx.query.tokenAddress as HexAddress,
    }
    const pairParams: IPairParams = {
      daoId: ctx.query.daoId as string,
    }

    const [formattedPaginationParams, formattedExtraParams, formattedPairParams] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(MemberSchema.getActiveMembersExtraParams, extraParams),
      ValidationSchema.validateParams(PaginationSchema.getPairParams, pairParams),
    ])

    ctx.body = await MemberController.getActiveMembersWithPagination(
      formattedPaginationParams,
      formattedExtraParams,
      formattedPairParams,
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
      ValidationSchema.validateParams(MemberSchema.getActiveMembersExtraParams, extraParams),
    ])

    ctx.body = await MemberController.getActiveMemberByAddress(formattedParams.address, formattedExtraParams)
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
    router.get('/active', MemberRouter.getActiveMembersWithPagination)

    /**
     * @api {get} /active/:address Get Member by address
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Member by address
     *
     * @apiSampleRequest /active/:address
     */
    router.get('/active/:address', MemberRouter.getActiveMemberByAddress)

    /**
     * @api {get} / Get Members
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Members
     *
     * @apiSampleRequest /
     */
    router.get('/', MemberRouter.getMembersWithPagination)

    /**
     * @api {get} /:address Get Member by address
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Member by address
     *
     * @apiSampleRequest /member/:address
     */
    router.get('/:address', MemberRouter.getMemberByAddress)

    return router
  },
}

export default MemberRouter
