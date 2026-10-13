import { type IAssessmentCheckResult, IAssessmentCheckStatus, type IAssessmentContext } from '@types'

export const DELEGATECALL_CHECK_ID = 'execution/delegatecall'

/**
 * Rule "External code runs with the caller's authority". A delegatecall runs the target's code
 * with the calling account's storage and balance, so nothing about it can be read as an ordinary
 * transfer or setting change. Until the target's code is analysed in that context, every
 * delegatecall is reported for a person to look at.
 */
const DelegatecallCheck = {
  id: DELEGATECALL_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }

    const delegated = ctx.actions.filter(a => a.operation === 'delegatecall')
    if (delegated.length === 0) return { status: IAssessmentCheckStatus.Ok, findings: [] }

    const named = delegated.map(a => `${a.path} (${a.target} as ${a.caller ?? 'an unresolved account'})`)
    return {
      status: IAssessmentCheckStatus.NeedsReview,
      findings: [],
      reason: `code runs with the caller's storage and was not interpreted at ${named.join('; ')}`,
    }
  },
}

export default DelegatecallCheck
