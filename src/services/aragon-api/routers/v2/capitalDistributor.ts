import Router, { type RouterContext } from '@koa/router'
import CapitalDistributorController from '@api/controllers/capitalDistributor'
import ValidationSchema from '@helpers/validationSchema'
import CapitalDistributorSchema from '@api/routers/schema/capitalDistributor'
import { type HexAddress, type NetworksEnum, type IPaginationParams, type ICampaignApiParams } from '@types'

const CapitalDistributorRouter = {
  getCampaignsWithPagination: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'startTime',
      params: {
        pluginAddress: ctx.query.pluginAddress as HexAddress,
        network: ctx.query.network as NetworksEnum,
        userAddress: ctx.query.userAddress as HexAddress,
        status: ctx.query.status as 'claimed' | 'claimable',
      },
      schemas: {
        params: CapitalDistributorSchema.getCampaignsExtraParams,
      },
    })

    ctx.body = await CapitalDistributorController.getCampaignsWithPagination(
      result.paginationParams as IPaginationParams,
      result.params as ICampaignApiParams,
    )
  },

  getUserCampaignStatus: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        pluginAddress: ctx.query.pluginAddress as HexAddress,
        network: ctx.query.network as NetworksEnum,
        userAddress: ctx.query.userAddress as HexAddress,
      },
      schemas: {
        params: CapitalDistributorSchema.getUserCampaignStatusParams,
      },
    })

    ctx.body = await CapitalDistributorController.getUserCampaignStatus(
      result.params.pluginAddress,
      result.params.network,
      result.params.userAddress,
    )
  },

  router() {
    const router = new Router()

    /**
     * @api {get} /campaigns Get Campaigns with Pagination
     * @apiName Campaigns
     * @apiGroup CapitalDistributor
     * @apiDescription Get campaigns for a plugin with user-specific data and pagination
     *
     * @apiParam {String} Plugin address
     * @apiParam {String} Network name
     * @apiParam {String} [userAddress] User address to get user-specific data
     * @apiParam {String} [status] Filter by status: 'claimed' or 'claimable'
     * @apiParam {Number} [page=1] Page number
     * @apiParam {Number} [pageSize=10] Number of items per page
     * @apiParam {String} [sort=startTime] Sort field
     * @apiParam {String} [order=desc] Sort order (asc/desc)
     * @apiParam {String} [search] Search term
     *
     * @apiSampleRequest /capital-distributor/campaigns?plugin=0x123&network=ethereum&userAddress=0x456&page=1&pageSize=10
     */
    router.get('/campaigns', CapitalDistributorRouter.getCampaignsWithPagination)

    /**
     * @api {get} /campaigns/stats Get Campaign Statistics
     * @apiName CampaignStats
     * @apiGroup CapitalDistributor
     * @apiDescription Get statistics for a specific campaign (totalClaimed and totalClaimable)
     *
     * @apiParam {String} pluginAddress Plugin address
     * @apiParam {String} network Network name
     * @apiParam {String} userAddress User address
     *
     * @apiSuccess {String} totalClaimed Total amount claimed by user across all campaigns
     * @apiSuccess {String} totalClaimable Total amount that can still be claimed by user across all campaigns
     *
     * @apiSampleRequest /capital-distributor/campaigns/stats?pluginAddress=0x123&network=ethereum&userAddress=0x456
     */
    router.get('/campaigns/stats', CapitalDistributorRouter.getUserCampaignStatus)

    return router
  },
}

export default CapitalDistributorRouter
