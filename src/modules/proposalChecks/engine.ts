import { IMPLEMENTED_CHECKS } from '@modules/proposalChecks/checks/index'
import CheckRegistry, { REQUIRED_CHECK_IDS } from '@modules/proposalChecks/registry'
import {
  type IAssessmentCheck,
  IAssessmentCheckStatus,
  type IAssessmentContext,
  type IAssessmentEngineResult,
  type IAssessmentFinding,
  IAssessmentRequestStatus,
} from '@types'

const NOT_IMPLEMENTED = 'check not implemented yet'

/**
 * Runs every required check over one context. A check that throws fails alone; the rest still
 * produce their findings. A required check with no implementation is a coverage gap, not proof
 * that the rule does not apply: it is reported as needing review, which keeps the whole
 * assessment incomplete until it exists.
 */
const AssessmentEngine = {
  async run(
    ctx: IAssessmentContext,
    implemented: readonly IAssessmentCheck[] = IMPLEMENTED_CHECKS,
  ): Promise<IAssessmentEngineResult> {
    const findings: IAssessmentFinding[] = []
    const checks: Record<string, IAssessmentCheckStatus> = {}
    const reasons: Record<string, string> = {}
    const byId = CheckRegistry.index(implemented)

    for (const id of REQUIRED_CHECK_IDS) {
      const check = byId.get(id)
      if (!check) {
        checks[id] = IAssessmentCheckStatus.NeedsReview
        reasons[id] = NOT_IMPLEMENTED
        continue
      }

      const result = await AssessmentEngine._runOne(check, ctx)
      checks[id] = result.status
      if (result.reason) reasons[id] = result.reason
      for (const finding of result.findings) {
        findings.push({ ...finding, checkId: id })
      }
    }

    return {
      status: AssessmentEngine._overallStatus(checks),
      findings,
      checks,
      reasons,
      coverage: CheckRegistry.coverage(byId),
    }
  },

  async _runOne(check: IAssessmentCheck, ctx: IAssessmentContext) {
    try {
      const result = await check.run(ctx)
      if (result.status !== IAssessmentCheckStatus.Ok && !result.reason) {
        return { ...result, reason: `check ${check.id} returned ${result.status} without a reason` }
      }
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return { status: IAssessmentCheckStatus.Failed, findings: [], reason: message.slice(0, 500) }
    }
  },

  /** A failed check blocks the summary; a needs-review one only marks it incomplete. */
  _overallStatus(checks: Record<string, IAssessmentCheckStatus>): IAssessmentEngineResult['status'] {
    const statuses = Object.values(checks)
    if (statuses.includes(IAssessmentCheckStatus.Failed)) return IAssessmentRequestStatus.Failed
    if (statuses.includes(IAssessmentCheckStatus.NeedsReview)) return IAssessmentRequestStatus.Incomplete
    return IAssessmentRequestStatus.Complete
  },
}

export default AssessmentEngine
