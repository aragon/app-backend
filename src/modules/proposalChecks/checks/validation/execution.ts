import { type IAssessmentCheckResult, IAssessmentCheckStatus, type IAssessmentContext } from '@types'

export const EXECUTION_VALIDATION_CHECK_ID = 'validation/execution'

/**
 * Rule "Assessment could not be completed", the execution part. The plugin's real execute was
 * called as an ordinary account at the evidence block. Being told "not yet" is what a live
 * proposal looks like and needs nobody; any other refusal, or no test at all, does.
 */
const ExecutionValidationCheck = {
  id: EXECUTION_VALIDATION_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }

    const v = ctx.validation
    switch (v.status) {
      case 'executable':
        return { status: IAssessmentCheckStatus.Ok, findings: [], reason: `executable by anyone at block ${v.block}` }
      case 'notYet':
        return {
          status: IAssessmentCheckStatus.Ok,
          findings: [],
          reason: `not executable yet at block ${v.block}: ${v.reason}`,
        }
      case 'reverted':
        return {
          status: IAssessmentCheckStatus.NeedsReview,
          findings: [],
          reason: `execution test refused: ${v.reason}`,
        }
      default:
        return {
          status: IAssessmentCheckStatus.NeedsReview,
          findings: [],
          reason: `execution not tested: ${v.reason ?? v.status}`,
        }
    }
  },
}

export default ExecutionValidationCheck
