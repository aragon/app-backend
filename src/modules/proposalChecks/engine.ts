import { CHECK_MANIFEST } from '@modules/proposalChecks/checks/index'
import {
  type IAssessmentCheck,
  type IAssessmentCheckOutcome,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentEngineResult,
  type IAssessmentFinding,
  type IAssessmentManifest,
  IAssessmentRequestStatus,
} from '@types'

const NOT_IMPLEMENTED = 'check not implemented yet'

/**
 * Runs every rule of the manifest over one context. A check that throws fails alone; the rest
 * still produce their findings. A rule with no implementation is a coverage gap, not proof that
 * it does not apply: it is reported as needing review, which keeps the whole assessment
 * incomplete until the check exists.
 */
const AssessmentEngine = {
  async run(ctx: IAssessmentContext, manifest: IAssessmentManifest = CHECK_MANIFEST): Promise<IAssessmentEngineResult> {
    const findings: IAssessmentFinding[] = []
    const checks: Record<string, IAssessmentCheckOutcome> = {}

    for (const [id, check] of manifest) {
      if (!check) {
        checks[id] = { status: IAssessmentCheckStatus.NeedsReview, reason: NOT_IMPLEMENTED }
        continue
      }

      const result = await AssessmentEngine._runOne(id, check, ctx)
      checks[id] = { status: result.status, ...(result.reason ? { reason: result.reason } : {}) }
      for (const finding of result.findings) {
        findings.push({ ...finding, checkId: id })
      }
    }

    return {
      status: AssessmentEngine._overallStatus(checks),
      findings,
      checks,
      coverage: {
        implemented: manifest.filter(([, check]) => !!check).map(([id]) => id),
        missing: manifest.filter(([, check]) => !check).map(([id]) => id),
      },
    }
  },

  async _runOne(id: string, check: IAssessmentCheck, ctx: IAssessmentContext) {
    try {
      const result = await check.run(ctx)
      if (result.status !== IAssessmentCheckStatus.Ok && !result.reason) {
        return { ...result, reason: `check ${id} returned ${result.status} without a reason` }
      }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { status: IAssessmentCheckStatus.Failed, findings: [], reason: message.slice(0, 500) }
    }
  },

  /** A failed check blocks the summary; a needs-review one only marks it incomplete. */
  _overallStatus(checks: Record<string, IAssessmentCheckOutcome>): IAssessmentEngineResult['status'] {
    const statuses = Object.values(checks).map(outcome => outcome.status)
    if (statuses.includes(IAssessmentCheckStatus.Failed)) return IAssessmentRequestStatus.Failed
    if (statuses.includes(IAssessmentCheckStatus.NeedsReview)) return IAssessmentRequestStatus.Incomplete
    return IAssessmentRequestStatus.Complete
  },
}

export default AssessmentEngine
