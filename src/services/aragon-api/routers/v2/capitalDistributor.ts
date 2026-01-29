import CapitalDistributorController from '@api/controllers/capitalDistributor'
import CapitalDistributorSchema from '@api/routers/schema/capitalDistributor'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'
import { type HexAddress, type ICampaignApiParams, type IPaginationParams, type NetworksEnum } from '@types'

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

  getUserCampaignReward: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        pluginAddress: ctx.query.pluginAddress as HexAddress,
        network: ctx.query.network as NetworksEnum,
        userAddress: ctx.query.userAddress as HexAddress,
        campaignId: ctx.query.campaignId as string,
      },
      schemas: {
        params: CapitalDistributorSchema.getUserCampaignRewardParams,
      },
    })

    ctx.body = await CapitalDistributorController.getUserCampaignReward({
      pluginAddress: result.params.pluginAddress,
      network: result.params.network,
      userAddress: result.params.userAddress,
      campaignId: result.params.campaignId,
    })
  },

  getPrepareMessage: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        daoAddress: ctx.query.daoAddress as HexAddress,
        network: ctx.query.network as NetworksEnum,
      },
      schemas: {
        params: CapitalDistributorSchema.getPrepareMessage,
      },
    })

    ctx.body = await CapitalDistributorController.getPrepareMessage(result.params)
  },

  prepareCampaignFromGauge: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: ctx.request.body,
      schemas: {
        params: CapitalDistributorSchema.prepareCampaignFromGauge,
      },
    })

    ctx.body = await CapitalDistributorController.prepareCampaignFromGauge(result.params)
  },

  getPrepareStatus: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        prepareId: ctx.params.prepareId as string,
      },
      schemas: {
        params: CapitalDistributorSchema.getPrepareStatus,
      },
    })

    ctx.body = await CapitalDistributorController.getPrepareStatus(result.params.prepareId)
  },

  router(): Router {
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

    /**
     * @api {get} /campaign/reward Get User Campaign Reward
     * @apiName GetUserCampaignReward
     * @apiGroup CapitalDistributor
     * @apiDescription Get specific campaign reward details for a user
     *
     * @apiParam {String} pluginAddress Plugin address
     * @apiParam {String} network Network name
     * @apiParam {String} userAddress User address
     * @apiParam {String} campaignId Campaign ID
     *
     * @apiSuccess {Boolean} exists Whether the reward exists
     * @apiSuccess {String} campaignId Campaign ID
     * @apiSuccess {String} userAddress User address
     * @apiSuccess {String} amount Total reward amount
     * @apiSuccess {String} totalClaimed Total amount claimed
     * @apiSuccess {Array} claims Array of claim objects
     * @apiSuccess {Array} proof Merkle proof array
     * @apiSuccess {String} leaf Merkle leaf
     * @apiSuccess {Boolean} isFullyClaimed Whether user has fully claimed
     *
     * @apiSampleRequest /capital-distributor/campaign/reward?pluginAddress=0x123&network=ethereum&userAddress=0x456&campaignId=1
     */
    router.get('/campaign/reward', CapitalDistributorRouter.getUserCampaignReward)

    /**
     * @api {get} /campaign/prepare/message Get EIP-712 Message to Sign
     * @apiName GetPrepareMessage
     * @apiGroup CapitalDistributor
     * @apiDescription Get EIP-712 typed data message for signing before preparing campaign
     *
     * @apiParam {String} daoAddress DAO address
     * @apiParam {String} network Network name
     *
     * @apiSuccess {Object} typedData EIP-712 typed data for signing
     * @apiSuccess {String} nonce Unique nonce (required for prepare endpoint)
     * @apiSuccess {Number} expiresAt Expiry timestamp (5 minutes)
     */
    router.get('/campaign/prepare/message', CapitalDistributorRouter.getPrepareMessage)

    /**
     * @api {post} /campaign/prepare Prepare Campaign from Gauge Votes
     * @apiName PrepareCampaignFromGauge
     * @apiGroup CapitalDistributor
     * @apiDescription Prepare a campaign distribution based on gauge voting power (requires signature)
     *
     * @apiBody {String} daoAddress DAO address
     * @apiBody {String} network Network name
     * @apiBody {String} gaugePluginAddress Gauge voter plugin address
     * @apiBody {String} capitalDistributorAddress Capital distributor plugin address
     * @apiBody {String} tokenAddress Token to distribute
     * @apiBody {String} totalAmount Total amount to distribute (wei)
     * @apiBody {String} metadataUri IPFS URI for campaign metadata
     * @apiBody {String} [epochId] Epoch ID (uses current if not provided)
     * @apiBody {String} nonce Nonce from /campaign/prepare/message endpoint
     * @apiBody {String} signature EIP-712 signature from wallet
     *
     * @apiSuccess {String} prepareId Unique prepare ID for tracking
     * @apiSuccess {String} status Current status (pending)
     */
    router.post('/campaign/prepare', CapitalDistributorRouter.prepareCampaignFromGauge)

    /**
     * @api {get} /campaign/prepare/:prepareId/status Get Prepare Status
     * @apiName GetPrepareStatus
     * @apiGroup CapitalDistributor
     * @apiDescription Get the status of a campaign preparation
     *
     * @apiParam {String} prepareId Prepare ID from the prepare endpoint
     *
     * @apiSuccess {String} prepareId Prepare ID
     * @apiSuccess {String} status Current status (pending, processing, completed, failed)
     * @apiSuccess {String} [merkleRoot] Merkle root (only when completed)
     * @apiSuccess {Number} totalMembers Number of recipients
     */
    router.get('/campaign/prepare/:prepareId/status', CapitalDistributorRouter.getPrepareStatus)

    return router
  },
}

export default CapitalDistributorRouter
