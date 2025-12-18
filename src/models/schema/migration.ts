import { assert } from '@errors'
import { utcDateProp } from '@models/utils/models'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import { ICollectionNames, IMigrationStatus } from '@types'
import * as _ from 'lodash'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.Migration

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
@index({ status: 1 })
@index({ executedAt: -1 })
export default class Migration extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public filename!: string

  @prop({ type: () => String, enum: IMigrationStatus, default: IMigrationStatus.PENDING })
  public status!: IMigrationStatus

  @utcDateProp({ default: null })
  public executedAt!: Date | null

  @utcDateProp({ default: null })
  public startedAt!: Date | null

  @prop({ type: () => Number, default: null })
  public executionTimeMs!: number | null

  @prop({ type: () => String, default: null })
  public error!: string | null

  @prop({ type: () => String, default: null })
  public errorStack!: string | null

  static async create(rawData: Partial<Migration>, tOpts?: SaveOptions) {
    assert(!!rawData.filename, 'filename is required')
    const data = new this(rawData)
    return data.save(tOpts)
  }

  static async findByFilename(filename: string, tOpts?: SaveOptions) {
    return await this.findOne({ filename }, null, tOpts)
  }

  static async findPendingMigrations(tOpts?: SaveOptions) {
    return await this.find({ status: IMigrationStatus.PENDING }, null, {
      sort: { filename: 1 },
      ...tOpts,
    })
  }

  static async findExecutedMigrations(tOpts?: SaveOptions) {
    return await this.find({ status: { $in: [IMigrationStatus.COMPLETED, IMigrationStatus.FAILED] } }, null, {
      sort: { executedAt: -1 },
      ...tOpts,
    })
  }

  static async getLastExecutedMigration(tOpts?: SaveOptions) {
    return await this.findOne({ status: IMigrationStatus.COMPLETED }, null, { sort: { executedAt: -1 }, ...tOpts })
  }

  async markAsRunning(tOpts?: SaveOptions) {
    this.status = IMigrationStatus.RUNNING
    this.startedAt = new Date()
    return this.save(tOpts)
  }

  async markAsCompleted(tOpts?: SaveOptions) {
    this.status = IMigrationStatus.COMPLETED
    this.executedAt = new Date()
    if (this.startedAt) {
      this.executionTimeMs = Date.now() - this.startedAt.getTime()
    }
    this.error = null
    this.errorStack = null
    return this.save(tOpts)
  }

  async markAsFailed(error: Error, tOpts?: SaveOptions) {
    this.status = IMigrationStatus.FAILED
    this.executedAt = new Date()
    if (this.startedAt) {
      this.executionTimeMs = Date.now() - this.startedAt.getTime()
    }
    this.error = error.message
    this.errorStack = error.stack || null
    return this.save(tOpts)
  }

  filterKeys(keys: string[] = []) {
    const obj = this.toObject()
    const filtered = _.omit(obj, '_id', '__v')
    return keys.length ? _.pick(filtered, keys) : filtered
  }
}
