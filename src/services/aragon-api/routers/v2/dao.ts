import Router, { type RouterContext } from '@koa/router'
import DaoController from '@api/controllers/dao'
import ValidationSchema from '@helpers/validationSchema'
import DaoSchema from '@api/routers/schema/dao'
import { type HexAddress, type IDaoExtraParams, type IPaginationParams, type NetworksEnum } from '@types'

const DaoRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    // 处理 daoIds 参数，确保它是数组格式
    let daoIds: string[] | undefined
    if (ctx.query.daoIds) {
      if (Array.isArray(ctx.query.daoIds)) {
        daoIds = ctx.query.daoIds
      } else if (typeof ctx.query.daoIds === 'string') {
        // 如果是逗号分隔的字符串，拆分为数组
        daoIds = ctx.query.daoIds.split(',').map(id => id.trim())
      }
    }

    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'metrics.tvlUSD',
      extraParams: {
        networks: ctx.query.networks as [NetworksEnum],
        address: ctx.query.address as HexAddress,
        pluginAddress: ctx.query.pluginAddress as HexAddress,
        daoIds,
        daoAddresses: ctx.query.daoAddresses as HexAddress[],
      },
      schemas: {
        extra: DaoSchema.getExtraParamsV2,
      },
    })

    ctx.body = await DaoController.getDaosWithPagination(
      result.paginationParams as IPaginationParams,
      result.extraParams as IDaoExtraParams,
    )
  },

  getDaoByMemberAddress: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'metrics.tvlUSD',
      extraParams: {
        memberAddress: ctx.params.address,
        networks: ctx.query.networks as [NetworksEnum],
        excludeDaoId: ctx.query.excludeDaoId,
      },
      schemas: {
        extra: DaoSchema.getDaosByMember,
      },
    })

    ctx.body = await DaoController.getDaosByMember(
      result.paginationParams as IPaginationParams,
      result.extraParams as IDaoExtraParams,
    )
  },

  getDaoById: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        id: ctx.params.id,
      },
      schemas: {
        params: DaoSchema.getDaoById,
      },
    })

    ctx.body = await DaoController.getDaoById(result.params.id)
  },

  getDaoByAddress: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        network: ctx.params.network,
        address: ctx.params.address,
      },
      schemas: {
        params: DaoSchema.getDaoByAddress,
      },
    })

    ctx.body = await DaoController.getDaoByAddress(result.params.address, result.params.network)
  },

  getDaoByEns: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        network: ctx.params.network,
        ens: ctx.params.ens,
      },
      schemas: {
        params: DaoSchema.getDaoByEns,
      },
    })

    ctx.body = await DaoController.getDaoByEns(result.params.ens, result.params.network)
  },

  router(): Router {
    const router = new Router()

    /**
     * @api {get} / Get Daos
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get Daos
     *
     * @apiSampleRequest /daos
     *
     */
    router.get('/', DaoRouter.getWithPagination)

    /**
     * @api {get} /:id Get Dao by id
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get Dao by id
     *
     * @apiSampleRequest /daos/:id
     */
    router.get('/:id', DaoRouter.getDaoById)

    /**
     * @api {get} /member/:address Get Dao By Member Address
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get Dao By Member Address
     *
     * @apiSampleRequest /daos/member/:address
     */

    router.get('/member/:address', DaoRouter.getDaoByMemberAddress)

    /**
     * @api {get} /:network/:address Get Dao by address
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get Dao by address
     *
     * @apiSampleRequest /daos/:network/:address
     */
    router.get('/:network/:address', DaoRouter.getDaoByAddress)

    /**
     * @api {get} /:network/ens/:ens Get Dao by ENS
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get Dao by ENS
     *
     * @apiSampleRequest /daos/:network/ens/:ens
     */
    router.get('/:network/ens/:ens', DaoRouter.getDaoByEns)

    return router
  },
}

export default DaoRouter
