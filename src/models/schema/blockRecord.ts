import config from '@config'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import { ICollectionNames, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.BlockRecord

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
@index({ network: 1, blockNumber: -1 }, { unique: true })
@index({ network: 1, blockHash: 1 })
@index({ createdAt: 1 }, { expireAfterSeconds: config.SERVICES.ARAGON_REORGS.BLOCK_RECORD_TTL })
export default class BlockRecord extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, required: true })
  public blockHash!: string

  static getEntityId(network: NetworksEnum, blockNumber: number): string {
    return `${network}-${blockNumber}`
  }

  static async create(rawData: Partial<BlockRecord>, tOpts?: SaveOptions) {
    if (!rawData.id && rawData.network && rawData.blockNumber !== undefined) {
      rawData.id = this.getEntityId(rawData.network, rawData.blockNumber)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static async upsert(network: NetworksEnum, blockNumber: number, blockHash: string, tOpts?: SaveOptions) {
    const id = this.getEntityId(network, blockNumber)
    return await this.findOneAndUpdate(
      { id },
      { id, network, blockNumber, blockHash },
      { upsert: true, new: true, ...tOpts },
    )
  }

  static async bulkUpsert(records: Array<{ network: NetworksEnum; blockNumber: number; blockHash: string }>) {
    if (records.length === 0) return
    const ops = records.map(r => ({
      updateOne: {
        filter: { id: this.getEntityId(r.network, r.blockNumber) },
        update: {
          $set: {
            id: this.getEntityId(r.network, r.blockNumber),
            network: r.network,
            blockNumber: r.blockNumber,
            blockHash: r.blockHash,
          },
        },
        upsert: true,
      },
    }))
    return await this.bulkWrite(ops, { ordered: false })
  }

  static async findByBlockNumber(network: NetworksEnum, blockNumber: number, tOpts?: SaveOptions) {
    const id = this.getEntityId(network, blockNumber)
    return await this.findOne({ id }, null, tOpts)
  }

  static async findByBlockRange(network: NetworksEnum, fromBlock: number, toBlock: number, tOpts?: SaveOptions) {
    return await this.find(
      {
        network,
        blockNumber: { $gte: fromBlock, $lte: toBlock },
      },
      null,
      tOpts,
    ).sort({ blockNumber: 1 })
  }
}
