import PermissionState, {
  ANY_ADDR,
  type IPermissionOp,
  POWERFUL_PERMISSIONS,
} from '@modules/proposalChecks/permissions'
import PluginSetupFacts from '@modules/proposalChecks/pluginSetups'
import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  type IAssessmentFlatAction,
  IAssessmentFindingKind,
  type IAssessmentFindingLabel,
  IAssessmentSeverity,
  type IPermissionGrant,
} from '@types'

export const PERMISSIONS_CHECK_ID = 'control/permissions'

/** Grants the DAO itself refuses to give to everyone: execute would revert on them. */
const REFUSED_FOR_ANYONE = new Set(
  [
    'ROOT_PERMISSION',
    'EXECUTE_PERMISSION',
    'UPGRADE_DAO_PERMISSION',
    'SET_METADATA_PERMISSION',
    'SET_TRUSTED_FORWARDER_PERMISSION',
    'REGISTER_STANDARD_CALLBACK_PERMISSION',
  ].map(PermissionState.idOf),
)

const ROOT = PermissionState.idOf('ROOT_PERMISSION')
const EXECUTE = PermissionState.idOf('EXECUTE_PERMISSION')
const EXECUTE_PROPOSAL = PermissionState.idOf('EXECUTE_PROPOSAL_PERMISSION')
const EDIT = PermissionState.idOf('EDIT_PERMISSION')
const CANCEL = PermissionState.idOf('CANCEL_PERMISSION')
const VALIDATE_SIGNATURE = PermissionState.idOf('VALIDATE_SIGNATURE_PERMISSION')

interface IGraded {
  kind: IAssessmentFindingKind
  severity?: IAssessmentSeverity
  /** `protectionReduced` when a cancel or edit right on a staged processor goes away. */
  labels?: IAssessmentFindingLabel[]
  notify: boolean
  title: string
  details: string[]
}

/**
 * Rule "Permissions granted or revoked". The proposal's grants and revokes are applied in order
 * to the DAO's permission table as it was at the evidence block, so each one is graded against
 * what is true when it runs: a grant already covered by a conditioned one is a no-op, a revoke
 * that takes the last ROOT holder away freezes the table for good, a ROOT grant that the same
 * batch revokes again is the ordinary install pattern. Who receives a power matters: the DAO
 * and its own plugins are the system, anyone else is an outsider.
 */
