import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  HexAddress,
  type IMemberHistoryIdParams,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'MemberHistory'

@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: 'memberHistory',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  address: 1,
  'history.pluginAddress': 1,
})
export default class MemberHistory extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => Number })
  public fromBlockNumber!: number

  @prop({ type: () => Number })
  public fromBlockTimestamp!: number

  @prop({ type: () => Number })
  public toBlockNumber!: number

  @prop({ type: () => Number, default: 0 })
  public toBlockTimestamp!: number

  @prop({ type: () => String })
  public fromTxHash!: HexAddress

  @prop({ type: () => String })
  public toTxHash!: HexAddress

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public pluginSubdomain!: string

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress

  @prop({ type: () => String })
  public votingPower!: string

  @prop({ type: () => String, default: '0' })
  public tokenBalance!: string

  @prop({ type: () => String })
  public delegateFromAddress!: HexAddress

  @prop({ type: () => String })
  public delegateToAddress!: HexAddress


  static async create(rawData: Partial<MemberHistory>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.memberAddress, 'memberAddress is required')
      assert(!!rawData.fromTxHash, 'fromTxHash is required')
      assert(!!rawData.fromBlockNumber, 'fromBlockNumber is required')
      rawData.id = this.getEntityId({
        memberAddress: rawData?.memberAddress!,
        fromTxHash: rawData?.fromTxHash!,
        fromBlockNumber: rawData?.fromBlockNumber!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IMemberHistoryIdParams) {
    const entityId = `${params.memberAddress}-${params.fromTxHash}-${params.fromBlockNumber}`
    return entityId
  }

  static async findExistingLog(params: IMemberHistoryIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  async update(params: Partial<MemberHistory>, tOpts?: SaveOptions) {
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
