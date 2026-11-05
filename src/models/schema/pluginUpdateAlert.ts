import { modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  ICollectionNames,
  type IFraudRiskLevel,
  type IPluginUpdate,
  type IPluginUpdateAlertStatus,
  NetworksEnum,
} from '@types'
import { Model } from 'mongoose'

const customName = ICollectionNames.PluginUpdateAlert

/**
 * One document per applied plugin update outside testnets, saved by the indexer before it moves
 * on. `id` is network, plugin, release and build, so replays and backfills of the same update land
 * on the same document and never alert twice.
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
export default class PluginUpdateAlert extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public interfaceType!: string

  @prop({ type: () => Number, required: true })
  public release!: number

  @prop({ type: () => Number, default: null })
  public fromBuild!: number | null

  @prop({ type: () => Number, required: true })
  public toBuild!: number

  @prop({ type: () => String, required: true })
  public transactionHash!: string

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, default: 'pending' })
  public status!: IPluginUpdateAlertStatus

  @prop({ type: () => Number, default: null })
  public initializedVersion!: number | null

  @prop({ type: () => String, default: null })
  public level!: IFraudRiskLevel | null

  /** Set while a delivery is sending. An old claim on a pending alert is from a delivery that died. */
  @prop({ type: () => Date, default: null })
  public claimedAt!: Date | null

  /** Set only after Telegram accepted the message. */
  @prop({ type: () => Date, default: null })
  public sentAt!: Date | null

  static getEntityId(update: Pick<IPluginUpdate, 'network' | 'pluginAddress' | 'release' | 'toBuild'>) {
    return `${update.network}-${update.pluginAddress}-${update.release}-${update.toBuild}`
  }

  static async createLog(data: Partial<PluginUpdateAlert>) {
    return this.findOneAndUpdate({ id: data.id }, { $setOnInsert: data }, { upsert: true, returnDocument: 'after' })
  }

  /** Pending alerts saved before `createdBefore` whose claim is free or older than `claimedBefore`. */
  static async findReadyToDeliver(createdBefore: Date, claimedBefore: Date, limit: number) {
    return this.find({
      status: 'pending',
      createdAt: { $lt: createdBefore },
      $or: [{ claimedAt: null }, { claimedAt: { $lt: claimedBefore } }],
    })
      .sort({ createdAt: 1 })
      .limit(limit)
  }
}
