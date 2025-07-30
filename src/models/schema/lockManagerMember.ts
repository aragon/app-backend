import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, NetworksEnum, type ILockManagerMemberIdParams } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = ICollectionNames.LockManagerMember

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
@index({ network: 1, pluginAddress: 1, memberAddress: 1 })
@index({ network: 1, pluginAddress: 1, votingPower: -1 })
@index({ pluginAddress: 1, memberAddress: 1 })
export default class LockManagerMember extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, default: '0' })
  public votingPower!: string

  @prop({ type: () => String })
  public transactionHash!: HexAddress

  @prop({ type: () => Number })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp?: number

  @prop({ type: () => Boolean, default: true })
  public isActive!: boolean

  static async create(rawData: Partial<LockManagerMember>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      assert(!!rawData.memberAddress, 'memberAddress is required')
      rawData.id = this.getEntityId({
        network: rawData.network!,
        pluginAddress: rawData.pluginAddress!,
        memberAddress: rawData.memberAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: ILockManagerMemberIdParams) {
    return `${params.network}-${params.pluginAddress}-${params.memberAddress}`
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findMemberByPlugin(
    {
      network,
      pluginAddress,
      memberAddress,
    }: {
      network: NetworksEnum
      pluginAddress: HexAddress
      memberAddress: HexAddress
    },
    tOpts?: SaveOptions,
  ) {
    return await this.findOne({ network, pluginAddress, memberAddress }, null, tOpts)
  }

  static async findActiveMembers(
    {
      network,
      pluginAddress,
    }: {
      network: NetworksEnum
      pluginAddress: HexAddress
    },
    tOpts?: SaveOptions,
  ) {
    return await this.find({ network, pluginAddress, isActive: true }, null, tOpts)
  }

  async update(params: Partial<LockManagerMember>, tOpts?: SaveOptions) {
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
