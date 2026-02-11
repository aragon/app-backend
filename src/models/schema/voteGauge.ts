import { assert } from '@errors'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, type IVoteGaugeIdParams, NetworksEnum } from '@types'
import * as _ from 'lodash'
import { Model, type SaveOptions } from 'mongoose'

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
  public pluginAddress!: HexAddress

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
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        transactionHash: rawData?.transactionHash!,
        transactionIndex: rawData?.transactionIndex!,
        logIndex: rawData?.logIndex!,
        pluginAddress: rawData?.pluginAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IVoteGaugeIdParams) {
    const entityId = `${params.network}-${params.transactionHash}-${params.transactionIndex}-${params.logIndex}-${params.pluginAddress}`
    return entityId
  }

  static async findExistingLog(params: IVoteGaugeIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async countActiveVotesByEpochAndGauge(
    epochId: string,
    pluginAddress: HexAddress,
    gaugeAddress: HexAddress,
    network: NetworksEnum,
  ) {
    const uniqueMembers = await this.distinct('memberAddress', {
      $or: [
        // count all votes on epochId
        {
          pluginAddress,
          epochId,
          gaugeAddress,
          network,
          resetVoteTransactionHash: null,
        },
        // count all persistent votes on diff epochs
        {
          gaugeAddress,
          pluginAddress,
          network,
          resetVoteTransactionHash: null,
          persistentVote: true,
        },
      ],
    })
    return uniqueMembers.length
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
