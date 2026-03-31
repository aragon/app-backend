import CapitalDistributorController from '@api/controllers/capitalDistributor'
import CapitalDistributorSchema from '@api/routers/schema/capitalDistributor'
import { assertExposable } from '@errors'
import Utils from '@helpers/utils'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'
import UploadMiddleware from '@middlewares/upload'
import {
  ErrorKeyEnum,
  type HexAddress,
  type ICampaignApiParams,
  type IPaginationParams,
  type NetworksEnum,
  type CampaignUploadBody,
} from '@types'

const CapitalDistributorRouter = {
  getCampaignsWithPagination: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'startTime',
      params: {
        pluginAddress: ctx.query.pluginAddress as HexAddress,
        network: ctx.query.network as NetworksEnum,
        userAddress: ctx.query.userAddress as HexAddress,
        status: ctx.query.status as 'claimed' | 'claimable',
        onlyActive: ctx.query.onlyActive !== 'false',
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

  uploadCampaignMembers: async function (ctx: RouterContext) {
    const body = (ctx.request as unknown as { body: CampaignUploadBody }).body

    let rewards: any[] = []

    if (ctx.file) {
      const fileData = UploadMiddleware.parseJsonFile(ctx)

      if (!Array.isArray(fileData)) {
        assertExposable(false, ErrorKeyEnum.badParams)
      }

      rewards = fileData
    } else if (body.fileUrl) {
      let fileData: any
      try {
        fileData = await Utils.fetchSafeJsonFromUrl(body.fileUrl)
      } catch {
        assertExposable(false, ErrorKeyEnum.badParams)
      }

      if (!Array.isArray(fileData)) {
        assertExposable(false, ErrorKeyEnum.badParams)
      }

      rewards = fileData
    } else {
      assertExposable(false, ErrorKeyEnum.badParams)
    }

    await ValidationSchema.validateParams(CapitalDistributorSchema.uploadCampaignMembersBody, rewards)

    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        daoAddress: body.daoAddress as HexAddress,
        capitalDistributorAddress: body.capitalDistributorAddress as HexAddress,
        network: body.network as NetworksEnum,
      },
      schemas: {
        params: CapitalDistributorSchema.uploadCampaignMembersParams,
      },
    })

    ctx.body = await CapitalDistributorController.uploadCampaignMembers({
      ...result.params,
      rewards,
    })
  },

  getCampaignPrepareStatus: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        capitalDistributorAddress: ctx.query.capitalDistributorAddress as HexAddress,
        network: ctx.query.network as NetworksEnum,
        campaignId: ctx.query.campaignId as string,
      },
      schemas: {
        params: CapitalDistributorSchema.getCampaignPrepareStatusParams,
      },
    })

    ctx.body = await CapitalDistributorController.getCampaignPrepareStatus(result.params)
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
     * @api {post} /campaign/upload Upload Campaign Members
     * @apiName UploadCampaignMembers
     * @apiGroup CapitalDistributor
     * @apiDescription Upload a JSON file of reward recipients to create a draft campaign.
     * The file must be a JSON array of { address, amount } objects.
     * Returns a draft campaignId (UUID) that reconciles to the real on-chain ID after the campaign tx is confirmed.
     *
     * @apiParam (FormData) {File} [membersFile] JSON file with reward recipients (multipart upload)
     * @apiParam (FormData) {String} [fileUrl] URL to a JSON file with reward recipients (alternative to membersFile)
     * @apiParam (FormData) {String} daoAddress DAO address
     * @apiParam (FormData) {String} capitalDistributorAddress Capital distributor plugin address
     * @apiParam (FormData) {String} network Network name
     *
     * @apiSuccess {Boolean} success Whether the upload succeeded
     * @apiSuccess {Number} totalInserted Number of new rewards created
     * @apiSuccess {Number} totalUpdated Number of rewards updated
     * @apiSuccess {Number} totalDeleted Number of rewards deleted
     * @apiSuccess {Number} totalProcessed Total rewards processed
     * @apiSuccess {String} campaignId Draft campaign ID (UUID)
     */
    router.post(
      '/campaign/upload',
      UploadMiddleware.single('membersFile'),
      CapitalDistributorRouter.uploadCampaignMembers,
    )

    /**
     * @api {get} /campaign/prepare/status Get Campaign Prepare Status
     * @apiName GetCampaignPrepareStatus
     * @apiGroup CapitalDistributor
     * @apiDescription Poll the merkle tree generation status for a draft campaign.
     * When merkleRoot is non-null, the data is ready for on-chain submission.
     *
     * @apiParam {String} capitalDistributorAddress Capital distributor plugin address
     * @apiParam {String} network Network name
     * @apiParam {String} campaignId Draft campaign ID from upload response
     *
     * @apiSuccess {String} campaignId Campaign ID
     * @apiSuccess {String} pluginAddress Plugin address
     * @apiSuccess {String} network Network name
     * @apiSuccess {String} merkleRoot Merkle root (null while generating)
     * @apiSuccess {Number} totalMembers Total number of reward recipients
     *
     * @apiSampleRequest /capital-distributor/campaign/prepare/status?capitalDistributorAddress=0x123&network=ethereum-sepolia&campaignId=xK9mR2pL7qNwYvBf3jHt
     */
    router.get('/campaign/prepare/status', CapitalDistributorRouter.getCampaignPrepareStatus)

    return router
  },
}

export default CapitalDistributorRouter
