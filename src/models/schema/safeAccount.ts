/**
 * Per-Safe sync state: when the queue and the history were last pulled into the store. Later this
 * doubles as the tracked-Safe list for workspaces.
 */

import { modelOptions, prop } from '@typegoose/typegoose'
import { type HexAddress, ICollectionNames, NetworksEnum } from '@types'
import { Model } from 'mongoose'

const customName = ICollectionNames.SafeAccount

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
export default class SafeAccount extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, required: true, enum: NetworksEnum })
  public network!: NetworksEnum

  @prop({ type: () => String, required: true })
  public safeAddress!: HexAddress

  /** When the queue was last pulled into the store. Null before the first pull. */
  @prop({ type: () => Date, default: null })
  public queueFetchedAt!: Date | null

  /** When history page 0 was last pulled into the store. Null before the first pull. */
  @prop({ type: () => Date, default: null })
  public historyFetchedAt!: Date | null

  /** The last queue pull fit in one page. False means rows past the page are not in the store. */
  @prop({ type: () => Boolean, default: null })
  public queueComplete!: boolean | null

  static buildId(network: NetworksEnum, safeAddress: string): string {
    return `${network}-${safeAddress}`
  }

  /** The row for a Safe, created on first sight so every later stamp is a plain forward-only `$set`. */
  static async ensure(network: NetworksEnum, safeAddress: HexAddress) {
    const id = this.buildId(network, safeAddress)
    return await this.findOneAndUpdate(
      { id },
      { $setOnInsert: { network, safeAddress } },
      { upsert: true, new: true },
    ).lean()
  }

  /** Only moves forward, so an older page cannot pair its flags with a newer stamp. */
  static async stamp(
    id: string,
    field: 'queueFetchedAt' | 'historyFetchedAt',
    at: number,
    extra: Record<string, unknown> = {},
  ) {
    return await this.updateOne(
      { id, $or: [{ [field]: null }, { [field]: { $lt: new Date(at) } }] },
      { $set: { [field]: new Date(at), ...extra } },
    )
  }
}
