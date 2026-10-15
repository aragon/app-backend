import UpgradeFacts from '@modules/proposalChecks/upgrades'
import { nameOf } from '@modules/proposalChecks/naming'
import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
  type IAssessmentFlatAction,
} from '@types'

export const UPGRADE_CHECK_ID = 'control/upgrade'

/**
 * Rule "DAO or plugin code is replaced". Every upgrade is reported as a change, with the code
 * hashes before and after. It stays for a person when the new code could not be read or is not
 * verified, since nothing here reads what unverified code does. Whether the actions after the
 * upgrade still run is what the simulation shows; the sequence rule reports their failures.
 */
const UpgradeCheck = {
  id: UPGRADE_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }
    const findings = ctx.actions.flatMap(action => {
      const call = UpgradeFacts.callOf(action)
      return call ? [UpgradeCheck._grade(action, call.proxy, ctx)] : []
    })
    return { status: IAssessmentCheckStatus.Ok, findings }
  },

  _grade(action: IAssessmentFlatAction, proxy: string, ctx: Readonly<IAssessmentContext>): IAssessmentFinding {
    const facts = ctx.upgrades[action.path] ?? null
    const subject = nameOf(proxy, ctx)
    const proposed = facts?.proposedImplementation ?? UpgradeFacts.callOf(action)!.implementation
    const limits = ['storage layout of the new implementation not compared with the current one']
    if (facts && !facts.blockPinned)
      limits.push('current implementation read at the current block, not the evidence block')
    if (ctx.simulation.status !== 'ok') limits.push('the sequence after the upgrade was not simulated')

    const finding = (kind: IAssessmentFindingKind, title: string, details: string[]): IAssessmentFinding => ({
      id: `${UPGRADE_CHECK_ID}:${action.path}`,
      checkId: UPGRADE_CHECK_ID,
      kind,
      labels: [],
      notify: true,
      title,
      details,
      actionPaths: [action.path],
      evidenceLimit: limits.join('; '),
      after: facts ?? { proxy, proposedImplementation: proposed },
    })

    if (!facts) {
      return finding(IAssessmentFindingKind.NeedsReview, `Upgrades ${subject} to ${proposed}`, [
        'the current and the new implementation code could not be read',
      ])
    }
    if (!facts.proposedCodeHash) {
      return finding(IAssessmentFindingKind.NeedsReview, `Upgrades ${subject} to ${proposed}`, [
        'the new implementation has no code at the evidence block',
      ])
    }
    const details = [
      `current implementation ${facts.currentImplementation ?? 'not read'}${facts.currentCodeHash ? ` (code ${facts.currentCodeHash.slice(0, 10)})` : ''}`,
      `new implementation ${proposed} (code ${facts.proposedCodeHash.slice(0, 10)})`,
    ]
    if (facts.currentCodeHash && facts.currentCodeHash === facts.proposedCodeHash) {
      details.push('the new implementation has the same code as the current one')
    }
    const later = ctx.actions
      .filter(a => a.target === proxy && UpgradeCheck._after(a.path, action.path))
      .map(a => a.path)
    if (later.length) details.push(`later actions on the same contract run against the new code: ${later.join(', ')}`)

    if (!facts.proposedVerified) {
      return finding(IAssessmentFindingKind.NeedsReview, `Upgrades ${subject} to unverified code at ${proposed}`, [
        ...details,
        'the new implementation has no verified source, so what it does is not read',
      ])
    }
    const name = facts.proposedContractName ? `${facts.proposedContractName} at ${proposed}` : proposed
    return finding(IAssessmentFindingKind.Change, `Upgrades ${subject} to ${name}`, details)
  },

  /** Whether a path comes after another in execution order, comparing index by index. */
  _after(path: string, reference: string): boolean {
    const a = path.split('/').map(Number)
    const b = reference.split('/').map(Number)
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      if (a[i] !== b[i]) return a[i] > b[i]
    }
    return false
  },
}

export default UpgradeCheck
