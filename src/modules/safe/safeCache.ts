/**
 * Rules on top of the `SafeCache` Mongo model.
 *
 * Reads fail open: this data drives a governance UI, so a cache outage must not turn a signable
 * queue into an error page. The model enforces freshness in its query and the service decides whether
 * a normal stale result or an expired degraded result is acceptable.
 */

import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import { type NetworksEnum } from '@types'
import { getAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'safe-cache' })
const INFO_NOT_FOUND_TTL_MS = 60_000

const SafeCacheModule = {
  async readInfoNotFound(network: NetworksEnum, address: string, now: number): Promise<boolean> {
    const key = Models.SafeCache.infoNotFoundKey(network, getAddress(address))
    const cached = await SafeCacheModule.read<{ notFound: boolean }>(key, now)
    return cached?.fresh === true && cached.result.notFound === true
  },

  async writeInfoNotFound(network: NetworksEnum, address: string, now: number): Promise<void> {
    const key = Models.SafeCache.infoNotFoundKey(network, getAddress(address))
    await SafeCacheModule.write(key, { notFound: true }, now, INFO_NOT_FOUND_TTL_MS, 0)
  },

  async clearInfoNotFound(network: NetworksEnum, address: string): Promise<void> {
    const key = Models.SafeCache.infoNotFoundKey(network, getAddress(address))
    try {
      await Models.SafeCache.deleteOne({ id: key })
    } catch (error) {
      logger.error('Safe: shared cache delete failed', llo({ key, error }))
    }
  },

  async read<T>(key: string, now: number): Promise<{ result: T; fresh: boolean } | null> {
    try {
      return (await Models.SafeCache.read(key, now)) as { result: T; fresh: boolean } | null
    } catch (error) {
      logger.error('Safe: shared cache read failed', llo({ key, error }))
      return null
    }
  },

  async readExpired<T>(key: string, now: number): Promise<{ result: T; fresh: boolean } | null> {
    try {
      return (await Models.SafeCache.readExpired(key, now)) as { result: T; fresh: boolean } | null
    } catch (error) {
      logger.error('Safe: expired cache read failed', llo({ key, error }))
      return null
    }
  },

  async write(key: string, result: unknown, now: number, ttlMs: number, staleWindowMs: number): Promise<void> {
    try {
      await Models.SafeCache.write(key, result, now, ttlMs, staleWindowMs)
    } catch (error) {
      logger.error('Safe: shared cache write failed', llo({ key, error }))
    }
  },

  /**
   * Global only. A per-Safe bucket would punish a popular DAO exactly when the shared cache is doing
   * the most good. If Mongo is unavailable, allow the call and rely on the limiter while degraded;
   * failing closed would turn a cache outage into a signing outage without protecting a bill.
   *
   * `reserveFor` splits the bucket. Page reads (`queue`, `history`) fail open to stale data, so they
   * are refused early and leave the tail of the budget to `next-nonce`, which has no stale path at
   * all: once it is denied, no Safe transaction can be allocated a nonce on any chain. Without the
   * split, an unauthenticated caller draining the bucket with page reads takes proposal creation
   * offline product-wide while the reads that drained it keep serving.
   */
  async consumeBudget(now: number, reserveFor: 'page' | 'nonce' = 'page'): Promise<boolean> {
    const limit = config.SAFE_API.BUDGET_GLOBAL_PER_HOUR
    const effectiveLimit = reserveFor === 'nonce' ? limit : Math.floor(limit * config.SAFE_API.BUDGET_PAGE_SHARE)

    try {
      const allowed = await Models.SafeCache.consumeBudget(Models.SafeCache.globalBudgetId(now), effectiveLimit, now)

      if (!allowed) logger.warn('Safe: global hourly budget exhausted', llo({ reserveFor, effectiveLimit }))

      return allowed
    } catch (error) {
      logger.error('Safe: budget check failed, allowing the call', llo({ error }))
      return true
    }
  },

  /**
   * Hand a unit back when the call never reached the Safe API.
   *
   * The budget is charged before the limiter is asked, and the limiter drops jobs past its high
   * water mark rather than queueing them. Without a refund a burst can destroy the whole hourly
   * allowance while making a fraction of the upstream calls it was supposed to represent.
   */
  async refundBudget(now: number): Promise<void> {
    try {
      await Models.SafeCache.refundBudget(Models.SafeCache.globalBudgetId(now))
    } catch (error) {
      logger.warn('Safe: budget refund failed', llo({ error }))
    }
  },
}

export default SafeCacheModule
