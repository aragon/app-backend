import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import MemberSchema from '@api/routers/schema/member'
import MemberController from '@api/controllers/member'
import {
  type HexAddress,
  type ILockExtraParams,
  type IMemberExtraParams,
  type IPairParams,
  type NetworksEnum,
} from '@types'
import PaginationSchema from '@api/routers/schema/pagination'
import Utils from '@helpers/utils'

const MemberRouter = {
  getMembersWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'votingPower' })
    const extraParams: IMemberExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      tokenAddress: ctx.query.tokenAddress as HexAddress,
    }
    const pairParams: IPairParams = {
      daoId: ctx.query.daoId as string,
    }
    const anyInvalidParams = Utils.extractAdditionalParams(
      { ...paginationParams, ...extraParams, ...pairParams },
      ctx.query,
    )

    const [formattedPaginationParams, formattedExtraParams, formattedPairParams] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(MemberSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(PaginationSchema.getPairParams, pairParams),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
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
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      tokenAddress: ctx.query.tokenAddress as HexAddress,
    }
    const pairParams: IPairParams = {
      daoId: ctx.query.daoId as string,
    }
    const anyInvalidParams = Utils.extractAdditionalParams({ ...params, ...extraParams, ...pairParams }, ctx.query)

    const [formattedParams, formattedExtraParams, formattedPairParams] = await Promise.all([
      ValidationSchema.validateParams(MemberSchema.getMemberByAddress, params),
      ValidationSchema.validateParams(MemberSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(PaginationSchema.getPairParams, pairParams),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await MemberController.getMemberByAddress(
      formattedParams.address,
      formattedExtraParams,
      formattedPairParams,
    )
  },

  isMemberOfPlugin: async function (ctx: RouterContext) {
    const params = {
      memberAddress: ctx.params.memberAddress,
      pluginAddress: ctx.params.pluginAddress,
      network: ctx.query.network as NetworksEnum,
    }
    const anyInvalidParams = Utils.extractAdditionalParams({ ...params }, ctx.query)

    const [formattedParams] = await Promise.all([
      ValidationSchema.validateParams(MemberSchema.isMemberOfPlugin, params),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await MemberController.isMemberOfPlugin(
      formattedParams.memberAddress,
      formattedParams.pluginAddress,
      formattedParams.network,
    )
  },

  getMemberLocks: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'blockNumber' })

    const extraParams: ILockExtraParams = {
      memberAddress: ctx.params.address,
      escrowAddress: ctx.query.escrowAddress as HexAddress,
      network: ctx.query.network as NetworksEnum,
      onlyActive: Utils.parseBoolean(ctx.query.onlyActive),
    }
    const anyInvalidParams = Utils.extractAdditionalParams({ ...paginationParams, ...extraParams }, ctx.query)

    const [formattedExtraParams, formattedPaginationParams] = await Promise.all([
      ValidationSchema.validateParams(MemberSchema.getMemberLocksParams, extraParams),
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await MemberController.getMemberLocks(formattedExtraParams, formattedPaginationParams)
  },

  router() {
    const router = new Router()

    /**
     * @api {get} / Get Members
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Members
     *
     * @apiSampleRequest /members
     */
    router.get('/', MemberRouter.getMembersWithPagination)

    /**
     * @api {get} /:address Get Member by address
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Member by address
     *
     * @apiSampleRequest /members/:address
     */
    router.get('/:address', MemberRouter.getMemberByAddress)

    /**
     * @api {get} /members/:address/locks Get Locks Member by address
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get Locks Member by address
     *
     * @apiSampleRequest /members/:address/locks
     */
    router.get('/:address/locks', MemberRouter.getMemberLocks)

    /**
     * @api {get} /:memberAddress/:pluginAddress/exists isMemberOfPlugin
     * @apiName Members
     * @apiGroup Members
     * @apiDescription isMemberOfPlugin
     *
     * @apiSampleRequest /members/:memberAddress/:pluginAddress/exists
     */
    router.get('/:memberAddress/:pluginAddress/exists', MemberRouter.isMemberOfPlugin)

    return router
  },
}

export default MemberRouter
