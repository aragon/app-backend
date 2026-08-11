/**
 * Shared state for the cross-chain gas estimation.
 *
 * Two kinds of document are stored here:
 *
 * - `cache`: the result of one exact request, keyed by network + controller + destination chain +
 *   hash of the actions. It answers "did we already measure this one?". It is in Mongo and not in
 *   memory because each worker has its own memory, so the same request gets paid many times.
 * - `budget`: how many paid simulations we did in one hour. This is a counter, not a cache. When
 *   the actions change on every request the cache never hits, so only a counter can stop it.
 *
 * Both expire, so one TTL index on `purgeAt` cleans up both.
 */

import { index, modelOptions, prop, Severity } from '@typegoose/typegoose'
import { type ICrossChainGasEstimate, ICrossChainGasCacheKind, ICollectionNames, type NetworksEnum } from '@types'
import { Model, Schema } from 'mongoose'

const customName = ICollectionNames.CrossChainGasCache

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
    allowMixed: Severity.ALLOW,
  },
})
// Mongo deletes the document at `purgeAt`. For cache documents `purgeAt` is later than `expiresAt`
// on purpose. In that gap the measurement is old, but we can still return it when the budget for
// the hour is finished.
@index({ purgeAt: 1 }, { expireAfterSeconds: 0 })
export default class CrossChainGasCache extends Model {
  /** The document key. `cacheKey()` for estimates, `budgetId()` for counters. */
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: ICrossChainGasCacheKind, required: true })
  public kind!: ICrossChainGasCacheKind

  /** Cache documents only. */
  @prop({ type: () => Schema.Types.Mixed, _id: false, default: null })
  public result?: ICrossChainGasEstimate | null

  /** Cache documents only. When the measurement stops being served as current. */
  @prop({ type: () => Date, default: null })
  public expiresAt?: Date | null

  /** Budget documents only. Paid simulations charged to this bucket. */
  @prop({ type: () => Number, default: 0 })
  public count!: number

  @prop({ type: () => Date, required: true })
  public purgeAt!: Date

  /** The hour a budget bucket covers, e.g. `2026-08-09T14`. */
  static hourBucket(now: number): string {
    return new Date(now).toISOString().slice(0, 13)
  }

  static globalBudgetId(now: number): string {
    return `budget|global|${this.hourBucket(now)}`
  }

  static controllerBudgetId(network: NetworksEnum, controllerAddress: string, now: number): string {
    return `budget|${network}|${controllerAddress}|${this.hourBucket(now)}`
  }

  /**
   * Add one paid simulation to a bucket and say if it is still inside the limit.
   *
   * We read first and only write when the bucket still has room. Without that read every refused
   * request would still write to the same document, so a spammer we are already refusing would
   * keep one document hot in Mongo. Now a refused request only costs one read on the `id` index.
   *
   * Two calls can read the same count at the same time and both write, so the count can finish one
   * or two over the limit. That is bounded by how many calls are in flight, not by the traffic, and
   * one extra simulation is cheaper than a slower path to stop it.
   */
  static async consumeBudget(id: string, limit: number, now: number): Promise<boolean> {
    const current = await this.findOne({ id }, { count: 1 })
    if (current && current.count >= limit) return false

    // Two hours, so a counter is never deleted while the hour it counts is still being used.
    const purgeAt = new Date(now + 2 * 60 * 60 * 1000)

    const doc = await this.findOneAndUpdate(
      { id },
      {
        $inc: { count: 1 },
        $setOnInsert: { id, kind: ICrossChainGasCacheKind.budget, purgeAt },
      },
      { returnDocument: 'after', upsert: true },
    )

    return (doc?.count ?? 1) <= limit
  }

  /**
   * Read a saved measurement. `fresh` says if it is still inside the ttl. The caller decides if an
   * old one is good enough.
   *
   * `purgeAt` is in the filter and not only in the TTL index. Mongo runs the TTL sweep in the
   * background, and it is only created when `MONGO_DB_SYNC_MODELS` is on, so we cannot trust it to
   * decide what we return. Without this filter we could give back a measurement from months ago.
   */
  static async readEstimate(
    id: string,
    now: number,
  ): Promise<{ result: ICrossChainGasEstimate; fresh: boolean } | null> {
    const doc = await this.findOne({ id, kind: ICrossChainGasCacheKind.cache, purgeAt: { $gt: new Date(now) } })
    if (!doc?.result) return null

    return { result: doc.result, fresh: !!doc.expiresAt && doc.expiresAt.getTime() > now }
  }

  static async writeEstimate(
    id: string,
    result: ICrossChainGasEstimate,
    now: number,
    ttlMs: number,
    staleWindowMs: number,
  ): Promise<void> {
    await this.findOneAndUpdate(
      { id },
      {
        $set: {
          kind: ICrossChainGasCacheKind.cache,
          result,
          expiresAt: new Date(now + ttlMs),
          purgeAt: new Date(now + ttlMs + staleWindowMs),
        },
        $setOnInsert: { id },
      },
      { upsert: true },
    )
  }
}
