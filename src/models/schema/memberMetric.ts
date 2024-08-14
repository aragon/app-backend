import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  type IMemberMetricIdParams,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'MemberMetric'

@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: 'memberMetric',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  network: 1,
  memberAddress: 1,
  daoAddress: 1,
  pluginAddress: 1,
})
export default class MemberMetric extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => Number })
  public delegateReceivedCount!: number

  @prop({ type: () => Number })
  public delegateSentCount!: number

  @prop({ type: () => Number })
  public voteCount!: number

  @prop({ type: () => Number })
  public proposalCount!: number

  @prop({ type: () => Number, default: null })
  public lastActivity?: number

  @prop({ type: () => Number, default: null })
  public firstActivity?: number

  static async create(rawData: Partial<MemberMetric>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.address, 'address is required')
      rawData.id = this.getEntityId({
        memberAddress: rawData?.memberAddress!,
        pluginAddress: rawData?.pluginAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IMemberMetricIdParams) {
    const entityId = `${params.pluginAddress}-${params.memberAddress}`
    return entityId
  }

  static async findExistingLog(params: IMemberMetricIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  async update(params: Partial<MemberMetric>, tOpts?: SaveOptions) {
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
