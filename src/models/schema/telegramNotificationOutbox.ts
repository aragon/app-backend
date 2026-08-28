import { assert } from '@errors'
import { index, modelOptions, prop } from '@typegoose/typegoose'
import {
  type HexAddress,
  ICollectionNames,
  type IQueueTelegramNotification,
  ITelegramNotificationEvent,
  TELEGRAM_NOTIFICATION_OUTBOX_RETENTION_DAYS,
  TelegramNotificationOutboxStatus,
  type TelegramNotificationOutboxStatus as TelegramNotificationOutboxStatusType,
  NetworksEnum,
} from '@types'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.TelegramNotificationOutbox

@modelOptions({
  schemaOptions: {
    id: false,
    timestamps: true,
    collection: customName,
  },
  options: {
    customName,
  },
})
@index({ status: 1, nextAttemptAt: 1 })
@index({ deleteAfter: 1 }, { expireAfterSeconds: 0 })
export default class TelegramNotificationOutbox extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: ITelegramNotificationEvent, required: true })
  public event!: ITelegramNotificationEvent

  @prop({ type: () => String, enum: NetworksEnum, required: true })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public daoAddress!: HexAddress

  @prop({ type: () => String, required: true })
  public proposalId!: string

  @prop({
    type: () => String,
    enum: Object.values(TelegramNotificationOutboxStatus),
    default: TelegramNotificationOutboxStatus.Pending,
  })
  public status!: TelegramNotificationOutboxStatusType

  @prop({ type: () => Number, default: 0 })
  public attemptCount!: number

  @prop({ type: () => Date, default: () => new Date() })
  public nextAttemptAt!: Date

  @prop({ type: () => Date })
  public lastAttemptAt?: Date

  @prop({ type: () => String })
  public lastError?: string

  @prop({ type: () => Date })
  public publishedAt?: Date

  /** Set only after publishing so pending messages are never TTL-deleted. */
  @prop({ type: () => Date })
  public deleteAfter?: Date

  static async enqueue(payload: IQueueTelegramNotification, tOpts?: SaveOptions): Promise<TelegramNotificationOutbox> {
    assert(!!payload.id, 'Telegram notification id is required')
    assert(!!payload.proposalId, 'Telegram proposalId is required')

    const record = await this.findOneAndUpdate(
      { id: payload.id },
      {
        $setOnInsert: {
          ...payload,
          status: TelegramNotificationOutboxStatus.Pending,
          attemptCount: 0,
          nextAttemptAt: new Date(),
        },
      },
      { returnDocument: 'after', upsert: true, ...tOpts },
    )

    return record as TelegramNotificationOutbox
  }

  static async findReadyToPublish(limit: number, tOpts?: SaveOptions): Promise<TelegramNotificationOutbox[]> {
    return await this.find(
      {
        status: TelegramNotificationOutboxStatus.Pending,
        nextAttemptAt: { $lte: new Date() },
      },
      null,
      { sort: { nextAttemptAt: 1, createdAt: 1 }, limit, ...tOpts },
    )
  }

  toQueuePayload(): IQueueTelegramNotification {
    return {
      id: this.id,
      event: this.event,
      network: this.network,
      daoAddress: this.daoAddress,
      proposalId: this.proposalId,
    }
  }

  async markPublished(tOpts?: SaveOptions): Promise<TelegramNotificationOutbox | null> {
    const now = new Date()
    return (await this.model(customName).findByIdAndUpdate(
      this._id,
      {
        $set: {
          status: TelegramNotificationOutboxStatus.Published,
          publishedAt: now,
          deleteAfter: new Date(now.getTime() + TELEGRAM_NOTIFICATION_OUTBOX_RETENTION_DAYS * 24 * 60 * 60 * 1000),
        },
        $unset: { lastError: 1 },
      },
      { returnDocument: 'after', ...tOpts },
    )) as TelegramNotificationOutbox | null
  }

  async markFailed(
    error: unknown,
    retryDelayMs: number,
    tOpts?: SaveOptions,
  ): Promise<TelegramNotificationOutbox | null> {
    const now = new Date()
    const message = error instanceof Error ? error.message : String(error)
    return (await this.model(customName).findByIdAndUpdate(
      this._id,
      {
        $inc: { attemptCount: 1 },
        $set: {
          lastAttemptAt: now,
          nextAttemptAt: new Date(now.getTime() + retryDelayMs),
          lastError: message.slice(0, 1_000),
        },
      },
      { returnDocument: 'after', ...tOpts },
    )) as TelegramNotificationOutbox | null
  }
}
