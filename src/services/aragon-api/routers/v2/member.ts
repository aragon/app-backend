import MemberController from '@api/controllers/member'
import MemberSchema from '@api/routers/schema/member'
import PaginationSchema from '@api/routers/schema/pagination'
import Utils from '@helpers/utils'
import ValidationSchema, { RequireRules } from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'
import {
  type HexAddress,
  type ILockExtraParams,
  type IMemberExtraParams,
  type IPaginationParams,
  type IPairParams,
  type NetworksEnum,
} from '@types'

const MemberRouter = {
  getMembersWithPagination: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'votingPower',
      extraParams: {
        network: ctx.query.network as NetworksEnum,
        daoAddress: ctx.query.daoAddress as HexAddress,
        pluginAddress: ctx.query.pluginAddress as HexAddress,
        tokenAddress: ctx.query.tokenAddress as HexAddress,
        lockManagerAddress: ctx.query.lockManagerAddress as HexAddress,
      },
      pairParams: {
        daoId: ctx.query.daoId as string,
      },
      requireRule: RequireRules.daoIdOrNetworkWithAddress(['daoAddress']),
      schemas: {
        extra: MemberSchema.getExtraParams,
        pair: PaginationSchema.getPairParams,
      },
    })

    ctx.body = await MemberController.getMembersWithPagination(
      result.paginationParams as IPaginationParams,
      result.extraParams as IMemberExtraParams,
      result.pairParams as IPairParams,
    )
  },

  getMemberByAddress: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        address: ctx.params.address,
      },
      extraParams: {
        network: ctx.query.network as NetworksEnum,
        pluginAddress: ctx.query.pluginAddress as HexAddress,
        tokenAddress: ctx.query.tokenAddress as HexAddress,
      },
      pairParams: {
        daoId: ctx.query.daoId as string,
      },
      requireRule: RequireRules.daoIdOrNetworkWithAddress(['pluginAddress', 'tokenAddress']),
      schemas: {
        params: MemberSchema.getMemberByAddress,
        extra: MemberSchema.getExtraParamsV2,
        pair: PaginationSchema.getPairParams,
      },
    })

    ctx.body = await MemberController.getMemberByAddress(
      result.params.address as HexAddress,
      result.extraParams as IMemberExtraParams,
      result.pairParams as IPairParams,
    )
  },

  isMemberOfPlugin: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        memberAddress: ctx.params.memberAddress,
        pluginAddress: ctx.params.pluginAddress,
        network: ctx.query.network as NetworksEnum,
      },
      schemas: {
        params: MemberSchema.isMemberOfPluginV2,
      },
    })

    ctx.body = {
      status: await MemberController.isMemberOfPlugin(
        result.params.memberAddress,
        result.params.pluginAddress,
        result.params.network,
      ),
    }
  },

  getDelegatorsForMember: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'blockNumber',
      params: {
        address: ctx.params.address,
      },
      extraParams: {
        network: ctx.query.network as NetworksEnum,
        pluginAddress: ctx.query.pluginAddress as HexAddress,
      },
      pairParams: {
        daoId: ctx.query.daoId as string,
      },
      requireRule: RequireRules.daoIdOrNetworkWithAddress(['pluginAddress']),
      schemas: {
        params: MemberSchema.getDelegatorsParams,
        extra: MemberSchema.getDelegatorsExtraParams,
        pair: PaginationSchema.getPairParams,
      },
    })

    ctx.body = await MemberController.getDelegatorsForMember(
      result.params.address as HexAddress,
      result.paginationParams as IPaginationParams,
      result.extraParams as IMemberExtraParams,
      result.pairParams as IPairParams,
    )
  },

  getMemberLocks: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'blockNumber',
      extraParams: {
        memberAddress: ctx.params.address,
        escrowAddress: ctx.query.escrowAddress as HexAddress,
        network: ctx.query.network as NetworksEnum,
        onlyActive: Utils.parseBoolean(ctx.query.onlyActive),
      },
      schemas: {
        extra: MemberSchema.getMemberLocksParamsV2,
      },
    })

    ctx.body = await MemberController.getMemberLocks(
      result.extraParams as ILockExtraParams,
      result.paginationParams as IPaginationParams,
    )
  },

  router(): Router {
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
     * @api {get} /members/:address/delegators Get Delegators for Member
     * @apiName Members
     * @apiGroup Members
     * @apiDescription Get list of delegators who have delegated to an address for a token
     *
     * @apiSampleRequest /members/:address/delegators
     */
    router.get('/:address/delegators', MemberRouter.getDelegatorsForMember)

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
