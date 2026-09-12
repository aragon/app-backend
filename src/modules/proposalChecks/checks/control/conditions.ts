import PermissionState, { type IPermissionOp, POWERFUL_PERMISSIONS } from '@modules/proposalChecks/permissions'
import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
  type IAssessmentFlatAction,
  IAssessmentSeverity,
} from '@types'

export const CONDITIONS_CHECK_ID = 'control/conditions'

/**
 * Rule "Permission conditions change". A condition is what narrows a permission to a caller or
 * a calldata shape. It changes in two ways: the permission is revoked and granted again behind a
 * different condition, or a call goes to the condition contract itself. The first is read
 * exactly from the permission changes. The second is only reported: nothing here understands
 * a condition contract, so its effect is for a person to determine.
 */
const ConditionsCheck = {
  id: CONDITIONS_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    if (ctx.actions.length === 0) {
      return { status: IAssessmentCheckStatus.NotApplicable, findings: [], reason: 'proposal has no actions' }
    }
    const dao = ctx.request.daoAddress.toLowerCase()
    const ops = ctx.actions
      .filter(
        a => a.operation !== 'delegatecall' && a.target.toLowerCase() === dao && PermissionState.isPermissionCall(a),
      )
      .flatMap(a => PermissionState.opsOf(a))

    const findings = [...ConditionsCheck._replacements(ops, ctx), ...ConditionsCheck._conditionCalls(ops, ctx)]
    return { status: IAssessmentCheckStatus.Ok, findings }
  },

  /**
   * A revoke followed by a grant of the same permission with a different condition swaps the
   * condition. The table is folded in order, so a later swap compares against the earlier one.
   */
  _replacements(ops: IPermissionOp[], ctx: Readonly<IAssessmentContext>): IAssessmentFinding[] {
    const findings: IAssessmentFinding[] = []
    const conditions: Record<string, string | null> = {}
    for (const [key, grant] of Object.entries(ctx.permissions.grants)) conditions[key] = grant.condition
    const revoked = new Set<string>()
    ops.forEach(op => {
      const key = PermissionState.key(op.where, op.who, op.permissionId)
      if (op.op === 'revoke') {
        revoked.add(key)
        return
      }
      const wasRevokedHere = revoked.delete(key)
      const before = key in conditions ? conditions[key] : null
      conditions[key] = op.condition
      if (!wasRevokedHere) return
      const after = op.condition
      if (before === after) return
      const name = PermissionState.nameOf(op.permissionId)
      const powerful = POWERFUL_PERMISSIONS.has(op.permissionId.toLowerCase())
      const subject = `${name} of ${op.who} on ${op.where}`

      if (before && !after) {
        findings.push(
          ConditionsCheck._finding(op.path, ctx, {
            kind: powerful ? IAssessmentFindingKind.Risk : IAssessmentFindingKind.Change,
            severity: powerful ? IAssessmentSeverity.High : undefined,
            title: `Removes the condition on ${subject}`,
            details: [
              `was limited by ${before}; the permission becomes unconditional`,
              ...(powerful ? ['a safeguard on a powerful permission is removed without replacement'] : []),
            ],
            after: { ...op, permission: name, conditionBefore: before },
          }),
        )
      } else if (!before && after) {
        findings.push(
          ConditionsCheck._finding(op.path, ctx, {
            kind: IAssessmentFindingKind.Change,
            title: `Puts ${subject} behind condition ${after}`,
            details: ['the permission was unconditional; what the condition allows is not read'],
            after: { ...op, permission: name, conditionBefore: null },
          }),
        )
      } else {
        findings.push(
          ConditionsCheck._finding(op.path, ctx, {
            kind: IAssessmentFindingKind.NeedsReview,
            title: `Replaces the condition on ${subject}`,
            details: [
              `${before} is replaced by ${after}; whether the new condition allows more or less is not determined`,
            ],
            after: { ...op, permission: name, conditionBefore: before },
          }),
        )
      }
    })
    return findings
  },

  /** A call to a contract the table uses as a condition, or that the proposal introduces as one. */
  _conditionCalls(ops: IPermissionOp[], ctx: Readonly<IAssessmentContext>): IAssessmentFinding[] {
    const guards = new Map<string, string[]>()
    const guard = (condition: string, permissionId: string) => {
      const key = condition.toLowerCase()
      guards.set(key, [...(guards.get(key) ?? []), permissionId.toLowerCase()])
    }
    for (const grant of Object.values(ctx.permissions.grants))
      if (grant.condition) guard(grant.condition, grant.permissionId)
    for (const op of ops) if (op.op === 'grant' && op.condition) guard(op.condition, op.permissionId)

    const findings: IAssessmentFinding[] = []
    for (const action of ctx.actions) {
      if (action.operation === 'delegatecall') continue
      const guarded = guards.get(action.target.toLowerCase())
      if (guarded) findings.push(ConditionsCheck._conditionCall(action, guarded, ctx))
    }
    return findings
  },

  /** No adapter understands a condition contract yet, so any call to one is for a person to read, whatever it is named. */
  _conditionCall(
    action: IAssessmentFlatAction,
    guarded: string[],
    ctx: Readonly<IAssessmentContext>,
  ): IAssessmentFinding {
    const names = guarded.map(PermissionState.nameOf).join(', ')
    const fn = action.decoded?.name ?? null
    return ConditionsCheck._finding(action.path, ctx, {
      kind: IAssessmentFindingKind.NeedsReview,
      title: `Calls condition ${action.target}, which guards ${names}${fn ? `, through ${fn}` : ', with a call that could not be read'}`,
      details: ['what the call does to what the condition allows is not determined'],
      after: { condition: action.target, guards: guarded, function: fn },
    })
  },

  _finding(
    path: string,
    ctx: Readonly<IAssessmentContext>,
    input: {
      kind: IAssessmentFindingKind
      severity?: IAssessmentSeverity
      title: string
      details: string[]
      after: Record<string, unknown>
    },
  ): IAssessmentFinding {
    const limits: string[] = []
    if (!ctx.permissions.available) limits.push('permission table at the evidence block not available')
    limits.push('condition contracts are not interpreted')
    return {
      id: `${CONDITIONS_CHECK_ID}:${path}`,
      checkId: CONDITIONS_CHECK_ID,
      kind: input.kind,
      ...(input.severity ? { severity: input.severity } : {}),
      labels: [],
      notify: true,
      title: input.title,
      details: input.details,
      actionPaths: [path.split('#')[0]],
      evidenceLimit: limits.join('; '),
      after: input.after,
    }
  },
}

export default ConditionsCheck
