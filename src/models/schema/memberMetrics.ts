import { index, modelOptions, prop } from '@typegoose/typegoose'
import { type HexAddress, ICollectionNames, type IMemberMetricsIdParams, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = ICollectionNames.MemberMetrics

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
@index({ address: 1 })
@index({ address: 1, network: 1, pluginAddress: 1 })
export default class MemberMetrics extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public address!: string

  @prop({ type: () => String, required: true })
  public pluginAddress!: string

  @prop({ type: () => Number, default: 0 })
  public delegateReceivedCount!: number

  @prop({ type: () => Number, default: 0 })
  public voteCount!: number

  @prop({ type: () => Number, default: 0 })
  public proposalCount!: number

  @prop({ type: () => Number, default: null })
  public lastActivity?: number

  @prop({ type: () => Number, default: null })
  public firstActivity?: number

  static async create(rawData: Partial<MemberMetrics>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.address, 'memberAddress is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        address: rawData?.address!,
        pluginAddress: rawData?.pluginAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IMemberMetricsIdParams) {
    const entityId = `${params.network}-${params.address}-${params.pluginAddress}`
    return entityId
  }

  static async findExistingLog(params: IMemberMetricsIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findByAddress(address: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    return await this.findOne({ address, network }, null, tOpts)
  }

  async update(params: Partial<MemberMetrics>, tOpts?: SaveOptions) {
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

  async decreaseDelegateReceivedCount(decrease: number = 1, tOpts?: SaveOptions) {
    if (this.delegateReceivedCount === 0) return this
    this.delegateReceivedCount = (this.delegateReceivedCount || 0) - decrease
    return await this.save(tOpts)
  }

  async increaseDelegateReceivedCount(increment: number = 1, tOpts?: SaveOptions) {
    this.delegateReceivedCount = (this.delegateReceivedCount || 0) + increment
    return await this.save(tOpts)
  }

  async increaseVoteCount(increment: number = 1, tOpts?: SaveOptions) {
    this.voteCount = (this.voteCount || 0) + increment
    return await this.save(tOpts)
  }

  async increaseProposalCount(increment: number = 1, tOpts?: SaveOptions) {
    this.proposalCount = (this.proposalCount || 0) + increment
    return await this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
