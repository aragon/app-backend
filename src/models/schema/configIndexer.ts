import { modelOptions, prop } from '@typegoose/typegoose'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { NetworksEnum } from '@types'
import { assert } from '@errors'

const customName = 'ConfigIndexer'

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'configIndexer',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
export default class ConfigIndexer extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public entityId!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public service!: string

  @prop({ type: () => Number, default: 0 })
  public lastSync!: number

  static async create(rawData: Partial<ConfigIndexer>, tOpts?: SaveOptions) {
    if (!rawData.entityId) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.service, 'service is required')
      rawData.entityId = this.getEntityId(rawData?.network!, rawData?.service!)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(network: NetworksEnum, service: string) {
    const entityId = `${network}-${service}`
    return entityId
  }

  static async findExistingLog(network: NetworksEnum, service: string, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(network, service)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ entityId }, tOpts)
  }

  async update(params: Partial<ConfigIndexer>, tOpts?: SaveOptions) {
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
