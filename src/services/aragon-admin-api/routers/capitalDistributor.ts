import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import CapitalDistributorSchema from '@admin-api/routers/schema/capitalDistributor'
import CapitalDistributorAdminController from '@admin-api/controllers/capitalDistributor'
import AuthMiddleware from '@middlewares/auth'

const CapitalDistributorAdminRouter = {
  uploadMembersList: async function (ctx: RouterContext) {
    const params = {
      campaignId: ctx.params.campaignId,
      pluginAddress: ctx.params.pluginAddress,
      network: ctx.params.network,
    }

    const body = ctx.request.body

    const formattedParams = await ValidationSchema.validateParams(CapitalDistributorSchema.addMembersListParams, params)
    const formattedBody = await ValidationSchema.validateParams(CapitalDistributorSchema.addMembersListBody, body)

    const combinedParams = {
      ...formattedParams,
      rewards: formattedBody.rewards,
    }

    ctx.body = await CapitalDistributorAdminController.uploadMembersList(combinedParams)
  },

  getMembersList: async function (ctx: RouterContext) {
    const params = {
      campaignId: ctx.params.campaignId,
      pluginAddress: ctx.params.pluginAddress,
      network: ctx.params.network,
    }

    const formattedParams = await ValidationSchema.validateParams(CapitalDistributorSchema.campaignParams, params)
    ctx.body = await CapitalDistributorAdminController.getMembersList(formattedParams)
  },

  syncMerkleTree: async function (ctx: RouterContext) {
    const params = {
      campaignId: ctx.params.campaignId,
      pluginAddress: ctx.params.pluginAddress,
      network: ctx.params.network,
    }

    const formattedParams = await ValidationSchema.validateParams(CapitalDistributorSchema.campaignParams, params)
    ctx.body = await CapitalDistributorAdminController.syncMerkleTree(formattedParams)
  },


  router() {
    const router = new Router()
    const authedAdmin = AuthMiddleware.authAssertAdmin()

    // Members list management
    router.post('/members/:pluginAddress/:network/:campaignId', authedAdmin, CapitalDistributorAdminRouter.uploadMembersList)
    router.get('/members/:pluginAddress/:network/:campaignId', authedAdmin, CapitalDistributorAdminRouter.getMembersList)
    
    // Merkle tree management
    router.post('/merkle-tree/sync/:pluginAddress/:network/:campaignId', authedAdmin, CapitalDistributorAdminRouter.syncMerkleTree)

    return router
  },
}

export default CapitalDistributorAdminRouter