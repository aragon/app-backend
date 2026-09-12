import KnownAbi from '@modules/proposalChecks/abi'
import { recipientReview } from '@modules/proposalChecks/recipients'
import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
  type IAssessmentFlatAction,
  type IResolvedAddress,
} from '@types'
import { MaxUint256 } from 'ethers'

export const ALLOWANCES_CHECK_ID = 'assets/allowances'

/**
 * Rule "Another address can spend treasury tokens". An approval is not a transfer: it lets the
 * spender move tokens later. A new or larger allowance is worth a message, a smaller or removed
 * one only the dashboard; which one an approve is depends on the allowance it replaces, read
 * at the evidence block. The spender is resolved like a recipient and tagged the same way.
 */
const AllowancesCheck = {
  id: ALLOWANCES_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }
    const findings: IAssessmentFinding[] = []
    // The allowance each action replaces: what the chain held at the block for the first action
    // on a token, owner and spender, then what the previous action in this proposal left.
    const running: Record<string, string> = {}
    for (const action of ctx.actions) {
      if (action.operation === 'delegatecall' || !action.decoded) continue
      const finding = AllowancesCheck._finding(action, ctx, running)
      if (finding) findings.push(finding)
    }
    return { status: IAssessmentCheckStatus.Ok, findings }
  },

  _finding(
    action: IAssessmentFlatAction,
    ctx: Readonly<IAssessmentContext>,
    running: Record<string, string>,
  ): IAssessmentFinding | null {
    const { name, args } = action.decoded!
    const token = action.target
    if (!KnownAbi.isBuiltin(action)) return null
    // approve(address,uint256) on an ERC721 approves one token id, which is the NFT rule's business.
    if (name === 'approve' && ctx.tokens[token] === 'ERC721') return null
    const spender = args.spender
    if (!spender) return null

    const key = `${token}|${action.caller ?? ''}|${spender}`
    const before = running[key] ?? ctx.allowances[action.path] ?? null
    let change: 'set' | 'removed' | 'raised' | 'lowered' | 'unchanged'
    let amount: string
    let after: string | null
    if (name === 'approve') {
      amount = args.amount
      after = amount
      change =
        BigInt(amount) === 0n
          ? 'removed'
          : before === null
            ? 'set'
            : BigInt(amount) > BigInt(before)
              ? 'raised'
              : BigInt(amount) < BigInt(before)
                ? 'lowered'
                : 'unchanged'
    } else if (name === 'increaseAllowance') {
      amount = args.addedValue
      after = before === null ? null : (BigInt(before) + BigInt(amount)).toString()
      change = 'raised'
    } else if (name === 'decreaseAllowance') {
      amount = args.subtractedValue
      // A decrease past zero reverts on the token; what would remain is floored at zero here.
      after =
        before === null ? null : (BigInt(before) > BigInt(amount) ? BigInt(before) - BigInt(amount) : 0n).toString()
      change = 'lowered'
    } else {
      return null
    }

    if (after !== null && action.caller) running[key] = after
    const owner = action.caller ?? 'unresolved'
    const unlimited = after === MaxUint256.toString()
    const notify = change === 'set' || change === 'raised'
    const recipient = ctx.recipients[spender] ?? null
    const review = recipientReview(recipient, 'spender')
    const confirmed = AllowancesCheck._confirmed(name === 'approve', token, owner, spender, amount, ctx)

    const details = [`action ${action.path}: ${owner} lets ${spender} spend token ${token}`]
    if (before !== null)
      details.push(`allowance before the action: ${before}${after !== null ? `, after: ${after}` : ''}`)
    if (unlimited) details.push('the allowance is unlimited')
    if (owner !== ctx.request.daoAddress)
      details.push(
        owner === 'unresolved'
          ? 'the account granting this could not be resolved'
          : `granted by ${owner}, not by the DAO itself`,
      )
    if (confirmed === false) details.push('the simulation predicts no such approval')
    if (review) details.push(review)

    const titles = {
      set: `Allows ${spender} to spend ${unlimited ? 'an unlimited amount' : `${amount} units`} of token ${token}`,
      removed: `Removes the allowance of ${spender} on token ${token}`,
      raised: `Raises the allowance of ${spender} on token ${token} to ${after ?? `${amount} more units`}`,
      lowered: `Lowers the allowance of ${spender} on token ${token} to ${after ?? `${amount} fewer units`}`,
      unchanged: `Sets the allowance of ${spender} on token ${token} to what it already is`,
    }
    const limits: string[] = []
    if (before === null) limits.push('allowance before the action not read')
    if (ctx.availability.simulation !== 'ok') limits.push('not confirmed by simulation')
    if (!recipient || recipient.kind === 'unknown') limits.push('spender not resolved')

    return {
      id: `${ALLOWANCES_CHECK_ID}:${change}:${action.path}`,
      checkId: ALLOWANCES_CHECK_ID,
      kind: review ? IAssessmentFindingKind.NeedsReview : IAssessmentFindingKind.Change,
      labels: [],
      notify: notify || !!review,
      title: titles[change],
      details,
      actionPaths: [action.path],
      evidenceLimit: limits.length ? limits.join('; ') : undefined,
      after: { token, owner, spender, amount, before, after, change, unlimited, confirmed, recipient },
    }
  },

  /** Only an approve names the resulting amount, which is what the simulated Approval event carries. */
  _confirmed(
    viaApprove: boolean,
    token: string,
    owner: string,
    spender: string,
    amount: string,
    ctx: Readonly<IAssessmentContext>,
  ): boolean | null {
    if (ctx.simulation.status !== 'ok' || owner === 'unresolved' || !viaApprove) return null
    return ctx.simulation.approvals.some(
      a => a.token === token && a.owner === owner && a.spender === spender && a.amount === amount,
    )
  },
}

export default AllowancesCheck
