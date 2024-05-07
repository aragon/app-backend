import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, IEventLogPluginType, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'

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
  address: 1,
  network: 1,
  lastBlockSync: 1,
})
export default class LogPluginSetupProcessor extends Model {
  @prop({ type: () => String, enum: IEventLogPluginType })
  public event!: string

  @prop({ type: () => String, required: true, unique: false })
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
  public plugin!: HexAddress

  @prop({ type: () => String, default: null })
  public sender!: HexAddress

  @prop({ type: () => String, default: null })
  public release!: string

  @prop({ type: () => String, default: null })
  public build!: string

  @prop({ type: () => [Permission], default: [] })
  public permissions!: Permission[]

  static async create(rawData: Partial<LogPluginSetupProcessor>, tOpts?: SaveOptions) {
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static async findTxHash(transactionHash: HexAddress) {
    return await this.findOne({ transactionHash })
  }

  static async findTxHashAndEvent(transactionHash: HexAddress, event: IEventLogPluginType) {
    return await this.findOne({ transactionHash, event })
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
