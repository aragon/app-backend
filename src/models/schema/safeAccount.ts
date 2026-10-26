/**
 * Per-Safe sync state: when the queue and the history were last pulled into the store, and whether an
 * admin registered the Safe for tracking.
 */

import { index, modelOptions, prop } from '@typegoose/typegoose'
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
@index({ network: 1, tracked: 1 })
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

  /** True only for a Safe an admin registered. */
  @prop({ type: () => Boolean, default: false })
  public tracked!: boolean

  /** Where the transfer crawl starts: the Safe's creation block. */
  @prop({ type: () => Number, default: null })
  public blockNumber!: number | null

  static buildId(network: NetworksEnum, safeAddress: string): string {
    return `${network}-${safeAddress}`
  }

  /** The row for a Safe, created on first sight so every later stamp is a plain forward-only `$set`. */
  static async ensure(network: NetworksEnum, safeAddress: HexAddress) {
    const id = this.buildId(network, safeAddress)
    return await this.findOneAndUpdate(
      { id },
      { $setOnInsert: { network, safeAddress } },
      { upsert: true, returnDocument: 'after' },
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

  static async track(network: NetworksEnum, safeAddress: HexAddress) {
    return this.findOneAndUpdate(
      { id: this.buildId(network, safeAddress) },
      { $set: { tracked: true }, $setOnInsert: { network, safeAddress } },
      { upsert: true, returnDocument: 'after' },
    ).lean()
  }

  static async untrack(network: NetworksEnum, safeAddress: HexAddress): Promise<boolean> {
    const result = await this.updateOne(
      { id: this.buildId(network, safeAddress), tracked: true },
      { $set: { tracked: false } },
    )
    return result.matchedCount > 0
  }

  static async findTracked(network: NetworksEnum, safeAddress: HexAddress) {
    return this.findOne({ id: this.buildId(network, safeAddress), tracked: true }).lean()
  }

  static async findAllTracked(network: NetworksEnum) {
    return await this.find({ network, tracked: true }, { safeAddress: 1 }).lean()
  }
}
