import { Models } from '@dbModels'
import logger from '@logger'
import RabbitMQ from '@modules/rabbitMQ'
import { BlockGapMonitor } from '@services/aragon-telegram/helpers/blockGapMonitor'
import { EnumQueueName, ITelegramSubscriptionStatus, TelegramNotificationOutboxStatus } from '@types'
import { Counter, Gauge, type Registry } from 'prom-client'

const llo = logger.logMeta.bind(null, { service: 'telegram:metrics' })

const OUTBOX_STUCK_AFTER_MS = 5 * 60 * 1000

const WATCHED_QUEUES = [EnumQueueName.telegramNotifications, EnumQueueName.telegramNotificationsDeadLetter]

const METRIC_NAMES = [
  'telegram_notifications_delivered_total',
  'telegram_notifications_send_failed_total',
  'telegram_users_blocked_total',
  'telegram_bot_running',
  'telegram_api_reachable',
  'telegram_subscribers',
  'telegram_dao_subscriptions',
  'telegram_outbox_pending',
  'telegram_outbox_stuck',
  'telegram_queue_messages',
  'telegram_queue_consumers',
  'aragon_indexer_last_synced_block',
  'aragon_indexer_chain_head_block',
  'aragon_indexer_block_lag_seconds',
]

export interface ITelegramMetricsProbes {
  isBotRunning: () => boolean
  checkApi: () => Promise<unknown>
}

const readQueue = (queueName: EnumQueueName) => RabbitMQ.getChannel(queueName).checkQueue(queueName)

/**
 * Registers the telegram service's health and business metrics on the
 * service's prom-client registry, which the existing PrometheusStore →
 * admin-api `/metrics` → VictoriaMetrics pipeline already ships to Grafana.
 *
 * Gauges compute their value inside `collect()`, which prom-client runs on
 * every scrape. A collect must never throw: a rejected `registry.metrics()`
 * would drop the whole snapshot for the service, default metrics included.
 */
export class TelegramMetrics {
  readonly notificationsDelivered: Counter<'event'>
  readonly sendFailures: Counter<'kind'>
  readonly usersBlocked: Counter

