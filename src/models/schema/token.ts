import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, type IToken, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'

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
  network: 1,
})
export default class Token extends Model {
  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

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

  @prop({ type: () => Number, default: 0 })
  public priceChangeOnDayUsd!: number

  @prop({ type: () => String, default: '0' })
  public priceUsd!: string

  @prop({ type: () => Date, default: null })
  public lastUpdatedAt!: Date

  static async create(rawData: Partial<Token>, tOpts?: SaveOptions) {
    const data = new this(rawData)
    return data.save(tOpts)
  }

  static async findByTokenAddress(address: HexAddress) {
    return await this.findOne({ address })
  }

  static async findByTokenAddressAndNetwork(
    address: HexAddress,
    network: NetworksEnum,
  ) {
    return await this.findOne({ address, network })
  }

  async update(params: Partial<Token>, tOpts?: SaveOptions) {
    Object.entries(params).forEach(([key, value]) => {
      if (this.schema.tree[key]) {
        if (
          !this.schema.tree[key].required ||
          (this.schema.tree[key].required && value)
        ) {
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
