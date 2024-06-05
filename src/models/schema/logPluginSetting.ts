import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'LogPluginSetting'

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'logPluginSetting',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  pluginAddress: 1,
})
export default class LogPluginSetting extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public entityId!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => Boolean })
  public onlyListed!: boolean

  @prop({ type: () => Number })
  public minApprovals!: number

  @prop({ type: () => Number })
  public votingMode!: number

  @prop({ type: () => Number })
  public supportThreshold!: number

  @prop({ type: () => Number })
  public minParticipation!: number

  @prop({ type: () => Number })
  public minDuration!: number

  @prop({ type: () => Number })
  public minProposerVotingPower!: number

  static async create(rawData: Partial<LogPluginSetting>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      rawData.entityId = this.getEntityId(rawData?.transactionHash!, rawData?.pluginAddress!)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(transactionHash: HexAddress, pluginAddress: HexAddress) {
    const entityId = `${transactionHash}-${pluginAddress}`
    return entityId
  }

  static async findExistingLog(transactionHash: HexAddress, pluginAddress: HexAddress, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(transactionHash, pluginAddress)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
  }

  async update(params: Partial<LogPluginSetting>, tOpts?: SaveOptions) {
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
