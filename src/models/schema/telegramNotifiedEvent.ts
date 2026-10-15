import { index, modelOptions, prop } from '@typegoose/typegoose'
import { ICollectionNames, TELEGRAM_NOTIFICATION_MARKER_RETENTION_DAYS } from '@types'
import { Model } from 'mongoose'

const customName = ICollectionNames.TelegramNotifiedEvent

/**
 * Deduplication marker for scheduled events, completed dispatches, and
 * per-recipient deliveries. A marker is "claimed" by inserting its key against
 * the unique index; a duplicate-key error means it was already handled.
 * Markers expire after 30 days.
 */
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
@index({ createdAt: 1 }, { expireAfterSeconds: TELEGRAM_NOTIFICATION_MARKER_RETENTION_DAYS * 24 * 60 * 60 })
@index({ recipientHash: 1 })
export default class TelegramNotifiedEvent extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  /** Pseudonymous lookup key used only to honor `/mydata` and `/forget`. */
  @prop({ type: () => String })
  public recipientHash?: string

  /** Returns `true` when this run claimed the key, `false` when it was already sent. */
  static async claim(id: string, recipientHash?: string): Promise<boolean> {
    try {
      await new this({ id, recipientHash }).save()
      return true
    } catch (error: any) {
      if (error?.code === 11000) return false
      throw error
    }
  }
}
