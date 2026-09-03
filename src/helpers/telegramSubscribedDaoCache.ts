import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import { type HexAddress, ITelegramSubscriptionStatus, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helper:telegramSubscribedDaoCache' })

/**
 * Set of organizations with an active Telegram subscriber, reloaded at most
 * once per TTL. A failed reload logs and keeps the previous set instead of
 * throwing; a new subscriber can miss events created inside one TTL.
 *
 * `refresh` does the database read, `has` only looks at the loaded set, so
 * callers can refresh before opening a transaction and keep the scan out of it.
 */
class TelegramSubscribedDaoCache {
  private daoIds = new Set<string>()
  private loadedAt = 0
  private loading: Promise<void> | null = null
  private generation = 0

  async refresh(): Promise<void> {
    if (Date.now() - this.loadedAt < config.SERVICES.ARAGON_TELEGRAM.SUBSCRIBED_DAO_CACHE_TTL_MS) return
    if (!this.loading) {
      const loading = this.load().finally(() => {
        if (this.loading === loading) this.loading = null
      })
      this.loading = loading
    }
    await this.loading
  }

  has(network: NetworksEnum, daoAddress: HexAddress): boolean {
    return this.daoIds.has(Models.TelegramSubscription.getDaoId({ network, daoAddress }))
  }

  reset(): void {
    this.generation++
    this.daoIds = new Set()
    this.loadedAt = 0
    this.loading = null
  }

  private async load(): Promise<void> {
    const generation = this.generation
    try {
      const daoIds: string[] = await Models.TelegramSubscription.distinct('subscriptions.daoId', {
        status: ITelegramSubscriptionStatus.Active,
      })
      if (generation !== this.generation) return
      this.daoIds = new Set(daoIds)
    } catch (error) {
      if (generation !== this.generation) return
      logger.warn('telegramSubscribedDaoCache: reload failed, keeping previous set', llo({ error }))
    }
    this.loadedAt = Date.now()
  }
}

export default new TelegramSubscribedDaoCache()
