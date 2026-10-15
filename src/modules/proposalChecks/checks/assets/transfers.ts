import KnownAbi from '@modules/proposalChecks/abi'
import { recipientReview } from '@modules/proposalChecks/recipients'
import TreasuryValuation from '@modules/proposalChecks/valuation'
import { simulationRan } from '@modules/proposalChecks/simulation'
import {
  LARGE_TRANSFER_TREASURY_SHARE,
  LARGE_TRANSFER_USD,
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
  type IAssessmentFlatAction,
  type IResolvedAddress,
  type ISimulatedMovement,
  type IValuation,
} from '@types'

export const TRANSFERS_CHECK_ID = 'assets/transfers'

interface IMovement {
  asset: string
  from: string
  to: string
  amount: string
}

/**
 * Rule "Treasury assets move". Every transfer the actions ask for is a change worth telling
 * subscribers about. When the simulation ran, each requested transfer is matched to one
 * predicted movement with the same asset, sender, recipient and amount, and each movement can
 * confirm only one transfer. The recipient's resolution decides whether the finding is tagged
 * for review; how large the amount is against the treasury comes from a later input.
 */
const TransfersCheck = {
  id: TRANSFERS_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }

    const findings: IAssessmentFinding[] = []
    const usedMovements = new Set<number>()
    for (const action of ctx.actions) {
      // A delegatecall runs the target's code on the caller's own storage: it neither sends the
      // value nor touches the target token. Its effects are the delegatecall rule's to flag.
      if (action.operation === 'delegatecall') continue
      const native = TransfersCheck._native(action, ctx, usedMovements)
      if (native) findings.push(native)
      const token = TransfersCheck._token(action, ctx, usedMovements)
      if (token) findings.push(token)
    }
    // A movement the simulation predicts that no decoded action asked for: a router, a withdrawal
    // or a custom function moved treasury assets. It is reported on its own, for a person.
    if (ctx.simulation.status === 'ok') {
      const senders = new Set([
        ctx.request.daoAddress,
        ...ctx.actions.map(a => (a.caller ? a.caller : null)).filter(Boolean),
      ])
      ctx.simulation.movements.forEach((movement, index) => {
        if (usedMovements.has(index) || movement.type.toLowerCase() !== 'transfer' || !senders.has(movement.from))
          return
        findings.push(TransfersCheck._simulated(movement, index, ctx))
      })
    }
    return { status: IAssessmentCheckStatus.Ok, findings }
  },

  /** A verified function named like a transfer but shaped otherwise: what it moves is not read. */
  _unfamiliar(action: IAssessmentFlatAction, ctx: Readonly<IAssessmentContext>): IAssessmentFinding {
    return {
      id: `${TRANSFERS_CHECK_ID}:unfamiliar:${action.path}`,
      checkId: TRANSFERS_CHECK_ID,
      kind: IAssessmentFindingKind.NeedsReview,
      labels: [],
      notify: true,
      title: `Calls ${action.decoded!.signature} on token ${action.target}, a transfer with an unfamiliar signature`,
      details: [
        `action ${action.path}: the function is named like a transfer but its arguments are not the standard ones, so what it moves is not read`,
      ],
      actionPaths: [action.path],
      evidenceLimit: simulationRan(ctx.simulation) ? undefined : 'not confirmed by simulation',
      after: { signature: action.decoded!.signature, args: action.decoded!.args },
    }
  },

  _simulated(movement: ISimulatedMovement, index: number, ctx: Readonly<IAssessmentContext>): IAssessmentFinding {
    const recipient = ctx.recipients[movement.to] ?? null
    const review = recipientReview(recipient, 'recipient')
    const valuation = TreasuryValuation.value(movement.asset, movement.amount, ctx.treasury)
    const details = [
      'predicted by the simulation, not requested by any decoded action: the call producing it could not be read',
    ]
    if (review) details.push(review)
    if (valuation.usd !== null || valuation.treasuryShare !== null) details.push(TransfersCheck._describe(valuation))
    return {
      id: `${TRANSFERS_CHECK_ID}:simulated:${index}`,
      checkId: TRANSFERS_CHECK_ID,
      kind: IAssessmentFindingKind.NeedsReview,
      labels: TransfersCheck._isLarge(valuation) ? ['large'] : [],
      notify: true,
      title: `Moves ${movement.amount} units of ${movement.asset === 'native' ? 'the native coin' : `token ${movement.asset}`} from ${movement.from} to ${movement.to} through a call that could not be read`,
      details,
      actionPaths: [],
      evidenceLimit: TransfersCheck._evidenceLimit(ctx, recipient, valuation),
      after: { ...movement, confirmed: true, recipient, valuation },
    }
  },

  _native(
    action: IAssessmentFlatAction,
    ctx: Readonly<IAssessmentContext>,
    used: Set<number>,
  ): IAssessmentFinding | null {
    if (BigInt(action.value || '0') === 0n) return null
    return TransfersCheck._finding({
      kind: 'native',
      action,
      ctx,
      used,
      title: `Sends ${action.value} wei of the native coin to ${action.target}`,
      movement: { asset: 'native', from: action.caller ?? 'unresolved', to: action.target, amount: action.value },
    })
  },

  _token(
    action: IAssessmentFlatAction,
    ctx: Readonly<IAssessmentContext>,
    used: Set<number>,
  ): IAssessmentFinding | null {
    const decoded = action.decoded
    if (!decoded) return null
    if (decoded.name !== 'transfer' && decoded.name !== 'transferFrom') return null
    if (!KnownAbi.isBuiltin(action)) return TransfersCheck._unfamiliar(action, ctx)
    // transferFrom(address,address,uint256) is also the ERC721 signature; those belong to the NFT rule.
    if (ctx.tokens[action.target] === 'ERC721') return null

    const from = decoded.name === 'transferFrom' ? decoded.args.from : (action.caller ?? 'unresolved')
    return TransfersCheck._finding({
      kind: 'erc20',
      action,
      ctx,
      used,
      title: `Transfers ${decoded.args.amount} units of token ${action.target} to ${decoded.args.to}`,
      movement: { asset: action.target, from, to: decoded.args.to, amount: decoded.args.amount },
    })
  },

  _finding(input: {
    kind: 'native' | 'erc20'
    action: IAssessmentFlatAction
    ctx: Readonly<IAssessmentContext>
    used: Set<number>
    title: string
    movement: IMovement
  }): IAssessmentFinding {
    const { action, ctx, movement } = input
    const details = [`action ${action.path}: ${movement.from} → ${movement.to}`]
    if (movement.from === 'unresolved') {
      details.push('the account this call runs as could not be resolved (forwarded by a Delay module)')
    } else if (movement.from !== ctx.request.daoAddress) {
      details.push(`moves from ${movement.from}, not from the DAO itself`)
    }
    const confirmed = TransfersCheck._confirmed(movement, ctx, input.used)
    if (confirmed === false) details.push('the simulation predicts no such movement')
    const recipient = ctx.recipients[movement.to] ?? null
    const review = recipientReview(recipient, 'recipient')
    if (review) details.push(review)
    const valuation = TreasuryValuation.value(movement.asset, movement.amount, ctx.treasury)
    const large = TransfersCheck._isLarge(valuation)
    if (valuation.usd !== null || valuation.treasuryShare !== null) details.push(TransfersCheck._describe(valuation))

    return {
      id: `${TRANSFERS_CHECK_ID}:${input.kind}:${action.path}`,
      checkId: TRANSFERS_CHECK_ID,
      kind: review ? IAssessmentFindingKind.NeedsReview : IAssessmentFindingKind.Change,
      labels: large ? ['large'] : [],
      notify: true,
      title: input.title,
      details,
      actionPaths: [action.path],
      evidenceLimit: TransfersCheck._evidenceLimit(ctx, recipient, valuation),
      after: { ...movement, confirmed, recipient, valuation },
    }
  },

  /** The source's cut-off: a tenth of the priced treasury, or a hundred thousand dollars. */
  _isLarge(valuation: IValuation): boolean {
    if (valuation.usd !== null && Number(valuation.usd) >= LARGE_TRANSFER_USD) return true
    if (valuation.treasuryShare !== null && Number(valuation.treasuryShare) >= LARGE_TRANSFER_TREASURY_SHARE)
      return true
    return false
  },

  _describe(valuation: IValuation): string {
    const parts: string[] = []
    if (valuation.usd !== null) parts.push(`about $${Number(valuation.usd).toFixed(2)}`)
    if (valuation.treasuryShare !== null)
      parts.push(`${(Number(valuation.treasuryShare) * 100).toFixed(2)}% of the treasury holding`)
    return parts.join(', ')
  },

  /**
   * True or false when the simulation ran and the sender is known; null when there is nothing to
   * compare against. A movement is spent once it confirms a transfer, so two identical requested
   * transfers need two predicted movements.
   */
  _confirmed(movement: IMovement, ctx: Readonly<IAssessmentContext>, used: Set<number>): boolean | null {
    if (ctx.simulation.status !== 'ok' || movement.from === 'unresolved') return null
    const index = ctx.simulation.movements.findIndex(
      (m, i) =>
        !used.has(i) &&
        m.asset === movement.asset &&
        m.from === movement.from &&
        m.to === movement.to &&
        m.amount === movement.amount,
    )
    if (index === -1) return false
    used.add(index)
    return true
  },

  /** Names what could not be verified, so the message never reads as more certain than it is. */
  _evidenceLimit(
    ctx: Readonly<IAssessmentContext>,
    recipient: IResolvedAddress | null,
    valuation: IValuation,
  ): string | undefined {
    const limits: string[] = []
    if (valuation.usd === null) limits.push('amount not priced')
    if (ctx.simulation.status === 'reverted')
      limits.push(`simulation reverted: ${ctx.simulation.reason ?? 'no reason'}`)
    else if (!simulationRan(ctx.simulation)) limits.push('not confirmed by simulation')
    if (!recipient || recipient.kind === 'unknown') limits.push('recipient not resolved')
    else if (recipient.kind === 'contract' && recipient.deployer === null)
      limits.push('recipient deployment not resolved')
    if (ctx.actions.some(a => a.nested === 'truncated' || a.nested === 'unreadable'))
      limits.push('nested calls not expanded')
    return limits.length ? limits.join('; ') : undefined
  },
}

export default TransfersCheck
