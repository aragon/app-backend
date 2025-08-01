import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, NetworksEnum, type IVpMemberIdParams } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = ICollectionNames.VpMember

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
@index({ id: 1 }, { unique: true })
@index({ memberAddress: 1 })
@index({ tokenAddress: 1 })
@index({ network: 1 })
@index({ network: 1, tokenAddress: 1, memberAddress: 1 })
export default class VpMember extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  @prop({ type: () => String, default: '0' })
  public votingPower!: string

  @prop({ type: () => String, required: true })
  public tokenAddress!: HexAddress

  @prop({ type: () => [String], default: [] })
  public tokenIds!: string[]

  @prop({ type: () => String, required: true, enum: NetworksEnum })
  public network!: NetworksEnum

  @prop({ type: () => Number, default: 0 })
  public delegateReceivedCount!: number

  static async create(rawData: Partial<VpMember>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.tokenAddress, 'tokenAddress is required')
      assert(!!rawData.memberAddress, 'memberAddress is required')
      rawData.id = this.getEntityId({
        network: rawData.network!,
        tokenAddress: rawData.tokenAddress!,
        memberAddress: rawData.memberAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IVpMemberIdParams) {
    return `${params.network}-${params.tokenAddress}-${params.memberAddress}`
  }

  static async findExistingLog(params: IVpMemberIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findByTokenAndMember(
    network: NetworksEnum,
    tokenAddress: HexAddress,
    memberAddress: HexAddress,
    tOpts?: SaveOptions,
  ) {
    return await this.findOne({ network, tokenAddress, memberAddress }, null, tOpts)
  }

  static async findByToken(network: NetworksEnum, tokenAddress: HexAddress, tOpts?: SaveOptions) {
    return await this.find({ network, tokenAddress }, null, tOpts)
  }

  static async findByMember(network: NetworksEnum, memberAddress: HexAddress, tOpts?: SaveOptions) {
    return await this.find({ network, memberAddress }, null, tOpts)
  }

  async update(params: Partial<VpMember>, tOpts?: SaveOptions) {
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
