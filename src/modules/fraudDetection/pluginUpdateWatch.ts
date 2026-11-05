import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import type PluginUpdateAlert from '@models/schema/pluginUpdateAlert'
import ProviderModule from '@modules/provider'
import TelegramModule from '@modules/telegram'
import { type IFraudRiskLevel, type IQueuePluginUpdateWatch, type IWatchedPluginUpdate, TestNetworks } from '@types'

const llo = logger.logMeta.bind(null, { service: 'plugin-update-watch' })

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const LEVELS: IFraudRiskLevel[] = ['critical', 'high', 'medium', 'low']

// Longer than one Telegram call (15s timeout) and shorter than the queue's retry window, so a
// claim left by a crash or a deploy is taken again by a later attempt.
const CLAIM_LEASE_MS = 60 * 1000

const optional = (value: unknown, type: 'number' | 'string') => value === undefined || typeof value === type

const isRule = (rule: any): rule is IWatchedPluginUpdate =>
  typeof rule?.type === 'string' &&
  typeof rule.to === 'number' &&
  typeof rule.settledVersion === 'number' &&
  LEVELS.includes(rule.level) &&
  optional(rule.from, 'number') &&
  optional(rule.release, 'number') &&
  optional(rule.followUp, 'string')

export const PluginUpdateWatch = {
  /**
   * Alerts once when an applied plugin update matches a watched rule. The document is keyed by
   * network, plugin, release and build, so redelivery, replays and backfills never alert twice.
   * Any failure throws, so the queue retries it and dead-letters it once the attempts run out.
   */
  run: async (params: IQueuePluginUpdateWatch) => {
    if (TestNetworks.includes(params.network)) return null

    const rule = PluginUpdateWatch.findRule(params)
    if (!rule) return null

    const id = `${params.network}-${params.pluginAddress}-${params.release}-${params.toBuild}`
    const alert = await Models.PluginUpdateAlert.createLog({ id, ...params })
    if (alert.sentAt) return alert

    if (!TelegramModule.isConfigured()) {
      logger.warn('PluginUpdateWatch: Telegram not configured, alert skipped', llo({ id }))
      return alert
    }

    const initializedVersion = await PluginUpdateWatch.readInitializedVersion(params)
    const level = PluginUpdateWatch.isSettled(initializedVersion, rule) ? 'low' : rule.level
    const dao = await Models.Dao.findOne({ address: params.daoAddress, network: params.network }).select('name').lean()

    const now = Date.now()
    const claimed: PluginUpdateAlert | null = await Models.PluginUpdateAlert.findOneAndUpdate(
      {
        id,
        sentAt: null,
        $or: [{ claimedAt: null }, { claimedAt: { $lt: new Date(now - CLAIM_LEASE_MS) } }],
      },
      { claimedAt: new Date(now), initializedVersion, level },
      { new: true },
    )
    // Sent in the meantime, or another delivery holds a live claim. The retry sorts out which.
    if (!claimed) throw new Error(`PluginUpdateWatch: ${id} is claimed by another delivery`)

    try {
      await TelegramModule.sendMessage(PluginUpdateWatch.formatAlert(claimed, rule, dao?.name ?? null))
    } catch (error) {
      await Models.PluginUpdateAlert.updateOne({ id }, { claimedAt: null })
      throw error
    }

    await Models.PluginUpdateAlert.updateOne({ id }, { sentAt: new Date() })
    logger.info('PluginUpdateWatch: alert sent', llo({ id, level, initializedVersion }))
    return claimed
  },

  /** An unknown previous build matches on the new build alone. */
  findRule: (params: IQueuePluginUpdateWatch): IWatchedPluginUpdate | null => {
    const rule = PluginUpdateWatch.rules().find(
      r =>
        r.type === params.interfaceType &&
        r.to === params.toBuild &&
        (r.release === undefined || r.release === params.release) &&
        (r.from === undefined || params.fromBuild === null || r.from === params.fromBuild),
    )
    return rule ?? null
  },

  rules: (): IWatchedPluginUpdate[] => {
    const raw = config.FRAUD_SCAN.WATCHED_UPDATES
    if (!raw) return []

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {}

    if (!Array.isArray(parsed)) {
      logger.error('PluginUpdateWatch: FRAUD_SCAN_WATCHED_UPDATES is not a JSON list, nothing is watched', llo({}))
      return []
    }

    const dropped = parsed.flatMap((rule, index) => (isRule(rule) ? [] : [index]))
    if (dropped.length) {
      logger.error('PluginUpdateWatch: dropped watched update rules with a bad shape', llo({ dropped }))
    }
    return parsed.filter(isRule)
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

  /** Telegram HTML. Addresses are written in full so they can be copied. */
  formatAlert: (alert: PluginUpdateAlert, rule: IWatchedPluginUpdate, daoName: string | null): string => {
    const where = `<b>${escapeHtml(daoName ?? alert.daoAddress)}</b> (${alert.network})`
    const details = [
      `plugin ${alert.pluginAddress} (${alert.interfaceType}), release ${alert.release}, build ${alert.fromBuild ?? '?'} → ${alert.toBuild}`,
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