const PermissionsCheck = {
  id: PERMISSIONS_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }

    const dao = ctx.request.daoAddress.toLowerCase()
    const ops: IPermissionOp[] = []
    const findings: IAssessmentFinding[] = []
    for (const action of ctx.actions) {
      if (action.operation === 'delegatecall' || !PermissionState.isPermissionCall(action)) continue
      if (action.target.toLowerCase() !== dao) {
        findings.push(
          PermissionsCheck._finding(action.path, ctx, {
            kind: IAssessmentFindingKind.Change,
            notify: true,
            title: `Changes permissions on ${action.target}, a contract other than the DAO`,
            details: [
              `action ${action.path}: permission calls on another contract are not folded into the DAO's table`,
            ],
          }),
        )
        continue
      }
      ops.push(...PermissionState.opsOf(action))
    }
    if (ops.length === 0) return { status: IAssessmentCheckStatus.Ok, findings }

    const table: Record<string, IPermissionGrant> = { ...ctx.permissions.grants }
    ops.forEach((op, index) => {
      const graded =
        op.op === 'grant'
          ? PermissionsCheck._grant(op, index, ops, table, ctx)
          : PermissionsCheck._revoke(op, table, ctx)
      findings.push(PermissionsCheck._finding(op.path, ctx, graded, op))
    })
    return { status: IAssessmentCheckStatus.Ok, findings }
  },

  _grant(
    op: IPermissionOp,
    index: number,
    ops: IPermissionOp[],
    table: Record<string, IPermissionGrant>,
    ctx: Readonly<IAssessmentContext>,
  ): IGraded {
    const key = PermissionState.key(op.where, op.who, op.permissionId)
    const name = PermissionState.nameOf(op.permissionId)
    const existing = table[key]
    if (existing?.condition && !op.condition) {
      return {
        kind: IAssessmentFindingKind.Change,
        notify: false,
        title: `Grants ${name} to ${op.who} on ${op.where}, which changes nothing`,
        details: [`already granted behind condition ${existing.condition}; a plain grant does not lift it`],
      }
    }
    table[key] = { where: op.where, who: op.who, permissionId: op.permissionId, condition: op.condition }

    const revokedLater = ops
      .slice(index + 1)
      .some(later => later.op === 'revoke' && PermissionState.key(later.where, later.who, later.permissionId) === key)
    const who = op.who.toLowerCase()
    const isDao = who === ctx.request.daoAddress.toLowerCase()
    const plugin = ctx.plugins.find(p => p.address.toLowerCase() === who)
    const system = isDao || !!plugin
    const target = ctx.plugins.find(p => p.address.toLowerCase() === op.where.toLowerCase())
    const conditioned = op.condition ? ` behind condition ${op.condition}` : ''
    const base = `Grants ${name} to ${op.who} on ${op.where}${conditioned}`

    if (op.permissionId.toLowerCase() === ROOT) {
      if (revokedLater) {
        const window = PermissionsCheck._rootWindow(op, ops, index, ctx)
        if (window.reached.length) {
          return {
            kind: IAssessmentFindingKind.Risk,
            severity: IAssessmentSeverity.High,
            notify: true,
            title: `${base} while it is called`,
            details: [
              `ROOT is revoked again within the batch, but the holder is called at ${window.reached.join(', ')} while it has ROOT and can grant itself anything then`,
            ],
          }
        }
        if (window.setup) {
          return {
            kind: IAssessmentFindingKind.Change,
            notify: true,
            title: `${base} for the duration of this proposal`,
            details: [
              'ROOT is granted, a plugin setup applied through the holder, and ROOT revoked again: the install pattern',
            ],
          }
        }
        return {
          kind: IAssessmentFindingKind.Change,
          notify: true,
          title: `${base} for the duration of this proposal`,
          details: ['ROOT is granted and revoked again within the batch, and no action in between reaches the holder'],
        }
      }
      const details = ['a ROOT holder can grant itself anything, including execution over the treasury']
      if (
        ops.some(
          o =>
            o.op === 'revoke' &&
            o.permissionId.toLowerCase() === ROOT &&
            o.who.toLowerCase() === ctx.request.daoAddress.toLowerCase(),
        )
      ) {
        details.push(`the DAO also gives up its own ROOT: it becomes subordinate to ${op.who}`)
      }
      return {
        kind: IAssessmentFindingKind.Risk,
        severity: IAssessmentSeverity.Critical,
        notify: true,
        title: `${base}, permanently`,
        details,
      }
    }

    if (who === ANY_ADDR) {
      if (REFUSED_FOR_ANYONE.has(op.permissionId.toLowerCase())) {
        return {
          kind: IAssessmentFindingKind.Change,
          notify: true,
          title: `${base}, which the DAO refuses`,
          details: ['the DAO does not allow this permission to be granted to everyone; execute reverts on it'],
        }
      }
      if (op.permissionId.toLowerCase() === VALIDATE_SIGNATURE) {
        return {
          kind: IAssessmentFindingKind.Change,
          notify: false,
          title: base,
          details: ['whoever the grant trusts can make the DAO sign; graded and notified by the components rule'],
        }
      }
      if (POWERFUL_PERMISSIONS.has(op.permissionId.toLowerCase())) {
        return {
          kind: IAssessmentFindingKind.Risk,
          severity: IAssessmentSeverity.High,
          notify: true,
          title: `${base}, that is to everyone`,
          details: ['anyone at all can now use this power'],
        }
      }
      return { kind: IAssessmentFindingKind.Change, notify: true, title: `${base}, that is to everyone`, details: [] }
    }

    if (op.permissionId.toLowerCase() === EXECUTE_PROPOSAL && target?.interfaceType === 'admin') {
      return {
        kind: IAssessmentFindingKind.Risk,
        severity: IAssessmentSeverity.Critical,
        notify: true,
        title: `${base}: a new admin`,
        details: ['an admin executes any action through the plugin with no vote, as much as a ROOT holder'],
      }
    }
    if (
      target?.interfaceType === 'spp' &&
      (op.permissionId.toLowerCase() === EDIT || op.permissionId.toLowerCase() === CANCEL)
    ) {
      const stages = ctx.sppStages[op.where.toLowerCase()]
      if (!stages) {
        return {
          kind: IAssessmentFindingKind.NeedsReview,
          notify: true,
          title: base,
          details: [
            'the stage settings of the processor at the evidence block are not available, so whether the permission is live is not known',
          ],
        }
      }
      if (op.permissionId.toLowerCase() === EDIT) {
        return stages.editable
          ? {
              kind: IAssessmentFindingKind.Risk,
              severity: IAssessmentSeverity.Critical,
              notify: true,
              title: `${base}: may rewrite approved proposals`,
              details: ['a stage is editable, so the holder can replace the actions after the bodies approved them'],
            }
          : {
              kind: IAssessmentFindingKind.Change,
              notify: true,
              title: `${base}, dormant`,
              details: ['no stage is editable, so the permission does nothing until one is'],
            }
      }
      return stages.cancelable
        ? {
            kind: IAssessmentFindingKind.Risk,
            severity: IAssessmentSeverity.High,
            notify: true,
            title: `${base}: may cancel proposals`,
            details: ['a stage is cancelable, so the holder can stop approved proposals from executing'],
          }
        : {
            kind: IAssessmentFindingKind.Change,
            notify: true,
            title: `${base}, dormant`,
            details: ['no stage is cancelable, so the permission does nothing until one is'],
          }
    }

    if (POWERFUL_PERMISSIONS.has(op.permissionId.toLowerCase()) || op.permissionId.toLowerCase() === EXECUTE) {
      if (system) {
        return {
          kind: IAssessmentFindingKind.Change,
          notify: true,
          title: base,
          details: [isDao ? 'granted to the DAO itself' : `granted to the DAO's own ${plugin!.interfaceType} plugin`],
        }
      }
      const details = [`${op.who} is not the DAO or one of its plugins`]
      if (revokedLater) details.push('granted and revoked within the same proposal: whatever runs in between uses it')
      return {
        kind: IAssessmentFindingKind.Risk,
        severity: IAssessmentSeverity.High,
        notify: true,
        title: `${base}, an outsider`,
        details,
      }
    }

    return { kind: IAssessmentFindingKind.Change, notify: true, title: base, details: [] }
  },

  _revoke(op: IPermissionOp, table: Record<string, IPermissionGrant>, ctx: Readonly<IAssessmentContext>): IGraded {
    const key = PermissionState.key(op.where, op.who, op.permissionId)
    const name = PermissionState.nameOf(op.permissionId)
    const base = `Revokes ${name} from ${op.who} on ${op.where}`
    if (!table[key]) {
      if (!ctx.permissions.available) {
        return {
          kind: IAssessmentFindingKind.NeedsReview,
          notify: true,
          title: base,
          details: [
            'the permission table at the evidence block is not available, so what this revoke removes is not known',
          ],
        }
      }
      return {
        kind: IAssessmentFindingKind.Change,
        notify: false,
        title: `${base}, which changes nothing`,
        details: ['nothing to revoke: the permission is not granted'],
      }
    }
    delete table[key]

    const dao = ctx.request.daoAddress.toLowerCase()
    if (op.permissionId.toLowerCase() === ROOT && op.where.toLowerCase() === dao) {
      const rootLeft = Object.values(table).some(
        g => g.permissionId.toLowerCase() === ROOT && g.where.toLowerCase() === dao,
      )
      if (!rootLeft) {
        return {
          kind: IAssessmentFindingKind.Risk,
          severity: IAssessmentSeverity.Critical,
          notify: true,
          title: `${base}: the last ROOT holder`,
          details: [
            'no ROOT holder remains: no plugin can ever be installed, updated or removed again, and nothing can grant ROOT back',
          ],
        }
      }
      return { kind: IAssessmentFindingKind.Change, notify: true, title: base, details: ['other ROOT holders remain'] }
    }
    if (
      op.permissionId.toLowerCase() === EXECUTE &&
      op.where.toLowerCase() === dao &&
      ctx.plugins.some(p => p.address.toLowerCase() === op.who.toLowerCase())
    ) {
      return {
        kind: IAssessmentFindingKind.Risk,
        severity: IAssessmentSeverity.High,
        notify: true,
        title: `${base}: a governance plugin loses execution`,
        details: ['proposals passed on that plugin can no longer execute; recovery needs a separate grant'],
      }
    }
    const sppTarget = ctx.plugins.find(
      p => p.address.toLowerCase() === op.where.toLowerCase() && p.interfaceType === 'spp',
    )
    if (sppTarget && (op.permissionId.toLowerCase() === CANCEL || op.permissionId.toLowerCase() === EDIT)) {
      return {
        kind: IAssessmentFindingKind.Change,
        labels: ['protectionReduced'],
        notify: true,
        title: `${base}: one fewer who can ${op.permissionId.toLowerCase() === CANCEL ? 'cancel' : 'edit'}`,
        details: [
          'a cancel or edit right on the staged processor goes away; whether another holder remains is not read',
        ],
      }
    }
    return { kind: IAssessmentFindingKind.Change, notify: true, title: base, details: [] }
  },

  /**
   * What happens between a ROOT grant and its revoke: a plugin setup applied through the holder
   * is the install pattern; any other action that reaches the holder runs while it has ROOT.
   */
  _rootWindow(
    op: IPermissionOp,
    ops: IPermissionOp[],
    index: number,
    ctx: Readonly<IAssessmentContext>,
  ): { setup: boolean; reached: string[] } {
    const key = PermissionState.key(op.where, op.who, op.permissionId)
    const revoke = ops
      .slice(index + 1)
      .find(later => later.op === 'revoke' && PermissionState.key(later.where, later.who, later.permissionId) === key)!
    const between = (path: string) =>
      PermissionsCheck._after(path, op.path) && PermissionsCheck._after(revoke.path, path)
    const holder = op.who.toLowerCase()
    // A setup counts only when the index holds its preparation: that is what shows the holder is a real processor.
    const inside = ctx.actions.filter(a => a.target.toLowerCase() === holder && between(a.path))
    const isSetup = (a: IAssessmentFlatAction) =>
      PluginSetupFacts.callOf(a) !== null && !!ctx.pluginSetups[a.path]?.prepared
    return { setup: inside.some(isSetup), reached: inside.filter(a => !isSetup(a)).map(a => a.path) }
  },

  /** Whether a path comes after another in execution order; batch items share their action's position. */
  _after(path: string, reference: string): boolean {
    const a = path.split('#')[0].split('/').map(Number)
    const b = reference.split('#')[0].split('/').map(Number)
    for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] > b[i]
    return a.length > b.length
  },

  _finding(path: string, ctx: Readonly<IAssessmentContext>, graded: IGraded, op?: IPermissionOp): IAssessmentFinding {
    const limits: string[] = []
    if (!ctx.permissions.available) limits.push('permission table at the evidence block not available')
    return {
      id: `${PERMISSIONS_CHECK_ID}:${op ? op.op : 'external'}:${path}`,
      checkId: PERMISSIONS_CHECK_ID,
      kind: graded.kind,
      ...(graded.severity ? { severity: graded.severity } : {}),
      labels: graded.labels ?? [],
      notify: graded.notify,
      title: graded.title,
      details: graded.details,
      actionPaths: [path.split('#')[0]],
      evidenceLimit: limits.length ? limits.join('; ') : undefined,
      after: op ? { ...op, permission: PermissionState.nameOf(op.permissionId) } : undefined,
    }
  },
}

export default PermissionsCheck
