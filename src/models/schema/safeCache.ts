/**
 * Shared Mongo state for Safe body reads.
 *
 * The collection stores cache payloads and the global hourly upstream-call counter. Mongo is required
 * here because `aragon-api` can run in multiple workers/containers and all of them must observe the
 * same Safe queue cache and quota.
 *
 * `expiresAt` ends the fresh window. `purgeAt` ends the normal stale window and is also the TTL
 * boundary. `readExpired` intentionally omits the purge filter: when the hourly budget is exhausted,
 * a payload that Mongo's TTL worker has not deleted yet is still useful to the governance UI and is
 * returned with `meta.stale`. Once TTL has removed it, the data is genuinely gone and the request
 * fails.
 */

import { index, modelOptions, prop, Severity } from '@typegoose/typegoose'
import { ICollectionNames, ISafeCacheKind, type ISafeReadKind, type NetworksEnum } from '@types'
import { Model, Schema } from 'mongoose'

const customName = ICollectionNames.SafeCache

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
@index({ purgeAt: 1 }, { expireAfterSeconds: 0 })
export default class SafeCache extends Model {
  @prop({ type: () => String, required: true, unique: true })
  public id!: string

  @prop({ type: () => String, enum: ISafeCacheKind, required: true })
  public kind!: ISafeCacheKind

  /** Cache documents only. */
  @prop({ type: () => Schema.Types.Mixed, _id: false, default: null })
  public result?: unknown

  /** Cache documents only. When the payload stops being served as current. */
  @prop({ type: () => Date, default: null })
  public expiresAt?: Date | null

  /** Budget documents only. Upstream calls charged to this bucket. */
  @prop({ type: () => Number, default: 0 })
  public count!: number

  @prop({ type: () => Date, required: true })
  public purgeAt!: Date

  /** The hour a budget bucket covers, e.g. `2026-08-26T14`. */
  static hourBucket(now: number): string {
    return new Date(now).toISOString().slice(0, 13)
  }

  static cacheKey(network: NetworksEnum, address: string, kind: ISafeReadKind, page = ''): string {
    return `safe|${network}|${address}|${kind}${page ? `|${page}` : ''}`
  }

  static globalBudgetId(now: number): string {
    return `safe|budget|global|${this.hourBucket(now)}`
  }

  /**
   * Add one upstream call to the current hour, charged only while the bucket is below the limit.
   *
   * A `limit` of zero is a kill switch and refuses before any write. Otherwise a full bucket is
   * refused with a single read - the hot path once the hour is spent, and it keeps a refused caller
   * from churning the document. The charge itself is one atomic update conditional on `count < limit`:
   * even when several callers clear the read at once, only those the update still finds under the
   * limit increment, so a refused call never pushes the counter past its share into the remainder
   * reserved for nonce allocation. If the bucket fills between the read and the update, the
   * conditional matches nothing and the `id`-unique upsert collides, which is caught as a refusal.
   */
  static async consumeBudget(id: string, limit: number, now: number): Promise<boolean> {
    if (limit < 1) return false

    const current = await this.findOne({ id }, { count: 1 })
    if (current && current.count >= limit) return false

    const purgeAt = new Date(now + 2 * 60 * 60 * 1000)
    try {
      const doc = await this.findOneAndUpdate(
        { id, count: { $lt: limit } },
        { $inc: { count: 1 }, $setOnInsert: { id, kind: ISafeCacheKind.budget, purgeAt } },
        { returnDocument: 'after', upsert: true },
      )
      return doc != null
    } catch (error) {
      // The conditional matched nothing because the bucket filled between the read and the update,
      // so the upsert tried to insert a second document with this `id` and hit the unique index.
      // No slot was granted and nothing was incremented.
      if (error != null && typeof error === 'object' && 'code' in error && error.code === 11000) return false

      throw error
    }
  }

  /**
   * Return one unit to the current hour. Never drops below zero: a refund racing the hour rollover
   * must not hand the next bucket a free call.
   */
  static async refundBudget(id: string): Promise<void> {
    await this.findOneAndUpdate({ id, count: { $gt: 0 } }, { $inc: { count: -1 } })
  }

  /** Fresh or normal-stale cache read. Query freshness is enforced independently of Mongo TTL. */
  static async read<T>(id: string, now: number): Promise<{ result: T; fresh: boolean } | null> {
    const doc = await this.findOne({ id, kind: ISafeCacheKind.cache, purgeAt: { $gt: new Date(now) } })
    if (doc?.result == null) return null

    return { result: doc.result as T, fresh: !!doc.expiresAt && doc.expiresAt.getTime() > now }
  }

  /**
   * Read a payload after its normal stale window for a degraded queue response. The TTL index may
   * already have deleted it, which is the intended "even stale data is gone" failure boundary.
   */
  static async readExpired<T>(id: string, now: number): Promise<{ result: T; fresh: boolean } | null> {
    const doc = await this.findOne({ id, kind: ISafeCacheKind.cache, expiresAt: { $lte: new Date(now) } })
    if (doc?.result == null) return null

    return { result: doc.result as T, fresh: false }
  }

  static async write(id: string, result: unknown, now: number, ttlMs: number, staleWindowMs: number): Promise<void> {
    await this.findOneAndUpdate(
      { id },
      {
        $set: {
          kind: ISafeCacheKind.cache,
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
