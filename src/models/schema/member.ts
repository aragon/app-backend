import { modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'Member'

class MemberDao {
  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => Number })
  public fromBlockNumber!: number

  @prop({ type: () => String })
  public fromTxHash!: HexAddress

  @prop({ type: () => Number })
  public toBlockNumber!: number

  @prop({ type: () => String })
  public toTxHash!: HexAddress

  @prop({ type: () => String })
  public votingPower!: string

  @prop({ type: () => String })
  public delegateFromAddress!: HexAddress

  @prop({ type: () => String })
  public delegateToAddress!: HexAddress
}

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'member',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
// @index({
//   address: 1,
//   network: 1,
//   lastBlockSync: 1,
// })
export default class Member extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public entityId!: string

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public ens!: HexAddress

  @prop({ type: () => [MemberDao], default: [] })
  public daos?: MemberDao[]

  static async create(rawData: Partial<Member>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.address, 'address is required')
      rawData.entityId = this.getEntityId(rawData?.address!)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(address: HexAddress) {
    const entityId = `${address}`
    return entityId
  }

  static async findExistingLog(address: HexAddress, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(address)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
  }

  async update(params: Partial<Member>, tOpts?: SaveOptions) {
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
