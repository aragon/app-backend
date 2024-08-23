import { index, modelOptions, prop } from '@typegoose/typegoose'
import { type ENS, HexAddress, ICollectionNames, type IMemberIdParams } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = ICollectionNames.Member

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
@index({
  address: 1,
  ens: 1,
})
export default class Member extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public ens!: ENS | null

  @prop({ type: () => String, default: null })
  public avatar!: string

  @prop({ type: () => Number, default: null })
  public lastActivity?: number

  @prop({ type: () => Number, default: null })
  public firstActivity?: number

  static async create(rawData: Partial<Member>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.address, 'address is required')
      rawData.id = this.getEntityId({
        address: rawData?.address!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IMemberIdParams) {
    const entityId = `${params.address}`
    return entityId
  }

  static async findExistingLog(params: IMemberIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  static async findByEns(ens: ENS) {
    return await this.findOne({ ens })
  }

  static async findByAddress(address: HexAddress) {
    return await this.findOne({ address })
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

  // async getTokenBalance(params: {tokenAddress: HexAddress, network: NetworksEnum}, tOpts?: SaveOptions) {
  //   return await this.model(ICollectionNames.MemberBalance).getOrCreateTokenBalance({address: this.address, tokenAddress: params.tokenAddress, network: params.network}, tOpts)
  // }
  //
  // async getPluginMetrics(params: {pluginAddress: HexAddress, network: NetworksEnum}, tOpts?: SaveOptions) {
  //   return await this.model(ICollectionNames.MemberMetrics).getOrCreateMemberMetrics({address: this.address, pluginAddress: params.pluginAddress, network: params.network}, tOpts)
  // }
  //
  // async addToDao(params: {pluginAddress: HexAddress, network: NetworksEnum}, tOpts?: SaveOptions) {
  //   return await this.model(ICollectionNames.DaoMemberMapping).getOrCreateMemberMetrics({address: this.address, pluginAddress: params.pluginAddress, network: params.network}, tOpts)
  // }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
