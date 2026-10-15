import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
} from '@types'

export const STAGES_VALIDATION_CHECK_ID = 'validation/stages'

/**
 * Rule "The assessment could not be completed", the stage part. The staged proposal is read from
 * the processor at the evidence block: which stage it is in, and for every body of that stage the
 * child proposal it created and the result it reported. A body whose child was never created, a
 * child the index knows under another id, or a reported result the index disagrees with leaves
 * the stage unverified and the assessment incomplete. A body that has not reported yet is a
 * readiness state. An explicit report counts over a polled child result, and a missing child is
 * not, by itself, a bypass.
 */
const StagesValidationCheck = {
  id: STAGES_VALIDATION_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    const s = ctx.stageEvidence
    if (s.status === 'unsupported') {
      return {
        status: IAssessmentCheckStatus.NotApplicable,
        findings: [],
        reason: s.reason ?? 'stage results not read',
      }
    }
    if (s.status === 'failed' || !s.chain) {
      return {
        status: IAssessmentCheckStatus.NeedsReview,
        findings: [],
        reason: `stage results could not be read at block ${s.block}: ${s.reason ?? 'no reason'}`,
      }
    }
    const chain = s.chain
    const unresolved: string[] = []
    const notes: string[] = []
    const stage = chain.currentStage + 1

    if (s.indexed.stageIndex !== null && s.indexed.stageIndex !== chain.currentStage) {
      unresolved.push(`the processor is in stage ${stage}, the index says stage ${s.indexed.stageIndex + 1}`)
    }
    if (!s.stage)
      unresolved.push(`the saved configuration of stage ${stage} is not indexed, so its results cannot be matched`)
    for (const body of s.bodies) {
      if (!body.isManual && body.chainChildId === null) {
        unresolved.push(
          `body ${body.body} has no child proposal for stage ${stage}: its creation failed or it never ran`,
        )
        continue
      }
      if (
        body.chainChildId !== null &&
        body.indexedChildIndex !== null &&
        body.chainChildId !== body.indexedChildIndex
      ) {
        unresolved.push(
          `body ${body.body}'s child is ${body.chainChildId} on chain but ${body.indexedChildIndex} in the index`,
        )
      }
      if (
        body.chainResult &&
        body.chainResult !== 'none' &&
        body.indexedResult &&
        body.indexedResult !== body.chainResult
      ) {
        unresolved.push(
          `body ${body.body} reported ${body.chainResult} on chain, the index holds ${body.indexedResult}`,
        )
      }
      if (body.chainResult && body.chainResult !== 'none' && body.indexedResult === null) {
        notes.push(`body ${body.body} has reported ${body.chainResult} on chain; the index has not recorded it yet`)
      }
    }
    if (s.indexed.lastStageTransition !== null && s.indexed.lastStageTransition !== chain.lastStageTransition) {
      notes.push(
        `last stage transition on chain ${chain.lastStageTransition}, in the index ${s.indexed.lastStageTransition}`,
      )
    }

    const findings: IAssessmentFinding[] = notes.map((note, i) => ({
      id: `${STAGES_VALIDATION_CHECK_ID}:note:${i}`,
      checkId: STAGES_VALIDATION_CHECK_ID,
      kind: IAssessmentFindingKind.Change,
      labels: [],
      notify: false,
      title: 'Indexed stage data differs from the chain',
      details: [note, 'a data difference, not a governance finding'],
      actionPaths: [],
      after: { block: s.block, stage: chain.currentStage },
    }))

    if (unresolved.length) {
      return {
        status: IAssessmentCheckStatus.NeedsReview,
        findings,
        reason: `stage results cannot be verified at block ${s.block}: ${unresolved.join('; ')}`,
      }
    }
    const pending = s.bodies.filter(b => !b.chainResult || b.chainResult === 'none').length
    return {
      status: IAssessmentCheckStatus.Ok,
      findings,
      reason: `stage ${stage} verified at block ${s.block}: ${chain.approvals} approvals and ${chain.vetoes} vetoes${s.stage ? ` against ${s.stage.approvalThreshold} needed and ${s.stage.vetoThreshold} to veto` : ''}${pending ? `, ${pending} of ${s.bodies.length} bodies still to report` : ''}`,
    }
  },
}

export default StagesValidationCheck
