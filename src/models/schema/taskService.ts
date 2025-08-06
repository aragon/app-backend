import { index, modelOptions, prop } from '@typegoose/typegoose'
import { Model, type SaveOptions } from 'mongoose'
import * as _ from 'lodash'
import { v4 as uuidv4 } from 'uuid'
import { ICollectionNames } from '@types'

const customName = ICollectionNames.TaskService

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
@index({ serviceName: 1 }, { unique: true }) // Add index for serviceName
@index({ nextStartAt: 1 }) // Add index for nextStartAt queries
@index({ lockedUntil: 1 }) // Add index for lock queries
export default class TaskService extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public serviceName!: string

  @prop({ type: () => Number, required: true })
  public interval!: number

  @prop({ type: () => Date })
  public lastStartAt!: Date

  @prop({ type: () => Date })
  public nextStartAt!: Date

  @prop({ type: () => Date })
  public lockedUntil?: Date

  @prop({ type: () => Number })
  public lockedBy?: number

  static async create(rawData: Partial<TaskService>, tOpts?: SaveOptions) {
    if (!rawData.id) {
      rawData.id = this.getEntityId()
    }
    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static getEntityId() {
    const entityId = uuidv4()
    return entityId
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions) {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  async update(params: Partial<TaskService>, tOpts?: SaveOptions) {
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
