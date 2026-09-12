import OwnershipFacts, { type IOwnershipCall } from '@modules/proposalChecks/ownership'
import { recipientReview } from '@modules/proposalChecks/recipients'
import { nameOf } from '@modules/proposalChecks/naming'
import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
  type IAssessmentFlatAction,
  IAssessmentSeverity,
  type IResolvedAddress,
} from '@types'

export const OWNERSHIP_CHECK_ID = 'control/ownership'

const ZERO = '0x0000000000000000000000000000000000000000'

/**
 * Rule "Ownership or custody outside the DAO changes". Every supported role change on a contract
 * other than the DAO is a change to notify, naming the holder before and after. What the role
 * lets its holder do depends on the contract, so the finding names the contract and leaves the
 * power to the reader. The new holder is resolved like a recipient: an unverified contract or
 * one the creator just deployed tags the finding for review, which is a tag, not a severity.
 */
const OwnershipCheck = {
  id: OWNERSHIP_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }
    const dao = ctx.request.daoAddress
    const findings: IAssessmentFinding[] = []
    for (const action of ctx.actions) {
      if (action.target === dao) continue
      const call = OwnershipFacts.callOf(action)
      if (call) findings.push(OwnershipCheck._finding(action, call, ctx))
    }
    return { status: IAssessmentCheckStatus.Ok, findings }
  },

  _finding(action: IAssessmentFlatAction, call: IOwnershipCall, ctx: Readonly<IAssessmentContext>): IAssessmentFinding {
    const facts = ctx.ownership[action.path] ?? null
    const subject = facts?.targetName ? `${facts.targetName} at ${action.target}` : `contract ${action.target}`
    const before = facts?.before ?? null
    const was = before ? ` (was ${nameOf(before, ctx)})` : ''
    const holder = OwnershipCheck._holder(call, action, ctx)
    const named = holder ? nameOf(holder, ctx) : 'an account that could not be resolved'
    const recipient = holder ? (ctx.recipients[holder] ?? null) : null
    const review = holder && holder !== ctx.request.daoAddress ? recipientReview(recipient, 'new holder') : null

    let title: string
    const details: string[] = []
    switch (call.kind) {
      case 'owner':
        title = `Transfers ownership of ${subject} to ${named}${was}`
        details.push('the owner administers the contract; what that allows depends on the contract')
        break
      case 'acceptOwnership':
        title = `${named} accepts ownership of ${subject}${was}`
        details.push('the nomination made earlier takes effect')
        break
      case 'renounceOwnership':
        title = `Gives up ownership of ${subject}${was}`
        details.push('nobody can administer the contract afterwards')
        break
      case 'pendingGovernor':
        title = `Nominates ${named} as governor of ${subject}${was}`
        details.push('takes effect once the nominee accepts')
        break
      case 'acceptGovernor':
        title = `${named} becomes governor of ${subject}${was}`
        details.push(
          "the governor controls the contract's settings and custody; what that allows depends on the contract",
        )
        break
      case 'guardian':
        title =
          holder === ZERO
            ? `Removes the guardian of ${subject}${was}`
            : `Sets the guardian of ${subject} to ${named}${was}`
        details.push(
          holder === ZERO
            ? 'the guardian seat, which usually pauses or vetoes, is left empty with no replacement'
            : 'a guardian usually pauses or vetoes; what it allows depends on the contract',
        )
        break
      case 'role':
        title = call.granted
          ? `Grants role ${call.role} on ${subject} to ${named}`
          : `Revokes role ${call.role} on ${subject} from ${named}`
        details.push('what the role allows depends on the contract')
        break
    }
    if (recipient) details.push(OwnershipCheck._describe(recipient))
    if (review) details.push(review)

    const limits = ["the role's powers depend on the target implementation, which is not read"]
    if (!facts) limits.push('the holder before the action could not be read')
    if (holder && !recipient) limits.push('new holder not resolved')

    const guardianGone = call.kind === 'guardian' && holder === ZERO
    return {
      id: `${OWNERSHIP_CHECK_ID}:${call.kind}:${action.path}`,
      checkId: OWNERSHIP_CHECK_ID,
      kind: guardianGone
        ? IAssessmentFindingKind.Risk
        : review
          ? IAssessmentFindingKind.NeedsReview
          : IAssessmentFindingKind.Change,
      ...(guardianGone ? { severity: IAssessmentSeverity.High } : {}),
      labels: call.kind === 'guardian' ? ['protectionReduced'] : [],
      notify: true,
      title,
      details,
      actionPaths: [action.path],
      evidenceLimit: limits.join('; '),
      after: { ...call, target: action.target, holder, before, recipient },
    }
  },

  /** Who ends up with the role: the named account, or for an accept the account making the call. */
  _holder(call: IOwnershipCall, action: IAssessmentFlatAction, ctx: Readonly<IAssessmentContext>): string | null {
    if (call.kind === 'acceptOwnership' || call.kind === 'acceptGovernor') return action.caller
    if (call.kind === 'renounceOwnership') return ZERO
    return call.holder
  },

  _describe(recipient: IResolvedAddress): string {
    if (recipient.kind === 'eoa') return 'the new holder is a wallet'
    if (recipient.kind === 'contract') {
      const name = recipient.contractName ? ` (${recipient.contractName})` : ''
      return `the new holder is a ${recipient.verified ? 'verified' : 'unverified'} contract${name}`
    }
    return 'the new holder could not be resolved'
  },
}

export default OwnershipCheck
