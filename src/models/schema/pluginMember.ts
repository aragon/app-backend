import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, NetworksEnum, type IPluginMemberIdParams } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = ICollectionNames.PluginMember

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
@index({ daoAddress: 1 })
@index({ pluginAddress: 1 })
@index({ network: 1 })
@index({ network: 1, pluginAddress: 1, memberAddress: 1 })
export default class PluginMember extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true, enum: NetworksEnum })
  public network!: NetworksEnum

  static async create(rawData: Partial<PluginMember>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.memberAddress, 'memberAddress is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      rawData.id = this.getEntityId({
        network: rawData.network!,
        memberAddress: rawData.memberAddress!,
        pluginAddress: rawData.pluginAddress!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IPluginMemberIdParams) {
    return `${params.network}-${params.memberAddress}-${params.pluginAddress}`
  }

  static async findExistingLog(params: IPluginMemberIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findByPluginAndMember(
    network: NetworksEnum,
    pluginAddress: HexAddress,
    memberAddress: HexAddress,
    tOpts?: SaveOptions,
  ) {
    return await this.findOne({ network, pluginAddress, memberAddress }, null, tOpts)
  }

  static async findByPlugin(network: NetworksEnum, pluginAddress: HexAddress, tOpts?: SaveOptions) {
    return await this.find({ network, pluginAddress }, null, tOpts)
  }

  static async findByDao(network: NetworksEnum, daoAddress: HexAddress, tOpts?: SaveOptions) {
    return await this.find({ network, daoAddress }, null, tOpts)
  }

  async update(params: Partial<PluginMember>, tOpts?: SaveOptions) {
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
