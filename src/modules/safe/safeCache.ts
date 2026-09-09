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

const llo = logger.logMeta.bind(null, { service: 'safe-cache' })

const SafeCacheModule = {
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
   */
  async consumeBudget(now: number): Promise<boolean> {
    try {
      const allowed = await Models.SafeCache.consumeBudget(
        Models.SafeCache.globalBudgetId(now),
        config.SAFE_API.BUDGET_GLOBAL_PER_HOUR,
        now,
      )

      if (!allowed) logger.warn('Safe: global hourly budget exhausted', llo({}))

      return allowed
    } catch (error) {
      logger.error('Safe: budget check failed, allowing the call', llo({ error }))
      return true
    }
  },
}

export default SafeCacheModule
