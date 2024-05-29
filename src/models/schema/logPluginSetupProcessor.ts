import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, IEventLogPluginType, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'LogPluginSetupProcessor'

class Permission {
  @prop({ type: () => Number, default: null })
  public operation!: number

  @prop({ type: () => String, default: null })
  public where!: string

  @prop({ type: () => String, default: null })
  public who!: string

  @prop({ type: () => String, default: null })
  public condition!: string

  @prop({ type: () => String, default: null })
  public permissionId!: string
}

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'logPluginSetupProcessor',
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
export default class LogPluginSetupProcessor extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public entityId!: string

  @prop({ type: () => String, enum: IEventLogPluginType, required: true })
  public event!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public preparedSetupId!: string

  @prop({ type: () => String, default: null })
  public appliedSetupId!: HexAddress

  @prop({ type: () => String, default: null })
  public pluginSetupRepo!: HexAddress

  @prop({ type: () => String, default: null })
  public pluginAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public sender!: HexAddress

  @prop({ type: () => String, default: null })
  public release!: string

  @prop({ type: () => String, default: null })
  public build!: string

  @prop({ type: () => [Permission], default: [] })
  public permissions!: Permission[]

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress // voting token address

  static async create(rawData: Partial<LogPluginSetupProcessor>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.event, 'event is required')
      rawData.entityId = this.getEntityId(rawData?.transactionHash!, rawData?.event as any)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(transactionHash: HexAddress, event: IEventLogPluginType) {
    const entityId = `${transactionHash}-${event}`
    return entityId
  }

  static async findExistingLog(transactionHash: HexAddress, event: IEventLogPluginType, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(transactionHash, event)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findPluginByTokenAddress(tokenAddress: HexAddress, network: NetworksEnum) {
    return await this.findOne({ tokenAddress, network })
  }

  static async findByPluginAddress(pluginAddress: HexAddress, network: NetworksEnum) {
    return await this.findOne({
      pluginAddress,
      network,
    })
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
  }

  async update(params: Partial<LogPluginSetupProcessor>, tOpts?: SaveOptions) {
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
