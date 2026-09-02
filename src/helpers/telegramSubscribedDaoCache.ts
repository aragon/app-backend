import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import { type HexAddress, ITelegramSubscriptionStatus, type NetworksEnum } from '@types'

const llo = logger.logMeta.bind(null, { service: 'helper:telegramSubscribedDaoCache' })

/**
 * Set of organizations with an active Telegram subscriber, reloaded at most
 * once per TTL. A failed reload keeps the previous set so indexing never
 * waits on it; a new subscriber can miss events created inside one TTL.
 */
class TelegramSubscribedDaoCache {
  private daoIds = new Set<string>()
  private loadedAt = 0
  private loading: Promise<void> | null = null

  async has(network: NetworksEnum, daoAddress: HexAddress): Promise<boolean> {
    await this.refreshIfStale()
    return this.daoIds.has(Models.TelegramSubscription.getDaoId({ network, daoAddress }))
  }

  reset(): void {
    this.daoIds = new Set()
    this.loadedAt = 0
  }

  private async refreshIfStale(): Promise<void> {
    if (Date.now() - this.loadedAt < config.SERVICES.ARAGON_TELEGRAM.SUBSCRIBED_DAO_CACHE_TTL_MS) return
    if (!this.loading) {
      this.loading = this.load().finally(() => {
        this.loading = null
      })
    }
    await this.loading
  }

  private async load(): Promise<void> {
    try {
      const daoIds: string[] = await Models.TelegramSubscription.distinct('subscriptions.daoId', {
        status: ITelegramSubscriptionStatus.Active,
      })
      this.daoIds = new Set(daoIds)
    } catch (error) {
      logger.warn('telegramSubscribedDaoCache: reload failed, keeping previous set', llo({ error }))
    }
    this.loadedAt = Date.now()
  }
}

export default new TelegramSubscribedDaoCache()
