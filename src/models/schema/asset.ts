import { modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'

const customName = 'Asset'

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'asset',
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
export default class Asset extends Model {
  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => Boolean, default: false })
  public native!: boolean

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress | string

  @prop({ type: () => String, default: '0' })
  public amount!: string

  static async create(rawData: Partial<Asset>, tOpts?: SaveOptions) {
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static async findAssetsByDao(daoAddress: HexAddress, network: NetworksEnum) {
    return await this.find({ daoAddress, network })
  }

  static async findAssetByTokenAndDao(tokenAddress: HexAddress, daoAddress: HexAddress, network: NetworksEnum) {
    return await this.findOne({ tokenAddress, daoAddress, network })
  }

  async update(params: Partial<Plugin>, tOpts?: SaveOptions) {
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
