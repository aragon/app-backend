import { Models } from '@dbModels'
import * as Errors from '@errors'
import type ProposalAssessment from '@models/schema/proposalAssessment'
import { ErrorKeyEnum, IAssessmentRequestStatus, type IPaginationParams } from '@types'

const RESULT_STATUSES = [IAssessmentRequestStatus.Complete, IAssessmentRequestStatus.Incomplete]

/**
 * Read model for the dashboard. Shows the proposal's current assessment if one has been promoted,
 * and the state of the newest request when it has not finished yet, so a reader can tell "no
 * result" from "still working on it" or "last attempt failed". Delivery preferences play no
 * part here.
 */
class ProposalAssessmentController {
  static async getLatest(proposalId: string) {
    const proposal = await Models.Proposal.findByEntityId(proposalId)
    Errors.assertExposable(!!proposal, ErrorKeyEnum.notFound, 404)

    const state = proposal.assessment
    const [completed, newest] = await Promise.all([
      state?.latestCompletedAssessmentId
        ? Models.ProposalAssessment.findOne({ id: state.latestCompletedAssessmentId })
        : null,
      state?.requestedGeneration
        ? Models.ProposalAssessment.findOne({ proposalId, generation: state.requestedGeneration })
        : null,
    ])

    return {
      proposalId,
      currentRevisionId: state?.currentRevisionId ?? null,
      assessment: completed ? ProposalAssessmentController._result(completed, state?.currentRevisionId ?? null) : null,
      request:
        newest && !RESULT_STATUSES.includes(newest.status) ? ProposalAssessmentController._request(newest) : null,
    }
  }

  /** Every request for the proposal, newest first; finished ones carry their result, the rest their state. */
  static async getHistory(proposalId: string, paginationParams: IPaginationParams) {
    const proposal = await Models.Proposal.findByEntityId(proposalId)
    Errors.assertExposable(!!proposal, ErrorKeyEnum.notFound, 404)

    const currentRevisionId = proposal.assessment?.currentRevisionId ?? null
    const page = await Models.ProposalAssessment.findHistory(proposalId, paginationParams)
    return {
      ...page,
      data: page.data.map(doc =>
        RESULT_STATUSES.includes(doc.status)
          ? {
              ...ProposalAssessmentController._result(doc, currentRevisionId),
              causeId: doc.causeId,
              promoted: !!doc.promotedAt,
            }
          : { ...ProposalAssessmentController._request(doc), causeId: doc.causeId, promoted: false },
      ),
    }
  }

  static _result(doc: ProposalAssessment, currentRevisionId: string | null) {
    return {
      id: doc.id,
      generation: doc.generation,
      revisionId: doc.revisionId,
      /** A result for an earlier revision is still shown, but flagged, until the newer one lands. */
      stale: doc.revisionId !== currentRevisionId,
      status: doc.status,
      rulesVersion: doc.rulesVersion,
      evidenceBlock: doc.captured.evidenceBlock,
      completedAt: doc.completedAt,
      findings: doc.findings,
      checks: doc.checks,
      reasons: doc.reasons,
      coverage: doc.coverage,
      evidence: doc.evidence,
    }
  }

  /** Only what a reader needs to know about an unfinished request; error text stays in the logs. */
  static _request(doc: ProposalAssessment) {
    return {
      id: doc.id,
      generation: doc.generation,
      revisionId: doc.revisionId,
      status: doc.status,
      attempts: doc.attempts,
      publishedAt: doc.publishedAt,
      updatedAt: (doc as any).updatedAt ?? null,
    }
  }
}

export default ProposalAssessmentController