  constructor(registry: Registry, probes: ITelegramMetricsProbes) {
    // The registry outlives a service stop/start cycle in the same process,
    // so re-registering must replace the old metrics instead of throwing.
    for (const name of METRIC_NAMES) registry.removeSingleMetric(name)

    this.notificationsDelivered = new Counter({
      name: 'telegram_notifications_delivered_total',
      help: 'Notifications delivered to Telegram chats, by event type',
      labelNames: ['event'],
      registers: [registry],
    })

    this.sendFailures = new Counter({
      name: 'telegram_notifications_send_failed_total',
      help: 'Telegram sendMessage failures, split into retryable and permanent',
      labelNames: ['kind'],
      registers: [registry],
    })

    this.usersBlocked = new Counter({
      name: 'telegram_users_blocked_total',
      help: 'Subscribers deactivated because they blocked the bot',
      registers: [registry],
    })

    new Gauge({
      name: 'telegram_bot_running',
      help: '1 while the grammy update runner is polling Telegram',
      registers: [registry],
      collect() {
        this.set(probes.isBotRunning() ? 1 : 0)
      },
    })

    new Gauge({
      name: 'telegram_api_reachable',
      help: '1 when the Telegram API answers with the configured bot token',
      registers: [registry],
      async collect() {
        try {
          await probes.checkApi()
          this.set(1)
        } catch {
          this.set(0)
        }
      },
    })

    new Gauge({
      name: 'telegram_subscribers',
      help: 'Subscriber accounts by status',
      labelNames: ['status'],
      registers: [registry],
      async collect() {
        try {
          const rows: { _id: string; count: number }[] = await Models.TelegramSubscription.aggregate([
            { $group: { _id: '$status', count: { $sum: 1 } } },
          ])
          for (const status of Object.values(ITelegramSubscriptionStatus)) {
            this.set({ status }, rows.find(row => row._id === status)?.count ?? 0)
          }
        } catch (error) {
          logger.warn('telegram metrics: subscriber count failed', llo({ error }))
        }
      },
    })

    new Gauge({
      name: 'telegram_dao_subscriptions',
      help: 'DAO subscriptions held by active subscribers',
      registers: [registry],
      async collect() {
        try {
          const rows: { total: number }[] = await Models.TelegramSubscription.aggregate([
            { $match: { status: ITelegramSubscriptionStatus.Active } },
            { $group: { _id: null, total: { $sum: { $size: { $ifNull: ['$subscriptions', []] } } } } },
          ])
          this.set(rows[0]?.total ?? 0)
        } catch (error) {
          logger.warn('telegram metrics: dao subscription count failed', llo({ error }))
        }
      },
    })

    new Gauge({
      name: 'telegram_outbox_pending',
      help: 'Outbox notifications waiting to be published to RabbitMQ',
      registers: [registry],
      async collect() {
        try {
          this.set(
            await Models.TelegramNotificationOutbox.countDocuments({
              status: TelegramNotificationOutboxStatus.Pending,
            }),
          )
        } catch (error) {
          logger.warn('telegram metrics: outbox pending count failed', llo({ error }))
        }
      },
    })

    new Gauge({
      name: 'telegram_outbox_stuck',
      help: 'Pending outbox notifications whose next attempt is more than five minutes overdue',
      registers: [registry],
      async collect() {
        try {
          this.set(
            await Models.TelegramNotificationOutbox.countDocuments({
              status: TelegramNotificationOutboxStatus.Pending,
              nextAttemptAt: { $lt: new Date(Date.now() - OUTBOX_STUCK_AFTER_MS) },
            }),
          )
        } catch (error) {
          logger.warn('telegram metrics: outbox stuck count failed', llo({ error }))
        }
      },
    })

    const queueConsumers = new Gauge({
      name: 'telegram_queue_consumers',
      help: 'Consumers attached to the telegram RabbitMQ queues',
      labelNames: ['queue'],
      registers: [registry],
    })

    new Gauge({
      name: 'telegram_queue_messages',
      help: 'Messages waiting in the telegram RabbitMQ queues',
      labelNames: ['queue'],
      registers: [registry],
      async collect() {
        for (const queueName of WATCHED_QUEUES) {
          try {
            const { messageCount, consumerCount } = await readQueue(queueName)
            this.set({ queue: queueName }, messageCount)
            queueConsumers.set({ queue: queueName }, consumerCount)
          } catch (error) {
            logger.warn('telegram metrics: queue probe failed', llo({ queueName, error }))
          }
        }
      },
    })

    // Notifications are only as fresh as the indexer behind them, so how far it
    // trails each chain head is reported alongside the delivery metrics. Each
    // gauge resets before it sets, so a network that drops out of the readings
    // goes absent rather than holding its last healthy value.
    new Gauge({
      name: 'aragon_indexer_last_synced_block',
      help: 'Last block indexed by the indexer, per network',
      labelNames: ['network'],
      registers: [registry],
      async collect() {
        this.reset()
        for (const reading of await BlockGapMonitor.readShared()) {
          this.set({ network: reading.network }, reading.lastIndexed)
        }
      },
    })

    new Gauge({
      name: 'aragon_indexer_chain_head_block',
      help: 'Current chain head block, per network',
      labelNames: ['network'],
      registers: [registry],
      async collect() {
        this.reset()
        for (const reading of await BlockGapMonitor.readShared()) {
          this.set({ network: reading.network }, reading.chainHead)
        }
      },
    })

    new Gauge({
      name: 'aragon_indexer_block_lag_seconds',
      help: 'Seconds the indexer trails the chain head, per network',
      labelNames: ['network'],
      registers: [registry],
      async collect() {
        this.reset()
        for (const reading of await BlockGapMonitor.readShared()) {
          this.set({ network: reading.network }, reading.lagSeconds)
        }
      },
    })
  }
}
