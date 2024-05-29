import { modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

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
  @prop({ type: () => String, required: true, unique: true })
  public entityId!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress | string

  @prop({ type: () => String, default: '0' })
  public amount!: string

  static async create(rawData: Partial<Asset>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.daoAddress, 'daoAddress is required')
      assert(!!rawData.tokenAddress, 'tokenAddress is required')
      assert(!!rawData.network, 'network is required')
      rawData.entityId = this.getEntityId(rawData?.daoAddress!, rawData?.tokenAddress! as HexAddress, rawData?.network!)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(daoAddress: HexAddress, tokenAddress: HexAddress, network: NetworksEnum) {
    const entityId = `${daoAddress}-${tokenAddress}-${network}`
    return entityId
  }

  static async findExistingLog(
    daoAddress: HexAddress,
    tokenAddress: HexAddress,
    network: NetworksEnum,
    tOpts?: SaveOptions,
  ) {
    const entityId = this.getEntityId(daoAddress, tokenAddress, network)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
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
