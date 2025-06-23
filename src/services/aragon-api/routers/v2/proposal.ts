import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ProposalSchema from '@api/routers/schema/proposal'
import ProposalController from '@api/controllers/proposal'
import { type HexAddress, type ICanCreateProposalParams, type NetworksEnum } from '@types'

const ProposalRouter = {
  canCreateProposal: async function (ctx: RouterContext) {
    const params: ICanCreateProposalParams = {
      memberAddress: ctx.query.memberAddress as HexAddress,
      pluginAddress: ctx.query.pluginAddress as HexAddress,
      network: ctx.query.network as NetworksEnum,
    }

    const formattedValues = await ValidationSchema.validateParams(ProposalSchema.canCreateProposal, params)

    const status = await ProposalController.canCreateProposal(formattedValues)
    ctx.body = { status }
  },

  router() {
    const router = new Router()

    /**
     * @api {get} /proposal/canCreateProposal
     * @apiDescription Check if the user is allowed to create the proposal
     *
     *  @apiSampleRequest /proposal/can-create-proposal
     */
    router.get('/can-create-proposal', ProposalRouter.canCreateProposal)

    return router
  },
}

export default ProposalRouter
