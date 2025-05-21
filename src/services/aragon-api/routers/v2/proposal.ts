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

  canCastVote: async function (ctx: RouterContext) {
    const params = {
      proposalId: ctx.params.proposalId,
      userAddress: ctx.query.userAddress,
    }

    const formattedValues = await ValidationSchema.validateParams(ProposalSchema.canCastVote, params)

    const status = await ProposalController.canCastVote(formattedValues)
    ctx.body = { status }
  },

  router() {
    const router = new Router()

    /**
     * @api {get} /proposal/canCreateProposal
     * @apiDescription Check if the user is allowed to create the proposal
     */
    router.get('/can-create-proposal', ProposalRouter.canCreateProposal)

    /**
     * @api {get} / Check if the user is allowed to cast vote on a proposal
     */
    router.get('/:proposalId/can-vote', ProposalRouter.canCastVote)

    return router
  },
}

export default ProposalRouter
