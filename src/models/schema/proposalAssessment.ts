import { assert } from '@errors'
import ModelUtils from '@models/utils/models'
import Revisions from '@modules/proposalChecks/revisions'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  type HexAddress,
  type IAssessmentCaptured,
  type IAssessmentCheckOutcome,
  type IAssessmentEngineResult,
  type IAssessmentEvidence,
  type IAssessmentFinding,
  type IAssessmentRequestInput,
  IAssessmentRequestStatus,
  ICollectionNames,
  type IPaginatedResult,
  type IPaginationParams,
  type IQueueProposalCheck,
  NetworksEnum,
  PROPOSAL_CHECKS_RULES_VERSION,
} from '@types'
import { type ClientSession, Model, Schema } from 'mongoose'
import { v4 as uuidv4 } from 'uuid'

const customName = ICollectionNames.ProposalAssessment

/** Diagnostic text only; a full stack or payload dump belongs in the logs, not the document. */
const ASSESSMENT_ERROR_MAX_LENGTH = 500

/**
 * One document per assessment request. `id` is the request id (proposal + revision + cause +
 * rules version), so a redelivered event lands on the same document instead of assessing twice.
 * The document starts as a durable request and later holds the result; history is never deleted.
 */
@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: customName,
  },
  options: {
    customName,
  },
})
@index({ proposalId: 1, generation: -1 })
@index({ status: 1, publishedAt: 1, nextAttemptAt: 1 })
export default class ProposalAssessment extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public proposalId!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public revisionId!: string

  @prop({ type: () => String, required: true })
  public causeId!: string

  /** Per-proposal request sequence; a worker may only promote a result whose generation is still the latest. */
  @prop({ type: () => Number, required: true })
  public generation!: number

  @prop({ type: () => Number, required: true })
  public rulesVersion!: number

  @prop({ type: () => String, enum: IAssessmentRequestStatus, default: IAssessmentRequestStatus.Pending })
  public status!: IAssessmentRequestStatus

  /** How many times a worker took this request; retries and their limit are the queue's business. */
  @prop({ type: () => Number, default: 0 })
  public attempts!: number

  /** Which attempt owns the request and until when; a stale attempt's writes are refused. */
  @prop({ type: () => String, default: null })
  public leaseToken!: string | null

  @prop({ type: () => Date, default: null })
  public leaseUntil!: Date | null

  /** Publisher backoff after a refused publish; not consulted by the consumer. */
  @prop({ type: () => Date, default: () => new Date() })
  public nextAttemptAt!: Date

  @prop({ type: () => Date, default: null })
  public publishedAt!: Date | null

  @prop({ type: () => String, default: null })
  public lastError!: string | null

  @prop({ type: () => Schema.Types.Mixed, required: true })
  public captured!: IAssessmentCaptured

  @prop({ type: () => Schema.Types.Mixed, default: [] })
  public findings!: IAssessmentFinding[]

  /** How each rule ended, by rule id: its status and, when it is not ok, the reason. */
  @prop({ type: () => Schema.Types.Mixed, default: {} })
  public checks!: Record<string, IAssessmentCheckOutcome>

  @prop({ type: () => Schema.Types.Mixed, default: null })
  public coverage!: { implemented: string[]; missing: string[] } | null

  /** What the findings were judged against: the simulation and the execution test, ids and links included. */
  @prop({ type: () => Schema.Types.Mixed, default: null })
  public evidence!: IAssessmentEvidence | null

  @prop({ type: () => Date, default: null })
  public completedAt!: Date | null

  /** Set when this result became the proposal's current assessment; a stale generation never gets it. */
  @prop({ type: () => Date, default: null })
  public promotedAt!: Date | null

  /** Every request ever made for a proposal, newest generation first, as an immutable history. */
  static async findHistory(
    proposalId: string,
    paginationParams: IPaginationParams = {},
  ): Promise<IPaginatedResult<ProposalAssessment>> {
    const { skip, limit } = ModelUtils.paginateAndSort(paginationParams)
    const filter = { proposalId }
    const [data, totalRecords] = await Promise.all([
      this.find(filter, null, { sort: { generation: -1 }, skip, limit }),
      this.countDocuments(filter),
    ])
    return {
      data: data as ProposalAssessment[],
      metadata: {
        page: skip / limit + 1,
        pageSize: limit,
        totalRecords,
        totalPages: Math.max(1, Math.ceil(totalRecords / limit)),
      },
    }
  }

  /** Pending requests the publisher has not yet handed to the queue and whose retry time has come, oldest first. */
  /** Pending requests, and failed ones handed back for republishing, that the broker has not confirmed yet. */
  static async findUnpublished(limit: number, maxAttempts: number): Promise<ProposalAssessment[]> {
    return (await this.find(
      {
        status: { $in: [IAssessmentRequestStatus.Pending, IAssessmentRequestStatus.Failed] },
        publishedAt: null,
        nextAttemptAt: { $lte: new Date() },
        attempts: { $lt: maxAttempts },
      },
      null,
      { sort: { createdAt: 1, _id: 1 }, limit },
    )) as ProposalAssessment[]
  }

  /**
   * A request still running after its lease ran out belongs to a worker that died. The queue has
   * acknowledged its delivery by then, so it is failed and handed back to the publisher, which
   * republishes it only while attempts remain. One that has used them all stays failed for good.
   */
  static async releaseExpired(): Promise<number> {
    const result = await this.updateMany(
      { status: IAssessmentRequestStatus.Running, leaseUntil: { $lt: new Date() } },
      {
        $set: {
          status: IAssessmentRequestStatus.Failed,
          publishedAt: null,
          lastError: 'lease expired without a result',
          leaseToken: null,
          leaseUntil: null,
        },
      },
    )
    return result.modifiedCount
  }

  toQueuePayload(): IQueueProposalCheck {
    return { id: this.id, params: { requestId: this.id } }
  }

  /** Stamped only after the broker confirmed; a crash before this republishes the same id, which is safe. */
  async markPublished(): Promise<void> {
    await this.model(customName).updateOne({ id: this.id, publishedAt: null }, { $set: { publishedAt: new Date() } })
  }

  /** Records the failure and pushes the next publish attempt out, so a dead broker is not hammered every tick. */
  async markPublishFailed(error: unknown, retryDelayMs: number): Promise<void> {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, ASSESSMENT_ERROR_MAX_LENGTH)
    await this.model(customName).updateOne(
      { id: this.id },
      { $set: { lastError: message, nextAttemptAt: new Date(Date.now() + retryDelayMs) } },
    )
  }

  /**
   * Take a request for one attempt under a lease. A pending or failed request is taken, and a
   * running one only once its lease expired, since the same request can reach two workers when a
   * publish was repeated. A request that has used up its attempts is not taken at all, so a
   * delivery still sitting in the queue cannot run past the limit. Later writes carry the token.
   */
  static async claim(requestId: string, leaseMs: number, maxAttempts: number): Promise<ProposalAssessment | null> {
    const now = new Date()
    return (await this.findOneAndUpdate(
      {
        id: requestId,
        attempts: { $lt: maxAttempts },
        $or: [
          { status: { $in: [IAssessmentRequestStatus.Pending, IAssessmentRequestStatus.Failed] } },
          { status: IAssessmentRequestStatus.Running, leaseUntil: { $lt: now } },
        ],
      },
      {
        $set: {
          status: IAssessmentRequestStatus.Running,
          leaseToken: uuidv4(),
          leaseUntil: new Date(now.getTime() + leaseMs),
        },
        $inc: { attempts: 1 },
      },
      { returnDocument: 'after' },
    )) as ProposalAssessment | null
  }

  /** The attempt did not produce a result; the queue will retry it. A stale attempt cannot fail its replacement. */
  async markFailed(error: unknown): Promise<void> {
    const message = (error instanceof Error ? error.message : String(error)).slice(0, ASSESSMENT_ERROR_MAX_LENGTH)
    await this.model(customName).updateOne(
      { id: this.id, status: IAssessmentRequestStatus.Running, leaseToken: this.leaseToken },
      { $set: { status: IAssessmentRequestStatus.Failed, lastError: message, leaseToken: null, leaseUntil: null } },
    )
  }

  /** Records the canonical hash of the evidence block, so every later attempt judges the same block. */
  async pinEvidenceBlockHash(hash: string): Promise<boolean> {
    const written = await this.model(customName).updateOne(
      {
        id: this.id,
        status: IAssessmentRequestStatus.Running,
        leaseToken: this.leaseToken,
        'captured.evidenceBlock.hash': null,
      },
      { $set: { 'captured.evidenceBlock.hash': hash } },
    )
    return written.modifiedCount === 1
  }

  /** Stores the engine's result, unless the lease moved to another attempt in the meantime. */
  async storeResult(
    result: IAssessmentEngineResult,
    evidence: IAssessmentEvidence,
    session: ClientSession,
  ): Promise<boolean> {
    const written = await this.model(customName).updateOne(
      { id: this.id, status: IAssessmentRequestStatus.Running, leaseToken: this.leaseToken },
      {
        $set: {
          status: result.status,
          findings: result.findings,
          checks: result.checks,
          coverage: result.coverage,
          evidence,
          completedAt: new Date(),
          lastError: null,
          leaseToken: null,
          leaseUntil: null,
        },
      },
      { session },
    )
    return written.modifiedCount === 1
  }

  /**
   * Makes this result the proposal's current assessment, but only while its generation is still
   * the latest requested one and its revision is still current. An older request that finishes
   * late stays readable history and never becomes the summary.
   */
  async promote(session: ClientSession): Promise<boolean> {
    const moved = await this.db.model(ICollectionNames.Proposal).updateOne(
      {
        id: this.proposalId,
        'assessment.requestedGeneration': this.generation,
        'assessment.currentRevisionId': this.revisionId,
      },
      { $set: { 'assessment.latestCompletedAssessmentId': this.id } },
      { session },
    )
    if (moved.modifiedCount !== 1) return false
    await this.model(customName).updateOne({ id: this.id }, { $set: { promotedAt: new Date() } }, { session })
    return true
  }

  /**
   * Insert a pending request for a revision and bump the proposal's requested generation, inside
   * the caller's open transaction so neither can exist without the other. A request that already
   * exists is returned untouched and nothing is bumped, so a redelivered event is a no-op. Events
   * are ingested in chain order, so the newest request always becomes the current revision.
   */
  static async requestForRevision(
    input: IAssessmentRequestInput,
    session: ClientSession,
  ): Promise<{ created: boolean; request: ProposalAssessment }> {
    assert(!!session?.inTransaction?.(), 'Assessment request needs an open transaction')
    assert(!!input.proposal?.id, 'Assessment request needs a proposal id')
    assert(!!input.causeId, 'Assessment request needs a cause id')

    const tOpts = { session }
    const rulesVersion = PROPOSAL_CHECKS_RULES_VERSION
    const ids = Revisions.revisionOf(input, rulesVersion)

    const existing = (await this.findOne({ id: ids.requestId }, null, tOpts)) as ProposalAssessment | null
    if (existing) return { created: false, request: existing }

    const proposal = await this.db
      .model(ICollectionNames.Proposal)
      .findOneAndUpdate(
        { id: input.proposal.id },
        { $inc: { 'assessment.requestedGeneration': 1 }, $set: { 'assessment.currentRevisionId': ids.revisionId } },
        { returnDocument: 'after', projection: { assessment: 1 }, ...tOpts },
      )
    assert(!!proposal, `Assessment request for unknown proposal ${input.proposal.id}`)

    const captured: IAssessmentCaptured = {
      rawActions: (input.proposal.rawActions ?? []).map(a => ({
        to: String(a.to ?? ''),
        value: String(a.value ?? '0'),
        data: String(a.data ?? '0x'),
      })),
      allowFailureMap: String(input.proposal.allowFailureMap ?? '0'),
      metadataUri: input.proposal.metadataUri ?? null,
      storedSettings: input.proposal.settings ?? null,
      evidenceBlock: input.evidenceBlock,
    }

    const [request] = await this.create(
      [
        {
          id: ids.requestId,
          proposalId: input.proposal.id,
          network: input.proposal.network,
          daoAddress: input.proposal.daoAddress,
          pluginAddress: input.proposal.pluginAddress,
          revisionId: ids.revisionId,
          causeId: input.causeId,
          generation: proposal.assessment.requestedGeneration,
          rulesVersion,
          captured,
        },
      ],
      tOpts,
    )

    return { created: true, request: request as ProposalAssessment }
  }
}
