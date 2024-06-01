import { modelOptions, prop } from '@typegoose/typegoose'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { AggregatorTypeEnum } from '@types'

const customName = 'Aggregator'

@modelOptions({
  schemaOptions: {
    timestamps: true,
    collection: 'aggregator',
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
  options: {
    customName,
  },
})
// @index({
//   type: 1,
// })
export default class Aggregator extends Model {
  @prop({
    type: () => String,
    enum: AggregatorTypeEnum,
    required: true,
    unique: true,
  })
  public type!: AggregatorTypeEnum

  @prop({ type: () => Date, default: null })
  public lastTimeSync!: Date

  @prop({ type: () => Number })
  public lastBlockNumber!: number

  static async create(rawData: Partial<Aggregator>, tOpts?: SaveOptions) {
    const data = new this(rawData)
    return data.save(tOpts)
  }

  static async findByType(type: AggregatorTypeEnum) {
    return await this.findOne({ type })
  }

  async update(params: Partial<Aggregator>, tOpts?: SaveOptions) {
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
