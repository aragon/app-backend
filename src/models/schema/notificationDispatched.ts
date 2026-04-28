import { index, modelOptions, prop } from '@typegoose/typegoose'
import { ICollectionNames } from '@types'
import { Model, type SaveOptions } from 'mongoose'

const customName = ICollectionNames.NotificationDispatched

/**
 * Per-`(eventId, telegramUserId)` ledger that prevents duplicate notification
 * sends when RabbitMQ redelivers a message after a worker crash.
 *
 * - `id` is `<eventId>-<telegramUserId>` and is the unique key (`E11000` on
 *   re-insert is the dedup signal).
 * - `expiresAt` drives the Mongo TTL index — old rows reap automatically so
 *   the collection stays bounded.
 */
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
@index({ expiresAt: 1 }, { expireAfterSeconds: 0 })
export default class NotificationDispatched extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true })
  public eventId!: string

  @prop({ type: () => Number, required: true })
  public telegramUserId!: number

  @prop({ type: () => Date, required: true })
  public expiresAt!: Date

  static getEntityId(eventId: string, telegramUserId: number): string {
    return `${eventId}-${telegramUserId}`
  }

  /**
   * Tries to record a fresh send. Returns `true` if this is the first time
   * we've seen the (event, user) pair (caller should send), or `false` if
   * we've already recorded it (caller should skip).
   */
  static async claim(
    eventId: string,
    telegramUserId: number,
    ttlSeconds: number,
    tOpts?: SaveOptions,
  ): Promise<boolean> {
    const id = this.getEntityId(eventId, telegramUserId)
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000)
    try {
      await this.create([{ id, eventId, telegramUserId, expiresAt }], tOpts)
      return true
    } catch (err: any) {
      if (err?.code === 11000) return false
      throw err
    }
  }
}
