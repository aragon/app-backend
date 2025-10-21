import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, type IVoteIdParams, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = ICollectionNames.VoteGauge

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
@index({ network: 1, blockNumber: 1, gaugeAddress: 1, memberAddress: 1 })
@index({ network: 1, gaugeAddress: 1, epochId: 1 })
@index({ network: 1, gaugeAddress: 1, memberAddress: 1, epochId: 1, blockNumber: -1 })
@index({ gaugeAddress: 1, memberAddress: 1, epochId: 1 })
@index({ network: 1, transactionHash: 1 })
export default class VoteGauge extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public transactionIndex!: number

  @prop({ type: () => Number, required: true })
  public logIndex!: number

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp?: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public gaugeAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public epochId!: string

  @prop({ type: () => String, default: null })
  public votingPower?: string

  @prop({ type: () => String, default: null })
  public resetVoteTransactionHash!: HexAddress

  @prop({ type: () => Boolean, default: false })
  public persistentVote?: boolean

  static async create(rawData: Partial<VoteGauge>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.transactionIndex || rawData.transactionIndex === 0, 'transactionIndex is required')
      assert(!!rawData.logIndex || rawData.logIndex === 0, 'logIndex is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        transactionHash: rawData?.transactionHash!,
        transactionIndex: rawData?.transactionIndex!,
        logIndex: rawData?.logIndex!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IVoteIdParams) {
    const entityId = `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}`
    return entityId
  }

  static async findExistingLog(params: IVoteIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async countActiveVotesByEpochAndGauge(
    epochId: string,
    gaugeAddress: HexAddress,
    network: NetworksEnum,
  ) {
    return this.countDocuments({
      $or: [
        // count all votes on epochId
        {
          epochId,
          gaugeAddress,
          network,
          resetVoteTransactionHash: null,
        },
        // count all persistent votes on diff epochs
        {
          gaugeAddress,
          network,
          resetVoteTransactionHash: null,
          persistentVote: true,
        },
      ],
    })
  }

  async update(params: Partial<VoteGauge>, tOpts?: SaveOptions) {
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
