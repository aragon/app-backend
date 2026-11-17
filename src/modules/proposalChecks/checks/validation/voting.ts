import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
} from '@types'

export const VOTING_VALIDATION_CHECK_ID = 'validation/voting'

const RATIO_BASE = 1_000_000n

/**
 * Rule "The assessment could not be completed", the voting part. The token vote is read from the
 * plugin at the evidence block and set against the index: the tally, the eligible supply at the
 * snapshot, the dates and the thresholds frozen into the proposal. A disagreement on what decides
 * passage, the tally or the supply, leaves the voting data unresolved and the assessment
 * incomplete. Anything else that differs is a dashboard note. A vote nobody has cast yet is not a
 * disagreement, and the token's total supply is not the eligible supply.
 */
const VotingValidationCheck = {
  id: VOTING_VALIDATION_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    const v = ctx.votingEvidence
    if (v.status === 'unsupported') {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: v.reason ?? 'voting data not read' }
    }
    if (v.status === 'failed' || !v.chain) {
      return {
        status: IAssessmentCheckStatus.NeedsReview,
        findings: [],
        reason: `voting data could not be read at block ${v.block}: ${v.reason ?? 'no reason'}`,
      }
    }
    const chain = v.chain
    const unresolved: string[] = []
    const notes: string[] = []

    if (v.indexed.tally && !VotingValidationCheck._sameTally(v.indexed.tally, chain.tally)) {
      unresolved.push(
        `tally differs: chain yes ${chain.tally.yes} / no ${chain.tally.no} / abstain ${chain.tally.abstain}, index yes ${v.indexed.tally.yes} / no ${v.indexed.tally.no} / abstain ${v.indexed.tally.abstain}`,
      )
    }
    if (chain.eligibleSupply === null) {
      unresolved.push(`eligible supply at snapshot block ${chain.snapshotBlock} could not be read`)
    } else if (v.indexed.totalSupply !== null && v.indexed.totalSupply !== chain.eligibleSupply) {
      notes.push(
        `the index holds a total supply of ${v.indexed.totalSupply}; the eligible voting supply at snapshot block ${chain.snapshotBlock} is ${chain.eligibleSupply}`,
      )
    }
    if (v.indexed.supportThreshold !== null && v.indexed.supportThreshold !== chain.supportThreshold) {
      notes.push(
        `support threshold frozen into the proposal is ${chain.supportThreshold}, the index holds ${v.indexed.supportThreshold}`,
      )
    }
    if (v.indexed.votingMode !== null && v.indexed.votingMode !== chain.votingMode) {
      notes.push(`voting mode frozen into the proposal is ${chain.votingMode}, the index holds ${v.indexed.votingMode}`)
    }
    if (v.indexed.startDate !== null && v.indexed.startDate !== chain.startDate)
      notes.push(`start date on chain ${chain.startDate}, in the index ${v.indexed.startDate}`)
    if (v.indexed.endDate !== null && v.indexed.endDate !== chain.endDate)
      notes.push(`end date on chain ${chain.endDate}, in the index ${v.indexed.endDate}`)
    if (chain.eligibleSupply !== null && v.indexed.minParticipation !== null) {
      const expected = (BigInt(v.indexed.minParticipation) * BigInt(chain.eligibleSupply)) / RATIO_BASE
      if (expected !== BigInt(chain.minVotingPower)) {
        notes.push(
          `minimum voting power frozen into the proposal is ${chain.minVotingPower}, the indexed participation setting over the eligible supply gives ${expected}`,
        )
      }
    }

    const findings: IAssessmentFinding[] = notes.map((note, i) => ({
      id: `${VOTING_VALIDATION_CHECK_ID}:note:${i}`,
      checkId: VOTING_VALIDATION_CHECK_ID,
      kind: IAssessmentFindingKind.Change,
      labels: [],
      notify: false,
      title: 'Indexed voting data differs from the chain',
      details: [note, 'a data difference, not a governance finding'],
      actionPaths: [],
      evidenceLimit: 'individual voter power at the snapshot is not checked',
      after: { block: v.block, snapshotBlock: chain.snapshotBlock },
    }))

    if (unresolved.length) {
      return {
        status: IAssessmentCheckStatus.NeedsReview,
        findings,
        reason: `voting data cannot be reconciled at block ${v.block}: ${unresolved.join('; ')}`,
      }
    }
    return {
      status: IAssessmentCheckStatus.Ok,
      findings,
      reason: `tally and eligible supply reconciled at block ${v.block}, snapshot block ${chain.snapshotBlock}${notes.length ? `, ${notes.length} indexed value(s) differ` : ''}`,
    }
  },

  _sameTally(
    a: { yes: string; no: string; abstain: string },
    b: { yes: string; no: string; abstain: string },
  ): boolean {
    return BigInt(a.yes) === BigInt(b.yes) && BigInt(a.no) === BigInt(b.no) && BigInt(a.abstain) === BigInt(b.abstain)
  },
}

export default VotingValidationCheck
