import { index, modelOptions, prop } from '@typegoose/typegoose'
import { ICollectionNames, IJwtAuthType } from '@types'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.Jwt

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
@index({ type: 1, value: 1 })
export default class Jwt extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public value!: string

  @prop({ type: () => String, enum: IJwtAuthType, required: true })
  public type!: IJwtAuthType

  static async create(rawData: Partial<Jwt>, tOpts?: SaveOptions) {
    const data = new this(rawData)
    return data.save(tOpts)
  }

  static async findByValue(value: string, tOpts?: SaveOptions) {
    return await this.findOne({ value }, null, tOpts)
  }

  async updateOnly(tOpts = {}) {
    this.updatedAt = new Date(Date.now())
    return await this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions) {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
