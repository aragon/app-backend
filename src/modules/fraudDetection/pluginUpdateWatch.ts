import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import type PluginUpdateAlert from '@models/schema/pluginUpdateAlert'
import ProviderModule from '@modules/provider'
import TelegramModule from '@modules/telegram'
import { EnumQueueName, type IQueuePluginUpdateWatch, type IWatchedPluginUpdate, TestNetworks } from '@types'

const llo = logger.logMeta.bind(null, { service: 'plugin-update-watch' })

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export const PluginUpdateWatch = {
  /**
   * Alerts once when an applied plugin update matches a watched rule. The document is keyed by
   * network, plugin and build, so redelivery, replays and backfills never alert twice.
   */
  run: async (params: IQueuePluginUpdateWatch) => {
    if (TestNetworks.includes(params.network)) return null

    const rule = PluginUpdateWatch.findRule(params)
    if (!rule) return null

    const alert = await Models.PluginUpdateAlert.createLog({
      id: `${params.network}-${params.pluginAddress}-${params.toBuild}`,
      ...params,
    })
    if (alert.alertedAt) return alert

    if (!TelegramModule.isConfigured()) {
      logger.warn('PluginUpdateWatch: Telegram not configured, alert skipped', llo({ id: alert.id }))
      return alert
    }

    const initializedVersion = await PluginUpdateWatch.readInitializedVersion(params)
    const level = PluginUpdateWatch.isSettled(initializedVersion, rule) ? 'low' : rule.level

    const claimed: PluginUpdateAlert | null = await Models.PluginUpdateAlert.findOneAndUpdate(
      { id: alert.id, alertedAt: null },
      { alertedAt: new Date(), initializedVersion, level },
      { new: true },
    )
    if (!claimed) return alert

    const dao = await Models.Dao.findOne({ address: params.daoAddress, network: params.network }).select('name').lean()

    try {
      await TelegramModule.sendMessage(PluginUpdateWatch.formatAlert(claimed, rule, dao?.name ?? null))
    } catch (error: any) {
      // A throwing handler is never retried by the queue, so release the claim and re-queue ourselves.
      await Models.PluginUpdateAlert.updateOne({ id: claimed.id }, { alertedAt: null })
      await PluginUpdateWatch.scheduleRetry(claimed, params, error)
      return claimed
    }

    logger.info('PluginUpdateWatch: alert sent', llo({ id: claimed.id, level, initializedVersion }))
    return claimed
  },

  /** An unknown previous build matches on the new build alone. */
  findRule: (params: IQueuePluginUpdateWatch): IWatchedPluginUpdate | null => {
    const rule = PluginUpdateWatch.rules().find(
      r =>
        r.type === params.interfaceType &&
        r.to === params.toBuild &&
        (r.from === undefined || params.fromBuild === null || r.from === params.fromBuild),
    )
    return rule ?? null
  },

  rules: (): IWatchedPluginUpdate[] => {
    const raw = config.FRAUD_SCAN.WATCHED_UPDATES
    if (!raw) return []

    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return parsed
    } catch {}

    logger.error('PluginUpdateWatch: FRAUD_SCAN_WATCHED_UPDATES is not a JSON list, nothing is watched', llo({}))
    return []
  },

  /** Null means the read failed. The alert then keeps the rule's level. */
  readInitializedVersion: async (params: IQueuePluginUpdateWatch): Promise<number | null> => {
    try {
      const provider = ProviderModule.getAnyRpcProvider(params.network)
      // OpenZeppelin Initializable v4 keeps `_initialized` in the lowest byte of slot 0.
      const slot = await provider.getStorage(params.pluginAddress, 0)
      return Number(BigInt(slot) & 0xffn)
    } catch (error: any) {
      logger.warn(
        'PluginUpdateWatch: initialized version read failed',
        llo({ network: params.network, pluginAddress: params.pluginAddress, error: error.message }),
      )
      return null
    }
  },

  isSettled: (initializedVersion: number | null, rule: IWatchedPluginUpdate): boolean =>
    initializedVersion !== null && initializedVersion >= rule.settledVersion,

  /** Re-queues the job after a delay so a Telegram outage costs time, not the alert. */
  scheduleRetry: async (alert: PluginUpdateAlert, params: IQueuePluginUpdateWatch, error: Error) => {
    const attempts = (alert.alertAttempts ?? 0) + 1
    await Models.PluginUpdateAlert.updateOne({ id: alert.id }, { alertAttempts: attempts })

    if (attempts >= config.FRAUD_SCAN.ALERT_MAX_ATTEMPTS) {
      logger.error(
        'PluginUpdateWatch: giving up on the alert after repeated failures',
        llo({ id: alert.id, attempts, error: error.message }),
      )
      return
    }

    logger.warn(
      'PluginUpdateWatch: alert failed, retrying later',
      llo({ id: alert.id, attempts, error: error.message }),
    )
    await RabbitMQHelper.sendDelayedMessage(
      EnumQueueName.pluginUpdateWatch,
      { id: alert.id, params },
      config.FRAUD_SCAN.ALERT_RETRY_DELAY_MS,
    )
  },

  /** Telegram HTML. Addresses are written in full so they can be copied. */
  formatAlert: (alert: PluginUpdateAlert, rule: IWatchedPluginUpdate, daoName: string | null): string => {
    const where = `<b>${escapeHtml(daoName ?? alert.daoAddress)}</b> (${alert.network})`
    const details = [
      `plugin ${alert.pluginAddress} (${alert.interfaceType}), build ${alert.fromBuild ?? '?'} → ${alert.toBuild}`,
      `DAO ${alert.daoAddress}`,
      `tx ${alert.transactionHash} | block ${alert.blockNumber}`,
    ]

    if (PluginUpdateWatch.isSettled(alert.initializedVersion, rule)) {
      return [
        `ℹ️ watched plugin update on ${where}: initialized version is already ${alert.initializedVersion}, nothing to do`,
        ...details,
      ].join('\n')
    }

    const lines = [
      `🚨 <b>${rule.level.toUpperCase()}</b> watched plugin update on ${where}`,
      ...details,
      `initialized version: ${alert.initializedVersion ?? 'could not read'}`,
    ]
    if (rule.followUp) {
      const followUp = rule.followUp
        .split('{plugin}')
        .join(alert.pluginAddress)
        .split('{chainId}')
        .join(String(ProviderModule.getChainId(alert.network)))
      lines.push(`<code>${escapeHtml(followUp)}</code>`)
    }

    return lines.join('\n')
  },
}

export default PluginUpdateWatch
