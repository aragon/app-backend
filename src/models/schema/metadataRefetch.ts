import { assert } from '@errors'
import logger from '@logger'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import { ICollectionNames, MetadataEntityType, MetadataRefetchStatus, NetworksEnum } from '@types'
import { Model, type SaveOptions } from 'mongoose'

const llo = logger.logMeta.bind(null, { service: 'models:MetadataRefetch' })
const customName = ICollectionNames.MetadataRefetch

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
@index({ status: 1, lastAttemptAt: 1, retryCount: 1 })
@index({ entityType: 1, entityId: 1, network: 1 })
export default class MetadataRefetch extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public metadataUri!: string

  @prop({ type: () => String, enum: MetadataEntityType, required: true })
  public entityType!: MetadataEntityType

  @prop({ type: () => String, required: true })
  public entityId!: string

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => Number, default: 0 })
  public retryCount!: number

  @prop({ type: () => Date, default: null })
  public lastAttemptAt!: Date | null

  @prop({ type: () => String, enum: MetadataRefetchStatus, default: MetadataRefetchStatus.pending })
  public status!: MetadataRefetchStatus

  static getEntityId(params: {
    metadataUri: string
    entityType: MetadataEntityType
    entityId: string
    network: NetworksEnum
  }) {
    return `${params.network}-${params.entityType}-${params.entityId}-${params.metadataUri}`
  }

  static async create(rawData: Partial<MetadataRefetch> = {} as Partial<MetadataRefetch>, tOpts?: SaveOptions) {
    assert(!!rawData.metadataUri, 'metadataUri is required')
    assert(!!rawData.entityType, 'entityType is required')
    assert(!!rawData.entityId, 'entityId is required')
    assert(!!rawData.network, 'network is required')

    if (!rawData.id) {
      rawData.id = this.getEntityId({
        metadataUri: rawData.metadataUri!,
        entityType: rawData.entityType!,
        entityId: rawData.entityId!,
        network: rawData.network!,
      })
    }

    const data = new this(rawData)
    return await data.save(tOpts)
  }

  static async findOrCreate(rawData: Partial<MetadataRefetch>, tOpts?: SaveOptions): Promise<MetadataRefetch> {
    const entityId = this.getEntityId({
      metadataUri: rawData.metadataUri!,
      entityType: rawData.entityType!,
      entityId: rawData.entityId!,
      network: rawData.network!,
    })

    // Use findOneAndUpdate with upsert to avoid race conditions
    const result = await this.findOneAndUpdate(
      { id: entityId },
      {
        $setOnInsert: {
          ...rawData,
          id: entityId,
          status: MetadataRefetchStatus.pending,
          retryCount: 0,
        },
      },
      { new: true, upsert: true, ...tOpts },
    )

    return result as MetadataRefetch
  }

  static async findPendingForRetry(intervalMs: number, tOpts?: SaveOptions): Promise<MetadataRefetch[]> {
    const cutoffTime = new Date(Date.now() - intervalMs)

    return await this.find(
      {
        status: MetadataRefetchStatus.pending,
        retryCount: { $gt: 0 },
        lastAttemptAt: { $lt: cutoffTime },
      },
      null,
      tOpts,
    )
  }

  static async findByEntityId(entityId: string, tOpts?: SaveOptions): Promise<MetadataRefetch | null> {
    return await this.findOne({ id: entityId }, null, tOpts)
  }

  async markAttempt(tOpts?: SaveOptions): Promise<MetadataRefetch | null> {
    const updated = await this.model(customName).findOneAndUpdate(
      { _id: this._id },
      { $inc: { retryCount: 1 }, $set: { lastAttemptAt: new Date() } },
      { new: true, ...tOpts },
    )

    if (!updated) {
      logger.warn('MetadataRefetch not found for markAttempt', llo({ id: this.id }))
      return null
    }

    logger.verbose('MetadataRefetch markAttempt', llo({ id: updated.id, retryCount: updated.retryCount }))
    return updated as MetadataRefetch
  }

  async markCompleted(tOpts?: SaveOptions): Promise<MetadataRefetch> {
    this.status = MetadataRefetchStatus.completed
    logger.verbose('MetadataRefetch markCompleted', llo({ id: this.id }))
    return await this.save(tOpts)
  }

  async markDiscarded(tOpts?: SaveOptions): Promise<MetadataRefetch> {
    this.status = MetadataRefetchStatus.discarded
    logger.verbose('MetadataRefetch markDiscarded', llo({ id: this.id }))
    return await this.save(tOpts)
  }

  async reload(tOpts?: SaveOptions): Promise<MetadataRefetch> {
    return await this.model(customName).findById(this._id, tOpts)
  }
}
