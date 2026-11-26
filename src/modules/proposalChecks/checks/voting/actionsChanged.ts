import Revisions from '@modules/proposalChecks/revisions'
import {
  type IAssessmentCheckResult,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentFinding,
  IAssessmentFindingKind,
  type IRawAction,
} from '@types'

export const ACTIONS_CHANGED_CHECK_ID = 'voting/actionsChanged'

/**
 * Rule "Proposal actions change after analysis". Only the staged processor can edit a proposal;
 * an edit is captured as a new revision and every rule runs again on it, while the earlier
 * result reads as stale from the moment the edit is requested. This rule says what the edit
 * changed against the revision last analysed: actions added, removed or rewritten, the failure
 * map, the metadata reference and the stored configuration. A first revision has nothing to
 * compare with.
 */
const ActionsChangedCheck = {
  id: ACTIONS_CHANGED_CHECK_ID,

  run(ctx: Readonly<IAssessmentContext>): IAssessmentCheckResult {
    const previous = ctx.previous
    if (!previous) return { status: IAssessmentCheckStatus.Ok, findings: [], reason: 'first revision of this proposal' }

    const before = previous.captured
    const after = ctx.captured
    const changes: string[] = []
    const count = Math.max(before.rawActions.length, after.rawActions.length)
    for (let i = 0; i < count; i++) {
      const was = before.rawActions[i]
      const now = after.rawActions[i]
      if (was && !now) changes.push(`action ${i} removed (${ActionsChangedCheck._describe(was)})`)
      else if (!was && now) changes.push(`action ${i} added (${ActionsChangedCheck._describe(now)})`)
      else if (was && now) {
        const fields = (['to', 'value', 'data'] as const).filter(
          f => String(was[f] ?? '').toLowerCase() !== String(now[f] ?? '').toLowerCase(),
        )
        if (fields.length)
          changes.push(`action ${i} ${fields.join(', ')} changed (now ${ActionsChangedCheck._describe(now)})`)
      }
    }
    if (before.allowFailureMap !== after.allowFailureMap)
      changes.push(`allowed failures from ${before.allowFailureMap} to ${after.allowFailureMap}`)
    if ((before.metadataUri ?? null) !== (after.metadataUri ?? null))
      changes.push(`metadata reference from ${before.metadataUri ?? 'none'} to ${after.metadataUri ?? 'none'}`)
    if (Revisions._canonical(before.storedSettings ?? null) !== Revisions._canonical(after.storedSettings ?? null))
      changes.push('the stored configuration changed')

    const actionsTouched =
      Revisions.actionsHash(before.rawActions, before.allowFailureMap) !==
      Revisions.actionsHash(after.rawActions, after.allowFailureMap)
    const finding: IAssessmentFinding = {
      id: `${ACTIONS_CHANGED_CHECK_ID}:${previous.generation}`,
      checkId: ACTIONS_CHANGED_CHECK_ID,
      kind: IAssessmentFindingKind.Change,
      labels: [],
      notify: changes.length > 0,
      title:
        changes.length === 0
          ? 'The proposal was edited with no change to what it asks for'
          : actionsTouched
            ? `The actions changed after the last analysis: ${changes.length} ${changes.length === 1 ? 'difference' : 'differences'}`
            : `The proposal was edited without touching its actions: ${changes.length} ${changes.length === 1 ? 'difference' : 'differences'}`,
      details: [
        ...changes,
        `the analysis of revision ${previous.revisionId.slice(0, 18)} (generation ${previous.generation}) is outdated; every rule ran again on this revision`,
      ],
      actionPaths: [],
      after: {
        previousGeneration: previous.generation,
        previousRevisionId: previous.revisionId,
        actionsTouched,
        changes,
      },
    }
    return { status: IAssessmentCheckStatus.Ok, findings: [finding] }
  },

  _describe(action: IRawAction): string {
    const data = String(action.data ?? '0x')
    return `${action.to}, ${action.value ?? '0'} wei, ${data.length > 12 ? `${data.slice(0, 10)}…` : data}`
  },
}

export default ActionsChangedCheck
