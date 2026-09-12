import MembershipFacts, { type IMembershipCall } from '@modules/proposalChecks/members'
import { recipientReview } from '@modules/proposalChecks/recipients'
import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
  type IAssessmentFlatAction,
  IAssessmentSeverity,
  type IMembershipFacts,
} from '@types'

export const MEMBERS_CHECK_ID = 'voting/members'

interface IState {
  count: number | null
  threshold: number | null
  members: Set<string>
  unknown: Set<string>
}

/**
 * Rule "Multisig members or thresholds change". Additions and removals are applied in order
 * over the membership at the evidence block, and the required approvals are compared with the
 * resulting count: a threshold nobody can reach or a single signer who can act alone is a risk.
 * The OSx multisig checks every step against its current state, so a removal that leaves fewer
 * members than approvals reverts unless the threshold moves first; that is said where it
 * happens. A member removed today can still approve the proposals already open, which are
 * listed. Every member change is a change to notify; a new member is resolved like a recipient.
 */
const MembersCheck = {
  id: MEMBERS_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }
    const findings: IAssessmentFinding[] = []
    const states = new Map<string, IState>()
    for (const action of ctx.actions) {
      const call = MembershipFacts.callOf(action)
      if (!call) continue
      const key = action.target.toLowerCase()
      const facts = ctx.memberships[key] ?? null
      if (!states.has(key)) states.set(key, MembersCheck._initial(facts))
      const state = states.get(key)!
      const problem = MembersCheck._apply(state, call, facts)
      if (!call.settingsOnly) findings.push(MembersCheck._finding(action, call, facts, problem, ctx))
    }
    for (const [key, state] of states) {
      const finding = MembersCheck._outcome(key, state, ctx)
      if (finding) findings.push(finding)
    }
    return { status: IAssessmentCheckStatus.Ok, findings }
  },

  _initial(facts: IMembershipFacts | null): IState {
    const members = new Set<string>()
    for (const [address, listed] of Object.entries(facts?.listed ?? {})) if (listed) members.add(address)
    return { count: facts?.count ?? null, threshold: facts?.threshold ?? null, members, unknown: new Set() }
  },

  /** Folds one call into the state; returns what the plugin would refuse, if anything. */
  _apply(state: IState, call: IMembershipCall, facts: IMembershipFacts | null): string | null {
    const known = (address: string) => facts !== null && address.toLowerCase() in facts.listed
    let problem: string | null = null
    if (call.kind === 'add') {
      for (const member of call.members) {
        const key = member.toLowerCase()
        if (!known(key)) state.unknown.add(key)
        if (state.members.has(key)) continue
        state.members.add(key)
        if (state.count !== null) state.count += 1
      }
    } else if (call.kind === 'remove') {
      for (const member of call.members) {
        const key = member.toLowerCase()
        if (!known(key)) state.unknown.add(key)
        if (!state.members.has(key)) continue
        state.members.delete(key)
        if (state.count !== null) state.count -= 1
      }
      if (!call.safe && state.count !== null && state.threshold !== null && state.count < state.threshold) {
        problem = `this removal leaves ${state.count} members for ${state.threshold} required approvals; the plugin refuses it unless the threshold is lowered first`
      }
    } else if (call.kind === 'swap') {
      const out = call.members[0].toLowerCase()
      const inn = (call.newMember ?? '').toLowerCase()
      if (!known(out)) state.unknown.add(out)
      state.members.delete(out)
      state.members.add(inn)
    }
    if (call.threshold !== null) {
      state.threshold = Number(call.threshold)
      if (call.safe && state.count !== null && state.threshold > state.count) {
        problem = `sets ${state.threshold} required signatures for ${state.count} owners; the Safe refuses it`
      }
    }
    return problem
  },

  _finding(
    action: IAssessmentFlatAction,
    call: IMembershipCall,
    facts: IMembershipFacts | null,
    problem: string | null,
    ctx: Readonly<IAssessmentContext>,
  ): IAssessmentFinding {
    const subject = MembersCheck._subject(action.target, facts, ctx)
    const details: string[] = []
    let title: string
    let review: string | null = null
    const incoming = call.kind === 'swap' ? [call.newMember!] : call.kind === 'add' ? call.members : []
    for (const member of incoming) {
      const recipient = ctx.recipients[member.toLowerCase()] ?? null
      const tag = recipientReview(recipient, `new member ${member}`)
      if (tag) {
        details.push(tag)
        review = review ?? tag
      }
    }
    switch (call.kind) {
      case 'add':
        title = `Adds ${call.members.join(', ')} to ${subject}`
        for (const m of call.members) if (facts?.listed[m.toLowerCase()]) details.push(`${m} is already a member`)
        break
      case 'remove':
        title = `Removes ${call.members.join(', ')} from ${subject}`
        for (const m of call.members)
          if (facts && facts.listed[m.toLowerCase()] === false) details.push(`${m} is not a member`)
        if (facts?.openProposals.length) {
          details.push(
            `a removed member can still approve the proposals already open: ${facts.openProposals.slice(0, 5).join(', ')}${facts.openProposals.length > 5 ? ' and more' : ''}`,
          )
        }
        break
      case 'swap':
        title = `Replaces ${call.members[0]} with ${call.newMember} on ${subject}`
        break
      default:
        title = `Sets the required signatures of ${subject} to ${call.threshold}`
    }
    if (call.threshold !== null && call.kind !== 'threshold')
      details.push(`required signatures set to ${call.threshold}`)
    if (problem) details.push(problem)

    const limits: string[] = []
    if (!facts) limits.push('membership at the evidence block not read')
    if (facts && !call.safe && facts.threshold === null) limits.push('required approvals not indexed')

    return {
      id: `${MEMBERS_CHECK_ID}:${call.kind}:${action.path}`,
      checkId: MEMBERS_CHECK_ID,
      kind: review ? IAssessmentFindingKind.NeedsReview : IAssessmentFindingKind.Change,
      labels: [],
      notify: true,
      title,
      details,
      actionPaths: [action.path],
      ...(limits.length ? { evidenceLimit: limits.join('; ') } : {}),
      after: { ...call, target: action.target },
    }
  },

  /** The membership after every change: a threshold nobody can reach, or one signer who can act alone. */
  _outcome(key: string, state: IState, ctx: Readonly<IAssessmentContext>): IAssessmentFinding | null {
    const facts = ctx.memberships[key] ?? null
    if (state.count === null || state.threshold === null) return null
    const subject = MembersCheck._subject(key, facts, ctx)
    const paths = ctx.actions.filter(a => a.target.toLowerCase() === key && MembershipFacts.callOf(a)).map(a => a.path)
    const build = (title: string, detail: string): IAssessmentFinding => ({
      id: `${MEMBERS_CHECK_ID}:outcome:${key}`,
      checkId: MEMBERS_CHECK_ID,
      kind: IAssessmentFindingKind.Risk,
      severity: IAssessmentSeverity.High,
      labels: [],
      notify: true,
      title,
      details: [
        detail,
        ...(state.unknown.size
          ? [
              `membership of ${[...state.unknown].join(', ')} at the block was not read, so the count may be off by that many`,
            ]
          : []),
      ],
      actionPaths: paths,
      after: { members: state.count, threshold: state.threshold },
    })
    if (state.count === 0 || state.threshold > state.count) {
      return build(
        `Leaves ${subject} unable to approve anything`,
        `${state.threshold} approvals required of ${state.count} members after these changes: no proposal can pass`,
      )
    }
    if (state.threshold === 1) {
      return build(
        `Leaves ${subject} with a single signer able to act`,
        `1 approval required of ${state.count} members after these changes: any one member decides alone`,
      )
    }
    return null
  },

  _subject(target: string, facts: IMembershipFacts | null, ctx: Readonly<IAssessmentContext>): string {
    const plugin = ctx.plugins.find(p => p.address.toLowerCase() === target.toLowerCase())
    if (plugin) return `the ${plugin.interfaceType} plugin ${plugin.address}`
    return facts?.kind === 'safe' ? `Safe ${target}` : `${target}`
  },
}

export default MembersCheck
