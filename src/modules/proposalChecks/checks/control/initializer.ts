import UpgradeFacts from '@modules/proposalChecks/upgrades'
import { nameOf } from '@modules/proposalChecks/naming'
import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
  type IAssessmentFlatAction,
  IAssessmentSeverity,
} from '@types'

export const INITIALIZER_CHECK_ID = 'control/initializer'

const UPGRADE_WRAPPERS = new Set(['upgradeToAndCall', 'upgradeAndCall'])

/**
 * Rule "Initialization can change existing control". Every contract a proposal calls already
 * exists, so an initializer call on it either reopens a step that rewrites owners, permissions
 * or governance settings, or reuses a completed one and reverts. The simulation says whether the
 * call goes through; what it rewrites is only known for the DAO's own initializer, whose
 * initial owner receives ROOT. Everything else is for a person, with the outcome named. A call
 * an upgrade carries is in the action tree under the upgrade, so its own rules assess it too.
 */
const InitializerCheck = {
  id: INITIALIZER_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }
    const findings: IAssessmentFinding[] = []
    for (const action of ctx.actions) {
      if (action.operation === 'delegatecall') continue
      const afterUpgrade = action.via !== null && UPGRADE_WRAPPERS.has(action.via)
      if (afterUpgrade && !action.decoded) {
        findings.push(InitializerCheck._unread(action, ctx))
      } else if (action.decoded && InitializerCheck._isInitializer(action.decoded.name)) {
        findings.push(InitializerCheck._grade(action, afterUpgrade, ctx))
      }
    }
    return { status: IAssessmentCheckStatus.Ok, findings }
  },

  _isInitializer(name: string): boolean {
    return name === 'initialize' || name === 'initializeFrom' || name.startsWith('reinitialize')
  },

  _grade(action: IAssessmentFlatAction, afterUpgrade: boolean, ctx: Readonly<IAssessmentContext>): IAssessmentFinding {
    const { name, args } = action.decoded!
    const subject = nameOf(action.target, ctx)
    const how = afterUpgrade ? `${name} right after the upgrade` : name
    const written = Object.entries(args).map(([k, v]) => `${k} = ${v}`)
    const details = written.length ? [`writes ${written.join(', ')}`] : []
    const daoInit = name === 'initialize' && action.target === ctx.request.daoAddress && !!args.initialOwner
    if (daoInit) details.push(`${args.initialOwner} would receive ROOT on the DAO`)
    const outcome = InitializerCheck._outcome(action.path, ctx)

    if (outcome === null) {
      return InitializerCheck._finding(action, afterUpgrade, ctx, {
        kind: IAssessmentFindingKind.NeedsReview,
        title: `Initializes ${subject} again through ${how}`,
        details: [...details, 'whether the initialization step is still open could not be tested'],
      })
    }
    if (outcome === 'failed') {
      return InitializerCheck._finding(action, afterUpgrade, ctx, {
        kind: IAssessmentFindingKind.NeedsReview,
        title: `Initializes ${subject} again through ${how}, which reverts`,
        details: [
          ...details,
          'the call reverts in the simulation; whether the step was already completed is not established',
        ],
      })
    }
    if (daoInit) {
      return InitializerCheck._finding(action, afterUpgrade, ctx, {
        kind: IAssessmentFindingKind.Risk,
        severity: IAssessmentSeverity.High,
        title: `Initializes ${subject} again through ${how}`,
        details: [...details, 'the call goes through in the simulation, so the step it uses was still open'],
      })
    }
    return InitializerCheck._finding(action, afterUpgrade, ctx, {
      kind: IAssessmentFindingKind.NeedsReview,
      title: `Initializes ${subject} again through ${how}`,
      details: [...details, 'the call goes through in the simulation; what it rewrites is not read'],
    })
  },

  /** A post-upgrade call nothing here can decode is for a person: it runs on the new code with the proxy's storage. */
  _unread(action: IAssessmentFlatAction, ctx: Readonly<IAssessmentContext>): IAssessmentFinding {
    return InitializerCheck._finding(action, true, ctx, {
      kind: IAssessmentFindingKind.NeedsReview,
      title: `Runs a call on ${nameOf(action.target, ctx)} right after its upgrade that could not be read`,
      details: ['the call runs on the new implementation, whose functions are not known here'],
    })
  },

  /**
   * Whether the action went through in the simulation: read from the failure map of the DAO's own
   * execute for a top-level action. A call an upgrade carries fails with its upgrade, so it reads
   * the upgrade's bit. An action inside any other wrapper has no per-action outcome, and no
   * simulation means no outcome at all.
   */
  _outcome(path: string, ctx: Readonly<IAssessmentContext>): 'ok' | 'failed' | null {
    const [top, ...rest] = path.split('/')
    const action = ctx.actions.find(a => a.path === path)
    const carried =
      rest.length === 1 && action?.via !== null && action !== undefined && UPGRADE_WRAPPERS.has(action.via!)
    if (ctx.simulation.status !== 'ok' || (rest.length > 0 && !carried)) return null
    const dao = ctx.request.daoAddress
    const execution = ctx.simulation.executions.find(e => e.dao === dao)
    if (!execution) return null
    const failed = (BigInt(execution.failureMap || '0') >> BigInt(Number(top))) & 1n
    return failed ? 'failed' : 'ok'
  },

  _finding(
    action: IAssessmentFlatAction,
    afterUpgrade: boolean,
    ctx: Readonly<IAssessmentContext>,
    graded: { kind: IAssessmentFindingKind; severity?: IAssessmentSeverity; title: string; details: string[] },
  ): IAssessmentFinding {
    const limits = [
      'initialization state read through the simulation outcome only; the storage the call writes is not compared',
    ]
    if (ctx.simulation.status !== 'ok') limits.push('the call was not simulated')
    return {
      id: `${INITIALIZER_CHECK_ID}:${action.path}`,
      checkId: INITIALIZER_CHECK_ID,
      kind: graded.kind,
      ...(graded.severity ? { severity: graded.severity } : {}),
      labels: [],
      notify: true,
      title: graded.title,
      details: graded.details,
      actionPaths: [action.path],
      evidenceLimit: limits.join('; '),
      after: {
        target: action.target,
        function: action.decoded?.name ?? null,
        args: action.decoded?.args ?? {},
        afterUpgrade,
      },
    }
  },
}

export default InitializerCheck
