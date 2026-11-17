import { type IAssessmentCheckResult, IAssessmentCheckStatus, type IAssessmentContext } from '@types'

export const NESTED_CHECK_ID = 'execution/nested'

/**
 * Rule "Batch or router contains further actions". The inner calls themselves are judged by the
 * other rules; this one only says whether every wrapper could be followed. A wrapper whose
 * contents could not be read, or that sits past the depth limit, leaves actions unassessed and
 * needs a human to look.
 */
const NestedCheck = {
  id: NESTED_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }

    const unreadable = ctx.actions.filter(a => a.nested === 'unreadable').map(a => a.path)
    const truncated = ctx.actions.filter(a => a.nested === 'truncated').map(a => a.path)
    if (unreadable.length === 0 && truncated.length === 0) {
      return { status: IAssessmentCheckStatus.Ok, findings: [] }
    }

    const parts: string[] = []
    if (unreadable.length) parts.push(`wrapper calldata could not be read at ${unreadable.join(', ')}`)
    if (truncated.length) parts.push(`inner calls past the depth limit were not followed at ${truncated.join(', ')}`)
    return { status: IAssessmentCheckStatus.NeedsReview, findings: [], reason: parts.join('; ') }
  },
}

export default NestedCheck
