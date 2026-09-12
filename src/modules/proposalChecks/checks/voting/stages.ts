import StagesFacts from '@modules/proposalChecks/stages'
import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
  type IAssessmentFlatAction,
  IAssessmentSeverity,
  type IStageConfig,
} from '@types'

export const STAGES_CHECK_ID = 'voting/stages'

interface IStageDelta {
  line: string
  /** A veto or cancel safeguard is weakened. */
  protection: boolean
  /** A safeguard or approval step is removed outright. */
  removed: boolean
}

/**
 * Rule "Staged voting requirements change". The proposed stages are compared one by one with
 * the stages the processor ran with at the evidence block: bodies, approval and veto
 * thresholds, windows, and the cancel and edit flags. A stage keeps the veto safeguard when it
 * has a veto threshold; weakening that (fewer veto bodies, a higher threshold, a shorter window,
 * cancel switched off) carries the protection label, and removing a stage or its veto outright
 * is High. Stages are stored into each proposal at creation, so the update reaches only later
 * proposals, and an editable proposal that is edited afterwards.
 */
const StagesCheck = {
  id: STAGES_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }
    const findings: IAssessmentFinding[] = []
    for (const action of ctx.actions) {
      const proposed = StagesFacts.callOf(action)
      if (proposed) findings.push(StagesCheck._finding(action, proposed, ctx))
    }
    return { status: IAssessmentCheckStatus.Ok, findings }
  },

  _finding(
    action: IAssessmentFlatAction,
    proposed: IStageConfig[],
    ctx: Readonly<IAssessmentContext>,
  ): IAssessmentFinding {
    const before = ctx.stages[action.path]?.before ?? null
    const plugin = ctx.plugins.find(p => p.address.toLowerCase() === action.target.toLowerCase())
    const subject = plugin ? `the ${plugin.interfaceType} plugin ${action.target}` : `processor ${action.target}`
    const deltas = before ? StagesCheck._compare(before, proposed) : []
    const protection = deltas.some(d => d.protection)
    const removed = deltas.some(d => d.removed)

    const details = before
      ? deltas.map(d => d.line)
      : proposed.map((s, i) => `stage ${i + 1}: ${StagesCheck._describe(s)}`)
    details.push('stages are stored into each proposal at creation, so this reaches only proposals created afterwards')
    if (proposed.some(s => s.editable) || before?.some(s => s.editable)) {
      details.push('an editable proposal that is edited afterwards adopts the new stages')
    }
    const limits: string[] = []
    if (!before) limits.push('the stages at the evidence block are not indexed, so what changes is not known')
    if (!plugin) limits.push('the target is not a plugin installed on this DAO at the evidence block')
    limits.push('execution target changes are read by the components rule')

    const title = !before
      ? `Sets ${proposed.length} stages on ${subject}`
      : deltas.length === 0
        ? `Rewrites the stages of ${subject} with the values they already have`
        : `${removed ? 'Removes a safeguard from' : protection ? 'Weakens a safeguard on' : 'Changes'} the stages of ${subject}: ${deltas.map(d => d.line).join('; ')}`

    return {
      id: `${STAGES_CHECK_ID}:${action.path}`,
      checkId: STAGES_CHECK_ID,
      kind: removed ? IAssessmentFindingKind.Risk : IAssessmentFindingKind.Change,
      ...(removed ? { severity: IAssessmentSeverity.High } : {}),
      labels: protection || removed ? ['protectionReduced'] : [],
      notify: !before || deltas.length > 0,
      title,
      details,
      actionPaths: [action.path],
      evidenceLimit: limits.join('; '),
      after: { before, proposed },
    }
  },

  _compare(before: IStageConfig[], proposed: IStageConfig[]): IStageDelta[] {
    const deltas: IStageDelta[] = []
    const count = Math.max(before.length, proposed.length)
    for (let i = 0; i < count; i++) {
      const was = before[i]
      const now = proposed[i]
      const n = i + 1
      if (was && !now) {
        deltas.push({
          line: `stage ${n} removed (${StagesCheck._describe(was)})`,
          protection: StagesCheck._hasVeto(was),
          removed: was.bodies.length > 0,
        })
        continue
      }
      if (!was && now) {
        deltas.push({ line: `stage ${n} added (${StagesCheck._describe(now)})`, protection: false, removed: false })
        continue
      }
      const veto = StagesCheck._hasVeto(was)
      const gone = was.bodies.filter(b => !now.bodies.some(x => x.toLowerCase() === b.toLowerCase()))
      const added = now.bodies.filter(b => !was.bodies.some(x => x.toLowerCase() === b.toLowerCase()))
      if (gone.length) {
        deltas.push({
          line: `stage ${n} loses ${gone.length === 1 ? 'body' : 'bodies'} ${gone.join(', ')}`,
          protection: veto,
          removed: now.bodies.length === 0,
        })
      }
      if (added.length)
        deltas.push({
          line: `stage ${n} gains ${added.length === 1 ? 'body' : 'bodies'} ${added.join(', ')}`,
          protection: false,
          removed: false,
        })
      if (was.approvalThreshold !== now.approvalThreshold) {
        deltas.push({
          line: `stage ${n} approvals from ${was.approvalThreshold} to ${now.approvalThreshold}`,
          protection: false,
          removed: false,
        })
      }
      if (was.vetoThreshold !== now.vetoThreshold) {
        const off = now.vetoThreshold === '0'
        deltas.push({
          line: `stage ${n} vetoes needed from ${was.vetoThreshold} to ${now.vetoThreshold}${off ? ' (veto switched off)' : ''}`,
          protection: BigInt(now.vetoThreshold) > BigInt(was.vetoThreshold) || off,
          removed: off && veto,
        })
      }
      for (const field of ['voteDuration', 'maxAdvance', 'minAdvance'] as const) {
        if (was[field] === now[field]) continue
        const shorter = BigInt(now[field]) < BigInt(was[field])
        deltas.push({
          line: `stage ${n} ${StagesCheck._window(field)} from ${was[field]} to ${now[field]} seconds`,
          protection: veto && shorter && field !== 'minAdvance',
          removed: false,
        })
      }
      if (was.cancelable !== now.cancelable) {
        deltas.push({
          line: `stage ${n} ${now.cancelable ? 'becomes' : 'is no longer'} cancelable`,
          protection: !now.cancelable,
          removed: false,
        })
      }
      if (was.editable !== now.editable) {
        deltas.push({
          line: `stage ${n} ${now.editable ? 'becomes' : 'is no longer'} editable`,
          protection: false,
          removed: false,
        })
      }
    }
    return deltas
  },

  _hasVeto(stage: IStageConfig): boolean {
    return stage.vetoThreshold !== '0' && stage.bodies.length > 0
  },

  _window(field: 'voteDuration' | 'maxAdvance' | 'minAdvance'): string {
    return field === 'voteDuration' ? 'voting window' : field === 'maxAdvance' ? 'latest advance' : 'earliest advance'
  },

  _describe(stage: IStageConfig): string {
    const flags = [stage.cancelable ? 'cancelable' : null, stage.editable ? 'editable' : null].filter(Boolean)
    return `${stage.bodies.length} ${stage.bodies.length === 1 ? 'body' : 'bodies'}, ${stage.approvalThreshold} approvals, ${stage.vetoThreshold} vetoes, ${stage.voteDuration}s window${flags.length ? `, ${flags.join(', ')}` : ''}`
  },
}

export default StagesCheck
