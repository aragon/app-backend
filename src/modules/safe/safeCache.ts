/**
 * Shared state for Safe body reads: the cached payloads and the hourly upstream-call counter.
 *
 * **Why in-process is correct here.** A per-process cache is normally wrong for this job - it
 * multiplies upstream calls by worker count instead of dividing them. That is why
 * `crossChainGasCache` is in Mongo. It does not apply, because every Safe read is answered by
 * `aragon-gateway`, which runs as a single `fork`-mode process (`pm2.config.js`) behind one RabbitMQ
 * queue. Every viewer of every Safe, from every `aragon-api` worker, funnels through this one map -
 * so cost already scales with Safes rather than with viewers, which is the entire point of the
 * cache. A collection, a TTL index and a migration would buy only survival across a restart, and a
 * cold cache after a restart costs one call per Safe.
 *
 * If the gateway is ever scaled out, this is the file to move to Mongo, and the property to preserve
 * is "one upstream call per Safe per TTL", not the storage.
 *
 * Two windows per entry, as in `crossChainGasCache`: `expiresAt` is when a payload stops being
 * current, `purgeAt` is when it stops existing. In the gap it is served flagged `meta.stale` -
 * an old queue beats a dead signing UI.
 */

import config from '@config'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'safe-cache' })

interface ICacheEntry {
  value: unknown
  expiresAt: number
  purgeAt: number
}

const entries = new Map<string, ICacheEntry>()

let budgetHour = ''
let budgetCount = 0

/**
 * Keep the map bounded. `/v2` is unauthenticated, so the key space is caller-supplied: without a cap
 * a stream of requests for random addresses is a memory-exhaustion surface, not merely a low hit
 * rate. Expired entries go first; if that is not enough, the oldest insertions do, which a `Map`
 * hands over in order for free.
 */
function evict(now: number) {
  if (entries.size <= config.SAFE_API.MAX_CACHE_ENTRIES) return

  for (const [key, entry] of entries) {
    if (entry.purgeAt <= now) entries.delete(key)
  }

  for (const key of entries.keys()) {
    if (entries.size <= config.SAFE_API.MAX_CACHE_ENTRIES) break

    entries.delete(key)
  }
}

const SafeCacheModule = {
  /**
   * The id of one cached read.
   *
   * `page` keeps paginated queue reads apart. The current nonce is deliberately *not* part of the
   * key: a server-side `nonce__gte` filter would orphan every entry the moment the nonce advances,
   * and the client derives liveness from the nonce it already holds.
   */
  key(network: string, address: string, kind: string, page = ''): string {
    return `safe|${network}|${address}|${kind}${page ? `|${page}` : ''}`
  },

  /** `fresh` says whether the payload is still inside its ttl. `null` means nothing usable is left. */
  read<T>(key: string, now: number): { result: T; fresh: boolean } | null {
    const entry = entries.get(key)
    if (!entry) return null

    if (entry.purgeAt <= now) return null

    return { result: entry.value as T, fresh: entry.expiresAt > now }
  },

  /**
   * Return an expired payload for a degraded queue response. The budget-exhaustion rule deliberately
   * serves stale beyond the normal window rather than blocking signing; bounded eviction is what
   * eventually makes old data genuinely gone.
   */
  readExpired<T>(key: string, now: number): { result: T; fresh: boolean } | null {
    const entry = entries.get(key)
    if (!entry || entry.purgeAt > now) return null

    return { result: entry.value as T, fresh: false }
  },

  write(key: string, value: unknown, now: number, ttlMs: number, staleWindowMs: number): void {
    // Re-inserted rather than mutated, so the entry moves to the back of the eviction order.
    entries.delete(key)
    entries.set(key, { value, expiresAt: now + ttlMs, purgeAt: now + ttlMs + staleWindowMs })

    evict(now)
  },

  /**
   * Count one upstream Safe API call against the current hour. `false` means the hour is used up.
   *
   * Global only, on purpose: a per-Safe bucket would throttle a popular DAO exactly when the shared
   * cache is doing the most good. The cap exists to stop a runaway loop, not to ration a bill - the
   * monthly ceiling is purchasable and the MVP deliverable is measurement, not enforcement.
   */
  consumeBudget(now: number): boolean {
    const hour = new Date(now).toISOString().slice(0, 13)

    if (hour !== budgetHour) {
      budgetHour = hour
      budgetCount = 0
    }

    budgetCount += 1

    if (budgetCount > config.SAFE_API.BUDGET_GLOBAL_PER_HOUR) {
      logger.warn('Safe: global hourly budget exhausted', llo({ hour, count: budgetCount }))
      return false
    }

    return true
  },

  /** Test seam. The cache and the counter are module state, so a spec needs a way back to zero. */
  reset(): void {
    entries.clear()
    budgetHour = ''
    budgetCount = 0
  },
}

export default SafeCacheModule
