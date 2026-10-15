import ProposalAssessmentController from '@api/controllers/proposalAssessment'
import ProposalAssessmentSchema from '@api/routers/schema/proposalAssessment'
import ValidationSchema from '@helpers/validationSchema'
import Router, { type RouterContext } from '@koa/router'
import { type IPaginationParams } from '@types'

const ProposalAssessmentRouter = {
  async getLatest(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: { proposalId: ctx.params.proposalId },
      schemas: { params: ProposalAssessmentSchema.latest },
    })

    ctx.body = await ProposalAssessmentController.getLatest(result.params.proposalId)
  },

  async getHistory(ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: { proposalId: ctx.params.proposalId },
      schemas: { params: ProposalAssessmentSchema.latest },
    })

    ctx.body = await ProposalAssessmentController.getHistory(
      result.params.proposalId,
      result.paginationParams as IPaginationParams,
    )
  },

  router(): Router {
    const router = new Router()

    router.get('/:proposalId/assessment', ProposalAssessmentRouter.getLatest)
    router.get('/:proposalId/assessments', ProposalAssessmentRouter.getHistory)

    return router
  },
}

export default ProposalAssessmentRouter
