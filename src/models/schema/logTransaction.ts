import { modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ITransactionType, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'LogTransaction'

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'logTransaction',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
// @index({
//   blockNumber: 1,
//   transactionHash: 1,
// })
export default class LogTransaction extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public entityId!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, enum: ITransactionType, required: true })
  public type!: ITransactionType

  @prop({ type: () => String, required: true })
  public from!: HexAddress

  @prop({ type: () => String, required: true })
  public to!: HexAddress

  @prop({ type: () => String, default: 0 })
  public amount!: string

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public daoAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public tokenId!: string

  @prop({ type: () => [String], default: [] })
  public tokenIds!: string[]

  @prop({ type: () => [Number], default: [] })
  public amounts!: number[]

  @prop({ type: () => String, default: null })
  public reference!: string

  @prop({ type: () => Number, default: 0 })
  public actionIndex!: number

  @prop({ type: () => String, default: null })
  public execResult!: string

  @prop({ type: () => String, default: null })
  public actor!: HexAddress

  @prop({ type: () => String, default: null })
  public pluginAddress!: HexAddress

  @prop({ type: () => Number })
  public proposalId!: number

  static async create(rawData: Partial<LogTransaction>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.type, 'type is required')
      rawData.entityId = this.getEntityId(rawData?.transactionHash!, rawData?.type!, rawData?.actionIndex ?? 0)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(transactionHash: HexAddress, type: ITransactionType, actionIndex?: number) {
    const entityId = `${transactionHash}-${type}-${actionIndex ?? 0}`
    return entityId
  }

  static async findExistingLog(
    transactionHash: HexAddress,
    type: ITransactionType,
    actionIndex?: number,
    tOpts?: SaveOptions,
  ) {
    const entityId = this.getEntityId(transactionHash, type, actionIndex ?? 0)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
  }

  async update(params: Partial<LogTransaction>, tOpts?: SaveOptions) {
    Object.entries(params).forEach(([key, value]) => {
      if (this.schema.tree[key]) {
        if (!this.schema.tree[key].required || (this.schema.tree[key].required && value)) {
          const parsedObj = this.toObject()

          if (!_.isEqual(parsedObj[key], value)) {
            this[key] = value
          }
        }
      }
    })

    return await this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
