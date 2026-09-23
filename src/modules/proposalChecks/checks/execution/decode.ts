import { type IAssessmentCheckResult, IAssessmentCheckStatus, type IAssessmentContext } from '@types'

export const DECODE_CHECK_ID = 'execution/decode'

/**
 * Rule "Action cannot be reliably decoded". Every call with calldata must have been matched to
 * a function, either from the checks' own signatures or from the target's verified source read
 * at the evidence block. A call that stayed undecoded, or one decoded against code that may
 * not be what the proposal will run into, is named here so a person looks at it. Empty
 * calldata is a plain value transfer and needs no decoding.
 */
const DecodeCheck = {
  id: DECODE_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }

    const undecoded = ctx.actions.filter(a => a.decoding === 'unknown')
    if (undecoded.length > 0) {
      const named = undecoded.map(a => `${a.path} (${a.selector ?? 'no selector'} on ${a.target})`)
      return {
        status: IAssessmentCheckStatus.NeedsReview,
        findings: [],
        reason: `no verified source or matching function for ${named.join('; ')}`,
      }
    }

    const unpinned = ctx.actions.filter(a => a.abi && !a.abi.blockPinned).map(a => a.path)
    if (unpinned.length === 0) return { status: IAssessmentCheckStatus.Ok, findings: [] }
    return {
      status: IAssessmentCheckStatus.NeedsReview,
      findings: [],
      reason: `ABI for ${unpinned.join(', ')} read from the current implementation, not at block ${ctx.captured.evidenceBlock.number}`,
    }
  },
}

export default DecodeCheck
