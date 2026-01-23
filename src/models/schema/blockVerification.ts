import { index, modelOptions, prop } from '@typegoose/typegoose'
import { ICollectionNames, NetworksEnum, BlockStatus } from '@types'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.BlockVerification

@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: customName,
  },
})
@index({ network: 1, blockNumber: -1 }, { unique: true })
@index({ network: 1, status: 1 })
@index({ createdAt: 1 }, { expireAfterSeconds: 604800 })
export default class BlockVerification extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, required: true })
  public blockHash!: string

  @prop({ type: () => String, required: true })
  public parentHash!: string

  @prop({ type: () => String, enum: BlockStatus, default: BlockStatus.verified })
  public status!: BlockStatus

  static getEntityId(network: NetworksEnum, blockNumber: number) {
    return `${network}-${blockNumber}`
  }

  static async create(rawData: Partial<BlockVerification>, tOpts?: SaveOptions) {
    rawData.id = this.getEntityId(rawData.network!, rawData.blockNumber!)
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static async upsert(rawData: Partial<BlockVerification>, tOpts?: SaveOptions) {
    const id = this.getEntityId(rawData.network!, rawData.blockNumber!)
    return this.findOneAndUpdate({ id }, { $set: { ...rawData, id } }, { upsert: true, new: true, ...tOpts })
  }

  static async findByBlock(network: NetworksEnum, blockNumber: number, tOpts?: SaveOptions) {
    return this.findOne({ network, blockNumber }, null, tOpts)
  }

  static async findReorgedBlocks(network: NetworksEnum, tOpts?: SaveOptions) {
    return this.find({ network, status: BlockStatus.reorged }, null, tOpts)
  }

  async markReorged(tOpts?: SaveOptions) {
    this.status = BlockStatus.reorged
    return await this.save(tOpts)
  }
}
