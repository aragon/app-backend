import { assert } from '@errors'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, type IPluginMetricsIdParams, NetworksEnum } from '@types'
import * as _ from 'lodash'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.PluginMetrics

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
@index({ memberAddress: 1 })
@index({ memberAddress: 1, network: 1, lastActivity: -1 })
@index({ daoAddress: 1 })
@index({ pluginAddress: 1 })
@index({ network: 1 })
@index({ network: 1, pluginAddress: 1, memberAddress: 1 })
export default class PluginMetrics extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public memberAddress!: HexAddress

  @prop({ type: () => String })
  public daoAddress?: HexAddress

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, required: true, enum: NetworksEnum })
  public network!: NetworksEnum

  @prop({ type: () => Number, default: 0 })
  public voteCount!: number

  @prop({ type: () => Number, default: 0 })
  public proposalCount!: number

  @prop({ type: () => Number, default: null })
  public lastActivity?: number

  @prop({ type: () => Number, default: null })
  public firstActivity?: number

  static async create(rawData: Partial<PluginMetrics> = {} as Partial<PluginMetrics>, tOpts?: SaveOptions) {
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

  static getEntityId(params: IPluginMetricsIdParams) {
    return `${params.network}-${params.memberAddress}-${params.pluginAddress}`
  }

  static async findExistingLog(params: IPluginMetricsIdParams, tOpts?: SaveOptions) {
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

  static async findGlobalActivity(
    memberAddress: HexAddress,
    network: NetworksEnum,
  ): Promise<{ firstActivity: number | null; lastActivity: number | null }> {
    const [result] = await this.aggregate<{ firstActivity: number | null; lastActivity: number | null }>([
      { $match: { memberAddress, network } },
      {
        $group: {
          _id: null,
          firstActivity: { $min: '$firstActivity' },
          lastActivity: { $max: '$lastActivity' },
        },
      },
      { $project: { _id: 0, firstActivity: 1, lastActivity: 1 } },
    ])
    return {
      firstActivity: result?.firstActivity ?? null,
      lastActivity: result?.lastActivity ?? null,
    }
  }

  async update(params: Partial<PluginMetrics>, tOpts?: SaveOptions) {
    const parsedObj = this.toObject()
    Object.entries(params).forEach(([key, value]) => {
      if (this.schema.tree[key]) {
        if (!this.schema.tree[key].required || (this.schema.tree[key].required && value)) {
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
