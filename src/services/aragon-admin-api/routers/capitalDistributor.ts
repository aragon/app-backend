import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import CapitalDistributorSchema from '@admin-api/routers/schema/capitalDistributor'
import { CapitalDistributorAdminController } from '@admin-api/controllers/capitalDistributor'
import AuthMiddleware from '@middlewares/auth'
import UploadMiddleware from '@middlewares/upload'
import { assertExposable } from '@errors'
import { ErrorKeyEnum } from '@types'

const CapitalDistributorAdminRouter = {
  uploadMembersList: async function (ctx: RouterContext) {
    const params = {
      campaignId: ctx.params.campaignId,
      pluginAddress: ctx.params.pluginAddress,
      network: ctx.params.network,
    }

    let rewards: any[]

    if (ctx.file) {
      const fileData = UploadMiddleware.parseJsonFile(ctx)

      if (!Array.isArray(fileData)) {
        assertExposable(false, ErrorKeyEnum.badParams)
      }

      rewards = fileData
    } else {
      const body = ctx.request.body
      const formattedBody = await ValidationSchema.validateParams(CapitalDistributorSchema.addMembersListBody, body)
      rewards = formattedBody.rewards
    }

    const formattedParams = await ValidationSchema.validateParams(CapitalDistributorSchema.addMembersListParams, params)

    const combinedParams = {
      ...formattedParams,
      rewards,
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

  generateMerkleData: async function (ctx: RouterContext) {
    const params = {
      campaignId: ctx.params.campaignId,
      pluginAddress: ctx.params.pluginAddress,
      network: ctx.params.network,
    }

    const formattedParams = await ValidationSchema.validateParams(CapitalDistributorSchema.campaignParams, params)
    ctx.body = await CapitalDistributorAdminController.generateMerkleData(formattedParams)
  },

  router() {
    const router = new Router()
    const authedAdmin = AuthMiddleware.authAssertAdmin()

    router.post(
      '/:pluginAddress/:network/:campaignId',
      authedAdmin,
      UploadMiddleware.single('membersFile'),
      CapitalDistributorAdminRouter.uploadMembersList,
    )
    router.get('/:pluginAddress/:network/:campaignId', authedAdmin, CapitalDistributorAdminRouter.getMembersList)

    router.get('/test', authedAdmin, async (ctx: RouterContext) => {
      ctx.body = { hello: true }
    })

    router.get(
      '/sync-merkle-tree/:pluginAddress/:network/:campaignId',
      authedAdmin,
      CapitalDistributorAdminRouter.generateMerkleData,
    )

    return router
  },
}

export default CapitalDistributorAdminRouter
