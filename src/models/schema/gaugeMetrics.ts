import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, ICollectionNames, NetworksEnum, type IGaugeMetricsIdParams } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = ICollectionNames.GaugeMetrics

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
@index({ epochId: 1 })
@index({ daoAddress: 1 })
@index({ pluginAddress: 1 })
@index({ gaugeAddress: 1 })
@index({ network: 1 })
@index({ network: 1, pluginAddress: 1, gaugeAddress: 1, epochId: 1 })
export default class GaugeMetrics extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public gaugeAddress!: HexAddress

  @prop({ type: () => String, required: true, enum: NetworksEnum })
  public network!: NetworksEnum

  @prop({ type: () => String })
  public daoAddress?: HexAddress

  @prop({ type: () => String })
  public pluginAddress?: HexAddress

  @prop({ type: () => Number, default: 0 })
  public totalMemberVoteCount!: number

  @prop({ type: () => String, default: '0' })
  public currentEpochVotingPower!: string

  @prop({ type: () => String, default: '0' })
  public totalGaugeVotingPower!: string

  @prop({ type: () => String, required: true })
  public epochId!: string

  static async create(rawData: Partial<GaugeMetrics>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      assert(!!rawData.gaugeAddress, 'gaugeAddress is required')
      assert(!!rawData.epochId, 'epochId is required')
      rawData.id = this.getEntityId({
        network: rawData.network!,
        pluginAddress: rawData.pluginAddress!,
        gaugeAddress: rawData.gaugeAddress!,
        epochId: rawData.epochId!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IGaugeMetricsIdParams) {
    return `${params.network}-${params.pluginAddress}-${params.gaugeAddress}-${params.epochId}`
  }

  static async findExistingLog(params: IGaugeMetricsIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  static async findByGaugeAndEpoch({
    network,
    pluginAddress,
    gaugeAddress,
    epochId,
  }: {
    epochId: string | null
    gaugeAddress: string
    pluginAddress: string
    network: NetworksEnum
  }) {
    return await this.find({ network, pluginAddress, gaugeAddress, epochId })
  }

  async update(params: Partial<GaugeMetrics>, tOpts?: SaveOptions) {
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
