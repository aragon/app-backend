import Router, { type RouterContext } from '@koa/router'
import DaoController from '@api/controllers/dao'
import ValidationSchema from '@helpers/validationSchema'
import DaoSchema from '@api/routers/schema/dao'
import { type HexAddress, type IDaoExtraParams, type IPaginationParams, type NetworksEnum } from '@types'

/**
 * V3 DAO Router - Returns DAOs without plugins
 * Plugins should be fetched separately via /plugins endpoint
 * Includes parentDao/subDaos support
 */
const DaoRouterV3 = {
  getWithPagination: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'metrics.tvlUSD',
      extraParams: {
        networks: ctx.query.networks as [NetworksEnum],
        address: ctx.query.address as HexAddress,
      },
      schemas: {
        extra: DaoSchema.getExtraParams,
      },
    })

    ctx.body = await DaoController.getDaosWithPaginationWithoutPlugins(
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

    ctx.body = await DaoController.getDaosByMemberWithoutPlugins(
      result.paginationParams as IPaginationParams,
      result.extraParams as IDaoExtraParams,
    )
  },

  getDaoById: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        id: ctx.params.id,
        onlyParent: ctx.query.onlyParent === 'true',
      },
      schemas: {
        params: DaoSchema.getDaoById,
      },
    })

    ctx.body = await DaoController.getDaoByIdWithoutPlugins(result.params.id, result.params.onlyParent)
  },

  getDaoByAddress: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        network: ctx.params.network,
        address: ctx.params.address,
        onlyParent: ctx.query.onlyParent === 'true',
      },
      schemas: {
        params: DaoSchema.getDaoByAddress,
      },
    })

    ctx.body = await DaoController.getDaoByAddressWithoutPlugins(
      result.params.address,
      result.params.network,
      result.params.onlyParent,
    )
  },

  getDaoByEns: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        network: ctx.params.network,
        ens: ctx.params.ens,
        onlyParent: ctx.query.onlyParent === 'true',
      },
      schemas: {
        params: DaoSchema.getDaoByEns,
      },
    })

    ctx.body = await DaoController.getDaoByEnsWithoutPlugins(
      result.params.ens,
      result.params.network,
      result.params.onlyParent,
    )
  },

  router(): Router {
    const router = new Router()

    /**
     * @api {get} / Get Daos (V3 - without plugins)
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get Daos without plugins. Use /plugins endpoint for plugin data.
     *
     * @apiSampleRequest /daos
     *
     */
    router.get('/', DaoRouterV3.getWithPagination)

    /**
     * @api {get} /:id Get Dao by id (V3 - without plugins)
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get Dao by id without plugins
     *
     * @apiSampleRequest /daos/:id
     */
    router.get('/:id', DaoRouterV3.getDaoById)

    /**
     * @api {get} /member/:address Get Dao By Member Address (V3 - without plugins)
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get Dao By Member Address without plugins
     *
     * @apiSampleRequest /daos/member/:address
     */

    router.get('/member/:address', DaoRouterV3.getDaoByMemberAddress)

    /**
     * @api {get} /:network/:address Get Dao by address (V3 - without plugins)
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get Dao by address without plugins
     *
     * @apiSampleRequest /daos/:network/:address
     */
    router.get('/:network/:address', DaoRouterV3.getDaoByAddress)

    /**
     * @api {get} /:network/ens/:ens Get Dao by ENS (V3 - without plugins)
     * @apiName Daos
     * @apiGroup Daos
     * @apiDescription Get Dao by ENS without plugins
     *
     * @apiSampleRequest /daos/:network/ens/:ens
     */
    router.get('/:network/ens/:ens', DaoRouterV3.getDaoByEns)

    return router
  },
}

export default DaoRouterV3
