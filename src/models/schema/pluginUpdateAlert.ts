import { modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, type IFraudRiskLevel, NetworksEnum } from '@types'
import { Model } from 'mongoose'

const customName = ICollectionNames.PluginUpdateAlert

/**
 * One document per watched plugin update. `id` is network, plugin and build, so replays and
 * backfills of the same update land on the same document and never alert twice.
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

  @prop({ type: () => Number, default: null })
  public fromBuild!: number | null

  @prop({ type: () => Number, required: true })
  public toBuild!: number

  @prop({ type: () => String, required: true })
  public transactionHash!: string

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number, default: null })
  public initializedVersion!: number | null

  @prop({ type: () => String, default: null })
  public level!: IFraudRiskLevel | null

  @prop({ type: () => Date, default: null })
  public alertedAt!: Date | null

  @prop({ type: () => Number, default: 0 })
  public alertAttempts!: number

  static async createLog(data: Partial<PluginUpdateAlert>) {
    return this.findOneAndUpdate({ id: data.id }, { $setOnInsert: data }, { upsert: true, new: true })
  }
}
