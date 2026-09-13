import KnownAbi from '@modules/proposalChecks/abi'
import { recipientReview } from '@modules/proposalChecks/recipients'
import { simulationRan } from '@modules/proposalChecks/simulation'
import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
  type IAssessmentFlatAction,
  type IResolvedAddress,
  type ISimulatedMovement,
} from '@types'

export const MINT_BURN_CHECK_ID = 'assets/mintBurn'

/**
 * Rule "Tokens are minted or burned". Every mint and burn is worth a message, with what it does
 * to the governance token when that is the token touched. Two sources are read: the decoded
 * actions, and the mints and burns the simulation predicts, so a mint that goes through some
 * other contract's code is still reported. A function called mint does not by itself change
 * voting power: minted governance tokens carry no votes until delegated, and that is said.
 */
const MintBurnCheck = {
  id: MINT_BURN_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }
    const findings: IAssessmentFinding[] = []
    const usedMovements = new Set<number>()
    for (const action of ctx.actions) {
      if (action.operation === 'delegatecall' || !action.decoded) continue
      const finding = MintBurnCheck._fromAction(action, ctx, usedMovements)
      if (finding) findings.push(finding)
    }
    if (ctx.simulation.status === 'ok') {
      ctx.simulation.movements.forEach((movement, index) => {
        if (usedMovements.has(index) || !MintBurnCheck._kindOf(movement)) return
        findings.push(MintBurnCheck._fromSimulation(movement, index, ctx))
      })
    }
    return { status: IAssessmentCheckStatus.Ok, findings }
  },

  _fromAction(
    action: IAssessmentFlatAction,
    ctx: Readonly<IAssessmentContext>,
    used: Set<number>,
  ): IAssessmentFinding | null {
    const { name, args } = action.decoded!
    const token = action.target
    if (!KnownAbi.isBuiltin(action)) {
      if (!['mint', 'burn', 'burnFrom', 'freezeMinting'].includes(name)) return null
      return MintBurnCheck._finding(ctx, {
        id: `${MINT_BURN_CHECK_ID}:unfamiliar:${action.path}`,
        title: `Calls ${action.decoded!.signature} on token ${token}, named like a ${name === 'burn' || name === 'burnFrom' ? 'burn' : 'mint'} but shaped otherwise`,
        details: [
          `action ${action.path}: the arguments are not the standard ones, so what it mints or burns is not read`,
        ],
        actionPaths: [action.path],
        review: 'the function is matched by name only',
        after: { token, kind: 'unfamiliar', confirmed: null, recipient: null, signature: action.decoded!.signature },
      })
    }
    if (name === 'freezeMinting') {
      return MintBurnCheck._finding(ctx, {
        id: `${MINT_BURN_CHECK_ID}:freeze:${action.path}`,
        title: `Calls freezeMinting on token ${token}`,
        details: [
          `action ${action.path}: on Aragon's GovernanceERC20 this stops minting for good; what it does on this token is not read`,
        ],
        review: 'the function is matched by name only',
        actionPaths: [action.path],
        after: { token, kind: 'freeze', confirmed: null, recipient: null },
      })
    }
    const kind = name === 'mint' ? 'mint' : ['burn', 'burnFrom'].includes(name) ? 'burn' : null
    if (!kind) return null

    const account = name === 'mint' ? args.to : name === 'burnFrom' ? args.account : (action.caller ?? 'unresolved')
    const amount = args.amount
    const confirmed = MintBurnCheck._confirmed(kind, token, account, amount, ctx, used)
    const recipient = kind === 'mint' ? (ctx.recipients[account] ?? null) : null
    const review = recipientReview(recipient, 'recipient')
    const details = [
      `action ${action.path}: ${kind === 'mint' ? `mints ${amount} units to ${account}` : `burns ${amount} units from ${account}`}`,
    ]
    details.push(...MintBurnCheck._governanceEffect(token, kind, ctx))
    if (confirmed === false) details.push(`the simulation predicts no such ${kind}`)
    if (review) details.push(review)
    return MintBurnCheck._finding(ctx, {
      id: `${MINT_BURN_CHECK_ID}:${kind}:${action.path}`,
      title:
        kind === 'mint'
          ? `Mints ${amount} units of token ${token} to ${account}`
          : `Burns ${amount} units of token ${token} from ${account}`,
      details,
      actionPaths: [action.path],
      review,
      after: { token, kind, account, amount, confirmed, recipient },
    })
  },

  /** A mint or burn the simulation predicts that no decoded action asked for: it came through some other call. */
  _fromSimulation(movement: ISimulatedMovement, index: number, ctx: Readonly<IAssessmentContext>): IAssessmentFinding {
    const kind = MintBurnCheck._kindOf(movement)!
    const account = kind === 'mint' ? movement.to : movement.from
    const recipient = kind === 'mint' ? (ctx.recipients[account] ?? null) : null
    const details = [`predicted by the simulation, not requested by any decoded action`]
    details.push(...MintBurnCheck._governanceEffect(movement.asset, kind, ctx))
    return MintBurnCheck._finding(ctx, {
      id: `${MINT_BURN_CHECK_ID}:${kind}:simulated:${index}`,
      title:
        kind === 'mint'
          ? `Mints ${movement.amount} units of token ${movement.asset} to ${account}`
          : `Burns ${movement.amount} units of token ${movement.asset} from ${account}`,
      details,
      actionPaths: [],
      review: 'the call producing this could not be read',
      after: { token: movement.asset, kind, account, amount: movement.amount, confirmed: true, recipient },
    })
  },

  _finding(
    ctx: Readonly<IAssessmentContext>,
    input: {
      id: string
      title: string
      details: string[]
      actionPaths: string[]
      review?: string | null
      after: Record<string, unknown>
    },
  ): IAssessmentFinding {
    const limits: string[] = []
    if (!simulationRan(ctx.simulation)) limits.push('not confirmed by simulation')
    limits.push('delegation behaviour of the token not read')
    return {
      id: input.id,
      checkId: MINT_BURN_CHECK_ID,
      kind: input.review ? IAssessmentFindingKind.NeedsReview : IAssessmentFindingKind.Change,
      labels: [],
      notify: true,
      title: input.title,
      details: input.details,
      actionPaths: input.actionPaths,
      evidenceLimit: limits.join('; '),
      after: input.after,
    }
  },

  _governanceEffect(token: string, kind: 'mint' | 'burn', ctx: Readonly<IAssessmentContext>): string[] {
    const governanceToken = (ctx.captured.storedSettings as { tokenAddress?: string } | null)?.tokenAddress
    if (!governanceToken || governanceToken !== token) return []
    return kind === 'mint'
      ? ['this is the governance token: the supply grows and the new tokens carry no votes until delegated']
      : ["this is the governance token: the supply shrinks and every remaining holder's share grows"]
  },

  _kindOf(movement: ISimulatedMovement): 'mint' | 'burn' | null {
    const type = movement.type.toLowerCase()
    return type === 'mint' ? 'mint' : type === 'burn' ? 'burn' : null
  },

  _confirmed(
    kind: 'mint' | 'burn',
    token: string,
    account: string,
    amount: string,
    ctx: Readonly<IAssessmentContext>,
    used: Set<number>,
  ): boolean | null {
    if (ctx.simulation.status !== 'ok' || account === 'unresolved') return null
    const index = ctx.simulation.movements.findIndex((m, i) =>
      !used.has(i) && MintBurnCheck._kindOf(m) === kind && m.asset === token && kind === 'mint'
        ? m.to
        : m.from === account && m.amount === amount,
    )
    if (index === -1) return false
    used.add(index)
    return true
  },
}

export default MintBurnCheck
