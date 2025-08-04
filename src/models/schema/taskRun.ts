import { index, modelOptions, prop, Severity } from '@typegoose/typegoose'
import { Model, type SaveOptions, Schema } from 'mongoose'
import * as _ from 'lodash'
import { ICollectionNames, IEnumTaskStatus } from '@types'
import { v4 as uuidv4 } from 'uuid'

const customName = ICollectionNames.TaskRun

class Task {
  @prop({ type: () => String, required: true })
  public taskName!: string

  @prop({ type: () => Schema.Types.Mixed, _id: false, default: null })
  public params?: any

  @prop({ type: () => Date })
  public startAt!: Date

  @prop({ type: () => Date })
  public endAt?: Date

  @prop({ type: () => Number, required: true })
  public position!: number

  @prop({ type: () => String, enum: IEnumTaskStatus, required: true })
  public status!: IEnumTaskStatus

  @prop({ type: () => Number })
  public batchSize?: number

  @prop({ type: () => Number })
  public concurrency?: number

  @prop({ type: () => String })
  public error?: string
}

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
    allowMixed: Severity.WARN,
  },
})
@index({ id: 1 }, { unique: true })
@index({ serviceName: 1, createdAt: -1 })
@index({ createdAt: 1 })
export default class TaskRun extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public serviceName!: string

  @prop({ type: () => Date, required: true })
  public startAt!: Date

  @prop({ type: () => Date })
  public endAt?: Date

  @prop({ type: () => [Task], default: [] })
  public tasks!: Task[]

  static async create(rawData: Partial<TaskRun>, tOpts?: SaveOptions) {
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

  static async getRecentRuns(serviceName: string, limit: number = 10, skip: number = 0) {
    return await this.find({ serviceName }).sort({ createdAt: -1 }).limit(limit).skip(skip).select('-tasks.params')
  }

  static async getTaskStatistics(serviceName: string, days: number = 7) {
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days)

    return await this.aggregate([
      {
        $match: {
          serviceName,
          createdAt: { $gte: startDate },
        },
      },
      {
        $unwind: '$tasks',
      },
      {
        $group: {
          _id: {
            status: '$tasks.status',
            taskName: '$tasks.taskName',
          },
          count: { $sum: 1 },
          avgDuration: {
            $avg: {
              $subtract: ['$tasks.endAt', '$tasks.startAt'],
            },
          },
        },
      },
    ])
  }

  async update(params: Partial<TaskRun>, tOpts?: SaveOptions) {
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
