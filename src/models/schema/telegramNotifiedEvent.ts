import { index, modelOptions, prop } from '@typegoose/typegoose'
import { ICollectionNames } from '@types'
import { Model } from 'mongoose'

const customName = ICollectionNames.TelegramNotifiedEvent

/**
 * At-most-once marker for scheduled telegram notifications (e.g. the
 * `proposal.ending-soon` reminder). A notification is "claimed" by inserting
 * its key against the unique index; a duplicate-key error means an earlier
 * run already published it. Markers expire after 30 days.
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
@index({ createdAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60 })
export default class TelegramNotifiedEvent extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  /** Returns `true` when this run claimed the key, `false` when it was already sent. */
  static async claim(id: string): Promise<boolean> {
    try {
      await new this({ id }).save()
      return true
    } catch (error: any) {
      if (error?.code === 11000) return false
      throw error
    }
  }
}
