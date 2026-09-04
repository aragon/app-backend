import RabbitMQHelper from '@helpers/rabbitMQ'
import logger from '@logger'
import {
  EnumQueueName,
  type IIndexerBlockGapQueueResponse,
  type IIndexerBlockGapReading,
  type IQueueIndexerBlockGap,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'telegram:blockGap' })

// Long enough for the gauges collected in one scrape to share a single
// measurement, short enough that the next scrape takes a fresh one.
const SHARED_READING_TTL_MS = 5 * 1000

// Prometheus gives a scrape 10s by default and this wait runs inside the gauge
// collect, so the reply has to give up well before that or one slow dao reply
// drops the whole telegram snapshot. Same bound as the api probe.
const REPLY_TIMEOUT_MS = 5 * 1000

let shared: { at: number; readings: Promise<IIndexerBlockGapReading[]> } | null = null

/**
 * Asks the dao service how far the indexer trails each chain head, so a
 * stalled indexer is caught before subscribers notice their notifications
 * went quiet.
 *
 * The measurement runs in the dao service because it needs RPC providers and
 * this service boots with Mongo and RabbitMQ only. Nothing is cached across
 * scrapes: a missing or late reply gives no readings, so the series goes absent
 * and the alert treats it as a failure instead of holding the last healthy gap.
 */
export const BlockGapMonitor = {
  read: async (): Promise<IIndexerBlockGapReading[]> => {
    const params: IQueueIndexerBlockGap = { sentAt: Date.now(), replyTimeoutMs: REPLY_TIMEOUT_MS }

    const reply: IIndexerBlockGapQueueResponse | null = await RabbitMQHelper.sendMessage(
      EnumQueueName.indexerBlockGap,
      { id: `indexerBlockGap-${params.sentAt}`, params },
      { waitResponse: true, timeout: REPLY_TIMEOUT_MS },
    )

    if (!reply?.readings) {
      logger.warn('blockGap: no reply from the dao service', llo({}))
      return []
    }

    return reply.readings
  },

  /**
   * The three gauges collect independently but describe one measurement, so a
   * reading is shared briefly to keep a scrape to a single queue round trip.
   */
  readShared: (): Promise<IIndexerBlockGapReading[]> => {
    const now = Date.now()
    if (shared && now - shared.at < SHARED_READING_TTL_MS) return shared.readings

    const readings = BlockGapMonitor.read().catch(error => {
      logger.warn('blockGap: measurement failed', llo({ error }))
      return [] as IIndexerBlockGapReading[]
    })

    shared = { at: now, readings }
    return readings
  },

  resetShared: (): void => {
    shared = null
  },
}
