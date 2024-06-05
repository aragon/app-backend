import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, type IToken, ITokenType, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { utcDateProp } from '@models/utils/models'
import { assert } from '@errors'

const customName = 'Token'

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'token',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  address: 1,
})
export default class Token extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public entityId!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, enum: ITokenType, required: true })
  public type!: ITokenType

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public implementationAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public logo!: string

  @prop({ type: () => String, default: null })
  public name!: string

  @prop({ type: () => String, default: null, uppercase: true })
  public symbol!: string

  @prop({ type: () => Number, default: 18 })
  public decimals!: number

  @prop({ type: () => Number, default: 0 })
  public holders!: number

  @prop({ type: () => Number, default: 0 })
  public totalSupply!: number

  @prop({ type: () => String, default: '0' })
  public priceChangeOnDayUsd!: string

  @prop({ type: () => String, default: '0' })
  public priceUsd!: string

  @utcDateProp({ default: null })
  public lastUpdatedAt!: Date

  static async create(rawData: Partial<Token>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.address, 'address is required')
      assert(!!rawData.network, 'network is required')
      rawData.entityId = this.getEntityId(rawData?.address!, rawData?.network!)
    }
    const data = new this(rawData)
    return data.save(tOpts)
  }

  static getEntityId(address: HexAddress, network: NetworksEnum) {
    const entityId = `${address}-${network}`
    return entityId
  }

  static async findExistingLog(address: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(address, network)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
  }

  static async findByTokenAddress(address: HexAddress) {
    return await this.findOne({ address })
  }

  static async findByTokenAddressAndNetwork(address: HexAddress, network: NetworksEnum) {
    return await this.findOne({ address, network })
  }

  async update(params: Partial<Token>, tOpts?: SaveOptions) {
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

    return this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return this.model(customName).findById(this._id, tOpts)
  }

  filterKeys() {
    const obj = this.toObject()
    const filtered = _.omit(obj, 'id', '_id', '__v', 'createdAt', 'updatedAt')
    return filtered as IToken
  }
}
