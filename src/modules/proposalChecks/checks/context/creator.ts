import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
} from '@types'

export const CREATOR_CONTEXT_CHECK_ID = 'context/creator'

const DAY = 86400

/**
 * The three context lines every message carries: whether the creator has proposed on this DAO
 * before, how long before creation their voting power appeared, and the largest voter's share
 * of the votes cast. Context only: nothing here is a risk, nothing is sent on its own, and an
 * unknown value is said to be unknown rather than guessed.
 */
const CreatorContextCheck = {
  id: CREATOR_CONTEXT_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    const c = ctx.creator
    const lines = [
      CreatorContextCheck._history(c.priorProposals),
      CreatorContextCheck._power(c.powerAgeSeconds),
      CreatorContextCheck._share(c),
    ]
    const finding: IAssessmentFinding = {
      id: `${CREATOR_CONTEXT_CHECK_ID}:lines`,
      checkId: CREATOR_CONTEXT_CHECK_ID,
      kind: IAssessmentFindingKind.Change,
      labels: [],
      notify: false,
      title: 'Who proposes and who votes',
      details: lines,
      actionPaths: [],
      ...(c.limits.length ? { evidenceLimit: c.limits.join('; ') } : {}),
      after: c,
    }
    return { status: IAssessmentCheckStatus.Ok, findings: [finding], reason: lines.join('; ') }
  },

  _history(prior: number | null): string {
    if (prior === null) return 'whether the creator has proposed here before is unknown'
    if (prior === 0) return 'first proposal from this creator on this DAO'
    return `the creator has made ${prior} earlier ${prior === 1 ? 'proposal' : 'proposals'} on this DAO`
  },

  _power(age: number | null): string {
    if (age === null) return "when the creator's voting power appeared is unknown"
    if (age < DAY) return "the creator's voting power appeared less than a day before this proposal"
    const days = Math.floor(age / DAY)
    return `the creator's voting power appeared ${days} ${days === 1 ? 'day' : 'days'} before this proposal`
  },

  _share(c: IAssessmentContext['creator']): string {
    if (c.votesCast === 0 || c.largestVoterShare === null)
      return "no votes cast yet, so the largest voter's share is unknown"
    const percent = (Number(c.largestVoterShare) * 100).toFixed(1).replace(/\.0$/, '')
    return `the largest voter holds ${percent}% of the votes cast (${c.votesCast} ${c.votesCast === 1 ? 'voter' : 'voters'})`
  },
}

export default CreatorContextCheck
