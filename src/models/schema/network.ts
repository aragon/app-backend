import { index, modelOptions, prop } from '@typegoose/typegoose'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import Utils from '@helpers/utils'
import { NetworksEnum, StatusNetworkEnum } from '@types'

const customName = 'Network'

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'networks',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  network: 1,
  status: 1,
  isActive: 1,
})
export default class Network extends Model {
  @prop({
    type: () => String,
    enum: NetworksEnum,
    required: true,
    unique: true,
  })
  public name!: NetworksEnum

  @prop({ type: () => String, enum: StatusNetworkEnum, required: true })
  public status!: StatusNetworkEnum

  @prop({ type: () => Boolean, required: true, default: true })
  public isActive!: boolean

  @prop({ type: () => Number, default: 0 })
  public lastBlockDaoLog!: number

  @prop({ type: () => Number, default: 0 })
  public lastBlockMetadataLog!: number

  @prop({ type: () => Number, default: 0 })
  public lastBlockPluginInstallationPreparedLog!: number

  @prop({ type: () => Number, default: 0 })
  public lastBlockPluginInstallationAppliedLog!: number

  @prop({ type: () => Number, default: 0 })
  public lastBlockPluginUninstallationPreparedLog!: number

  @prop({ type: () => Number, default: 0 })
  public lastBlockPluginUninstallationAppliedLog!: number

  @prop({ type: () => Number, default: 0 })
  public lastBlockPluginUpdatePreparedLog!: number

  @prop({ type: () => Number, default: 0 })
  public lastBlockPluginUpdateAppliedLog!: number

  @prop({ type: () => Number, default: 0 })
  public lastBlockPluginRepoLog!: number

  static NETWORKS = Utils.enumToObject(NetworksEnum)
  static STATUS_NETWORKS = Utils.enumToObject(StatusNetworkEnum)

  static async create(rawData: Partial<Network>, tOpts?: SaveOptions) {
    const data = new this(rawData)
    return data.save(tOpts)
  }

  static async findAll(): Promise<Network[]> {
    return await this.find({ isActive: true })
  }

  static async findByName(name: NetworksEnum) {
    return await this.findOne({ name, isActive: true })
  }

  async update(params: Partial<Network>, tOpts?: SaveOptions) {
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

    return this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return this.model(customName).findById(this._id, tOpts).exec()
  }
}
