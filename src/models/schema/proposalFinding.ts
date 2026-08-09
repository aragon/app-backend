import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IFraudAttackClass,
  type IFraudPermissionOp,
  type IFraudRiskLevel,
  type IFraudSignal,
  type IFraudTransfer,
  NetworksEnum,
} from '@types'
import { Model } from 'mongoose'
import { Schema } from 'mongoose'

const customName = ICollectionNames.ProposalFinding

/**
 * One document per proposal the fraud detector matched. `id` is the proposal's id, so
 * redeliveries and re-index runs land on the same document instead of alerting twice.
 */
@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: customName,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({ network: 1, daoAddress: 1 })
@index({ creationLevel: 1, createdAt: -1 })
export default class ProposalFinding extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public daoName!: string | null

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public proposalIndex!: string

  @prop({ type: () => Number, default: null })
  public incrementalId!: number | null

  @prop({ type: () => String, default: null })
  public title!: string | null

  @prop({ type: () => String, default: null })
  public metadataUri!: string | null

  @prop({ type: () => String, required: true })
  public creatorAddress!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockTimestamp!: number

  @prop({ type: () => Number, default: null })
  public endDate!: number | null

  @prop({ type: () => [String], default: [] })
  public attackClass!: IFraudAttackClass[]

  @prop({ type: () => Schema.Types.Mixed, _id: false, default: [] })
  public permissionOps!: IFraudPermissionOp[]

  @prop({ type: () => Schema.Types.Mixed, _id: false, default: [] })
  public transfers!: IFraudTransfer[]

  @prop({ type: () => Schema.Types.Mixed, _id: false, default: [] })
  public mints!: IFraudTransfer[]

  @prop({ type: () => String, default: null })
  public nativeValue!: string | null

  @prop({ type: () => Schema.Types.Mixed, _id: false, default: [] })
  public signals!: IFraudSignal[]

  @prop({ type: () => Number, required: true })
  public score!: number

  @prop({ type: () => Number, required: true })
  public creationScore!: number

  @prop({ type: () => String, required: true })
  public level!: IFraudRiskLevel

  @prop({ type: () => String, required: true })
  public creationLevel!: IFraudRiskLevel

  @prop({ type: () => Number, default: 0 })
  public priorProposals!: number

  @prop({ type: () => Number, default: 0 })
  public priorVotes!: number

  @prop({ type: () => Number, default: null })
  public minParticipation!: number | null

  @prop({ type: () => Number, default: null })
  public minDuration!: number | null

  @prop({ type: () => String, default: null })
  public suppressedAs!: string | null

  /** Stamped once the alert is sent — the idempotency guard for notifications */
  @prop({ type: () => Date, default: null })
  public alertedAt!: Date | null

  /** The level the team was last told about; a re-score only escalates above this */
  @prop({ type: () => String, default: null })
  public alertedLevel!: IFraudRiskLevel | null

  /** Which kind of message went out: the full alert, or the quiet "scanned" line */
  @prop({ type: () => String, default: null })
  public alertedAs!: 'alert' | 'scanned' | null

  /** Failed delivery attempts, so a permanent outage stops re-queueing forever */
  @prop({ type: () => Number, default: 0 })
  public alertAttempts!: number

  /** Whether the creator is a contract rather than an EOA — triage context, not a score */
  @prop({ type: () => Boolean, default: null })
  public creatorIsContract!: boolean | null

  /** Tenderly confirmation result, filled by the simulation step */
  @prop({ type: () => Schema.Types.Mixed, _id: false, default: null })
  public simulation!: { status: string; shareUrl?: string | null; runAt?: number } | null

  static async createLog(data: Partial<ProposalFinding>) {
    return this.findOneAndUpdate({ id: data.id }, { $setOnInsert: data }, { upsert: true, new: true })
  }
}
