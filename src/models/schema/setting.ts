import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'Setting'

class Settings {
  @prop({ type: () => Number })
  public votingMode!: number

  @prop({ type: () => Number })
  public supportThreshold!: number

  @prop({ type: () => Number })
  public minParticipation!: number

  @prop({ type: () => Number })
  public minDuration!: number

  @prop({ type: () => String })
  public minProposerVotingPower!: string

  @prop({ type: () => Number })
  public minApprovals!: number

  @prop({ type: () => Boolean })
  public onlyListed!: boolean
}

class HistorySetting {
  @prop({ type: () => String, required: true })
  public fromTxHash!: HexAddress

  @prop({ type: () => String })
  public toTxHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public fromBlockNumber!: number

  @prop({ type: () => Number })
  public toBlockNumber!: number

  @prop({ type: () => Settings })
  public settings?: Settings
}

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'setting',
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
export default class Setting extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public entityId!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public pluginAddress!: HexAddress

  @prop({ type: () => [HistorySetting], default: [] })
  public history!: HistorySetting[]

  static async create(rawData: Partial<Setting>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.pluginAddress, 'pluginAddress is required')
      assert(!!rawData.network, 'network is required')
      rawData.entityId = this.getEntityId(rawData?.pluginAddress!, rawData?.network!)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(pluginAddress: HexAddress, network: NetworksEnum) {
    const entityId = `${pluginAddress}-${network}`
    return entityId
  }

  static async findExistingLog(pluginAddress: HexAddress, network: NetworksEnum, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(pluginAddress, network)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
  }

  async update(params: Partial<Setting>, tOpts?: SaveOptions) {
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
