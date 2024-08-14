import { index, modelOptions, prop } from '@typegoose/typegoose'
import {HexAddress, type IPluginIdParams, IPluginStatus, NetworksEnum} from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'Plugin'

export class PluginPermission {
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

export class PluginUninstalled {
  @prop({ type: () => Boolean, default: false })
  public status!: boolean

  @prop({ type: () => String, default: null })
  public transactionHash!: HexAddress

  @prop({ type: () => Number })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp!: number
}

@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: 'plugin',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
@index({
  network: 1,
  address: 1,
  daoAddress: 1,
  tokenAddress: 1,
})
export default class Plugin extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => Number })
  public blockTimestamp!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public address!: HexAddress

  @prop({ type: () => String, default: null })
  public implementationAddress?: HexAddress

  @prop({ type: () => String, enum: IPluginStatus, required: true })
  public status!: IPluginStatus

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public tokenAddress!: HexAddress // voting token address

  @prop({ type: () => String, default: null })
  public pluginRepoAddress!: HexAddress

  @prop({ type: () => String, default: null })
  public release!: string

  @prop({ type: () => String, default: null })
  public build!: string

  @prop({ type: () => String, default: null })
  public subdomain!: string

  @prop({ type: () => [PluginPermission], _id: false, default: [] })
  public permissions!: PluginPermission[]

  @prop({ type: () => PluginUninstalled, default: {} })
  public uninstalled!: PluginUninstalled

  static async create(rawData: Partial<Plugin>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.address, 'address is required')
      assert(!!rawData.network, 'network is required')
      rawData.id = this.getEntityId({
        transactionHash: rawData?.transactionHash!,
        address: rawData?.address as any,
        network: rawData?.network!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IPluginIdParams) {
    const entityId = `${params.network}-${params.transactionHash}-${params.address}`
    return entityId
  }

  static async findExistingLog(params: IPluginIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, tOpts)
  }

  static async findByAddress(address: HexAddress, tOpts?: SaveOptions) {
    return await this.findOne({ address }, tOpts)
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

  filterKeys() {
    const obj = this.toObject()
    const filtered = _.omit(obj, '_id', '__v', 'createdAt', 'updatedAt')
    return filtered
  }
}
