import { index, modelOptions, prop } from '@typegoose/typegoose'
import { HexAddress, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { assert } from '@errors'

const customName = 'LogPluginRepo'

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'logPluginRepo',
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
export default class LogPluginRepo extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public entityId!: string

  @prop({ type: () => String, required: true })
  public transactionHash!: HexAddress

  @prop({ type: () => Number, required: true })
  public blockNumber!: number

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public subdomain!: string

  @prop({ type: () => String, required: true })
  public pluginRepo!: HexAddress

  static async create(rawData: Partial<LogPluginRepo>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.transactionHash, 'transactionHash is required')
      assert(!!rawData.pluginRepo, 'pluginRepo is required')
      rawData.entityId = this.getEntityId(rawData?.transactionHash!, rawData?.pluginRepo!)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(transactionHash: HexAddress, pluginRepo: HexAddress) {
    const entityId = `${transactionHash}-${pluginRepo}`
    return entityId
  }

  static async findExistingLog(transactionHash: HexAddress, pluginRepo: HexAddress, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(transactionHash, pluginRepo)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
  }

  async update(params: Partial<LogPluginRepo>, tOpts?: SaveOptions) {
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
