import { index, modelOptions, prop } from '@typegoose/typegoose'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { ICollectionNames, type IConfigIndexerIdParams, NetworksEnum } from '@types'
import { assert } from '@errors'

const customName = ICollectionNames.ConfigIndexer

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
@index({ id: 1 }, { unique: true })
@index({ network: 1, lastSync: 1 })
@index({ lastSync: 1 })
@index({ end: -1 })
@index({ service: 1 })
export default class ConfigIndexer extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public service!: string

  @prop({ type: () => Number, default: 0 })
  public lastSync!: number

  @prop({ type: () => Boolean, default: false })
  public end!: boolean

  static async create(rawData: Partial<ConfigIndexer>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      assert(!!rawData.network, 'network is required')
      assert(!!rawData.service, 'service is required')
      rawData.id = this.getEntityId({
        network: rawData?.network!,
        service: rawData?.service!,
      })
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(params: IConfigIndexerIdParams) {
    const entityId = `${params.network}-${params.service}`
    return entityId
  }

  static async findExistingLog(params: IConfigIndexerIdParams, tOpts?: SaveOptions) {
    const entityId = this.getEntityId(params)
    return await this.findByEntityId(entityId, tOpts)
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
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
