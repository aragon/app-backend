import { Models } from '@dbModels'
import RabbitMQ from '@modules/rabbitMQ'
import { type ITelegramMetricsProbes, TelegramMetrics } from '@services/aragon-telegram/helpers/metrics'
import {
  EnumQueueName,
  type HexAddress,
  ITelegramNotificationEvent,
  ITelegramSubscriptionStatus,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import { type Gauge, Registry } from 'prom-client'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const DAO = '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress
const NETWORK = NetworksEnum.ethereumSepolia

const daoSubscription = (daoAddress: HexAddress) => ({
  daoId: `${NETWORK}-${daoAddress}`,
  network: NETWORK,
  daoAddress,
  events: [ITelegramNotificationEvent.ProposalCreated],
  subscribedAt: Date.now(),
})

describe('AragonTelegram: TelegramMetrics', () => {
  let sandbox: SinonSandbox
  let registry: Registry
  let probes: { isBotRunning: sinon.SinonStub; checkApi: sinon.SinonStub }
  let checkQueue: sinon.SinonStub
  let metrics: TelegramMetrics

  const gaugeValues = async (name: string) => {
    const metric = registry.getSingleMetric(name) as Gauge
    return (await metric.get()).values
  }

  const gaugeValue = async (name: string, labels: Record<string, string> = {}) => {
    const values = await gaugeValues(name)
    const match = values.find(value =>
      Object.entries(labels).every(([key, labelValue]) => (value.labels as any)[key] === labelValue),
    )
    return match?.value
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    registry = new Registry()
    probes = { isBotRunning: sandbox.stub().returns(true), checkApi: sandbox.stub().resolves({}) }
    checkQueue = sandbox.stub().resolves({ queue: 'q', messageCount: 3, consumerCount: 1 })
    sandbox.stub(RabbitMQ, 'getChannel').returns({ checkQueue } as any)
    metrics = new TelegramMetrics(registry, probes as ITelegramMetricsProbes)
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('registers twice on the same registry without throwing', () => {
    expect(() => new TelegramMetrics(registry, probes as ITelegramMetricsProbes)).to.not.throw()
  })

  it('reports whether the bot runner is polling', async () => {
    expect(await gaugeValue('telegram_bot_running')).to.eq(1)
    probes.isBotRunning.returns(false)
    expect(await gaugeValue('telegram_bot_running')).to.eq(0)
  })

  it('reports the Telegram API as unreachable when the probe rejects', async () => {
    expect(await gaugeValue('telegram_api_reachable')).to.eq(1)
    probes.checkApi.rejects(new Error('401: Unauthorized'))
    expect(await gaugeValue('telegram_api_reachable')).to.eq(0)
  })

  it('counts subscribers by status and DAO subscriptions of active ones', async () => {
    await Models.TelegramSubscription.create({
      telegramUserId: 1,
      chatId: 1,
      subscriptions: [
        daoSubscription(DAO),
        daoSubscription('0x0000000000000000000000000000000000000001' as HexAddress),
      ],
    })
    await Models.TelegramSubscription.create({ telegramUserId: 2, chatId: 2, subscriptions: [daoSubscription(DAO)] })
    await Models.TelegramSubscription.create({
      telegramUserId: 3,
      chatId: 3,
      status: ITelegramSubscriptionStatus.Paused,
      subscriptions: [daoSubscription(DAO)],
    })

    expect(await gaugeValue('telegram_subscribers', { status: 'active' })).to.eq(2)
    expect(await gaugeValue('telegram_subscribers', { status: 'paused' })).to.eq(1)
    expect(await gaugeValue('telegram_subscribers', { status: 'blocked' })).to.eq(0)
    expect(await gaugeValue('telegram_dao_subscriptions')).to.eq(3)
  })

  it('counts pending and stuck outbox notifications', async () => {
    await Models.TelegramNotificationOutbox.enqueue({
      id: 'msg-fresh',
      event: ITelegramNotificationEvent.ProposalCreated,
      network: NETWORK,
      daoAddress: DAO,
      proposalId: 'proposal-1',
    })
    await Models.TelegramNotificationOutbox.enqueue({
      id: 'msg-stuck',
      event: ITelegramNotificationEvent.ProposalCreated,
      network: NETWORK,
      daoAddress: DAO,
      proposalId: 'proposal-2',
    })
    await Models.TelegramNotificationOutbox.updateOne(
      { id: 'msg-stuck' },
      { nextAttemptAt: new Date(Date.now() - 10 * 60 * 1000) },
    )

    expect(await gaugeValue('telegram_outbox_pending')).to.eq(2)
    expect(await gaugeValue('telegram_outbox_stuck')).to.eq(1)
  })

  it('probes each queue once per snapshot and fills both the message and consumer gauges', async () => {
    const main = EnumQueueName.telegramNotifications
    const dlq = EnumQueueName.telegramNotificationsDeadLetter
    checkQueue.withArgs(main).resolves({ queue: main, messageCount: 5, consumerCount: 1 })
    checkQueue.withArgs(dlq).resolves({ queue: dlq, messageCount: 2, consumerCount: 0 })

    await registry.metrics()

    expect(checkQueue.callCount).to.eq(2)
    expect(await gaugeValue('telegram_queue_messages', { queue: main })).to.eq(5)
    expect(await gaugeValue('telegram_queue_messages', { queue: dlq })).to.eq(2)
    expect(await gaugeValue('telegram_queue_consumers', { queue: main })).to.eq(1)
    expect(await gaugeValue('telegram_queue_consumers', { queue: dlq })).to.eq(0)
  })

  it('keeps the scrape alive when a probe fails', async () => {
    checkQueue.rejects(new Error('rabbit down'))
    sandbox.stub(Models.TelegramSubscription, 'aggregate').rejects(new Error('mongo down'))

    await expect(registry.metrics()).to.not.be.rejected
  })

  it('exposes delivery counters that start at zero and accumulate', async () => {
    metrics.notificationsDelivered.inc({ event: ITelegramNotificationEvent.ProposalCreated })
    metrics.notificationsDelivered.inc({ event: ITelegramNotificationEvent.ProposalCreated })
    metrics.sendFailures.inc({ kind: 'retryable' })
    metrics.usersBlocked.inc()

    expect(
      await gaugeValue('telegram_notifications_delivered_total', { event: ITelegramNotificationEvent.ProposalCreated }),
    ).to.eq(2)
    expect(await gaugeValue('telegram_notifications_send_failed_total', { kind: 'retryable' })).to.eq(1)
    expect(await gaugeValue('telegram_users_blocked_total')).to.eq(1)
  })
})
