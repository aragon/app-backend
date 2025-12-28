import { index, modelOptions, prop } from '@typegoose/typegoose'
import { ICollectionNames } from '@types'
import * as _ from 'lodash'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.Metrics

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
@index({ serviceName: 1 })
@index({ createdAt: 1 })
export default class Metrics extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public serviceName!: string

  @prop({ type: () => String, required: true })
  public metricsData!: string

  static async create(rawData: Partial<Metrics>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      rawData.id = this.getEntityId(rawData.serviceName!)
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId(serviceName: string) {
    return `metrics-${serviceName}`
  }

  static async findByServiceName(serviceName: string, tOpts?: SaveOptions) {
    return await this.findOne({ serviceName }, null, tOpts)
  }

  static async findAllMetrics(tOpts?: SaveOptions) {
    return await this.find({}, null, tOpts)
  }

  async update(params: Partial<Metrics>, tOpts?: SaveOptions) {
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
