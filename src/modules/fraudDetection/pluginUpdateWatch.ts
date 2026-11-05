import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import type PluginUpdateAlert from '@models/schema/pluginUpdateAlert'
import ProviderModule from '@modules/provider'
import TelegramModule from '@modules/telegram'
import {
  EnumQueueName,
  type IFraudRiskLevel,
  type IPluginUpdate,
  type IQueuePluginUpdateWatch,
  type IWatchedPluginUpdate,
  TestNetworks,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'plugin-update-watch' })

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const LEVELS: IFraudRiskLevel[] = ['critical', 'high', 'medium', 'low']

// Longer than one Telegram call (15s timeout) and shorter than the queue's retry window, so a
// claim left by a crash or a deploy is taken again by a later attempt.
const CLAIM_LEASE_MS = 60 * 1000

// The queue's own retries take about four minutes; the sweep only steps in after them.
const SWEEP_MIN_AGE_MS = 5 * 60 * 1000
const SWEEP_BATCH_SIZE = 50
export const PLUGIN_UPDATE_SWEEP_INTERVAL_MS = 5 * 60 * 1000

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
   * Saves the update as a pending alert, then publishes it without waiting. The indexer awaits
   * the save, so the alert is stored before the crawler saves its progress, and a slow or down
   * broker never holds up the crawl. The sweep sends it if the message never arrives.
   */
  queue: async (update: IPluginUpdate) => {
    if (TestNetworks.includes(update.network)) return null

    const id = Models.PluginUpdateAlert.getEntityId(update)
    const alert = await Models.PluginUpdateAlert.createLog({ id, ...update })

    RabbitMQHelper.sendMessage(EnumQueueName.pluginUpdateWatch, { id, params: { id } }, { throwOnError: true }).catch(
      error =>
        logger.warn('PluginUpdateWatch: publish failed, the sweep sends it later', llo({ id, error: error.message })),
    )

    return alert
  },

  run: async ({ id }: IQueuePluginUpdateWatch) => {
    const alert = await Models.PluginUpdateAlert.findOne({ id })
    if (!alert) {
      logger.warn('PluginUpdateWatch: alert not found', llo({ id }))
      return null
    }
    return await PluginUpdateWatch.deliver(alert)
  },

  /** Sends pending alerts whose message never arrived, or whose queue retries ran out. */
  sweep: async () => {
    if (!TelegramModule.isConfigured()) return

    const now = Date.now()
    const alerts = await Models.PluginUpdateAlert.findReadyToDeliver(
      new Date(now - SWEEP_MIN_AGE_MS),
      new Date(now - CLAIM_LEASE_MS),
      SWEEP_BATCH_SIZE,
    )

    for (const alert of alerts) {
      try {
        await PluginUpdateWatch.deliver(alert)
      } catch (error: any) {
        logger.warn(
          'PluginUpdateWatch: sweep could not deliver, the next run tries again',
          llo({ id: alert.id, error: error.message }),
        )
      }
    }
  },

  /**
   * Sends the alert once when a watched rule matches, and closes it without sending when none
   * does. Any failure throws, so the queue retries it; the sweep picks up what is still pending.
   */
  deliver: async (alert: PluginUpdateAlert) => {
    if (alert.status !== 'pending') return alert

    const rule = PluginUpdateWatch.findRule(alert)
    if (!rule) {
      await Models.PluginUpdateAlert.updateOne({ id: alert.id, status: 'pending' }, { status: 'unwatched' })
      return alert
    }

    if (!TelegramModule.isConfigured()) {
      logger.warn('PluginUpdateWatch: Telegram not configured, alert skipped', llo({ id: alert.id }))
      return alert
    }

    const initializedVersion = await PluginUpdateWatch.readInitializedVersion(alert)
    const level = PluginUpdateWatch.isSettled(initializedVersion, rule) ? 'low' : rule.level
    const dao = await Models.Dao.findOne({ address: alert.daoAddress, network: alert.network }).select('name').lean()

    const now = Date.now()
    const claimed: PluginUpdateAlert | null = await Models.PluginUpdateAlert.findOneAndUpdate(
      {
        id: alert.id,
        status: 'pending',
        $or: [{ claimedAt: null }, { claimedAt: { $lt: new Date(now - CLAIM_LEASE_MS) } }],
      },
      { claimedAt: new Date(now), initializedVersion, level },
      { returnDocument: 'after' },
    )
    // Sent in the meantime, or another delivery holds a live claim. The retry sorts out which.
    if (!claimed) throw new Error(`PluginUpdateWatch: ${alert.id} is claimed by another delivery`)

    try {
      await TelegramModule.sendMessage(PluginUpdateWatch.formatAlert(claimed, rule, dao?.name ?? null))
    } catch (error) {
      await Models.PluginUpdateAlert.updateOne({ id: alert.id }, { claimedAt: null })
      throw error
    }

    await Models.PluginUpdateAlert.updateOne({ id: alert.id }, { status: 'sent', sentAt: new Date() })
    logger.info('PluginUpdateWatch: alert sent', llo({ id: alert.id, level, initializedVersion }))
    return claimed
  },

  /** An unknown previous build matches on the new build alone. */
  findRule: (
    update: Pick<IPluginUpdate, 'interfaceType' | 'release' | 'fromBuild' | 'toBuild'>,
  ): IWatchedPluginUpdate | null => {
    const rule = PluginUpdateWatch.rules().find(
      r =>
        r.type === update.interfaceType &&
        r.to === update.toBuild &&
        (r.release === undefined || r.release === update.release) &&
        (r.from === undefined || update.fromBuild === null || r.from === update.fromBuild),
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
  readInitializedVersion: async (update: Pick<IPluginUpdate, 'network' | 'pluginAddress'>): Promise<number | null> => {
    try {
      const provider = ProviderModule.getAnyRpcProvider(update.network)
      // OpenZeppelin Initializable v4 keeps `_initialized` in the lowest byte of slot 0.
      const slot = await provider.getStorage(update.pluginAddress, 0)
      return Number(BigInt(slot) & 0xffn)
    } catch (error: any) {
      logger.warn(
        'PluginUpdateWatch: initialized version read failed',
        llo({ network: update.network, pluginAddress: update.pluginAddress, error: error.message }),
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
