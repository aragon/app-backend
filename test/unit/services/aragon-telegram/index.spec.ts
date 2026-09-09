import config from '@config'
import logger from '@logger'
import { PrometheusStore } from '@modules/prometheusStore'
import { TelegramBotApp } from '@services/aragon-telegram/bot'
import { NotificationDispatcher } from '@services/aragon-telegram/helpers/dispatcher'
import { EndingSoonNotifier } from '@services/aragon-telegram/helpers/endingSoonNotifier'
import { TelegramNotificationOutboxPublisher } from '@services/aragon-telegram/helpers/notificationOutbox'
import AragonTelegramService from '@services/aragon-telegram/index'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { EnumConnection, EnumServiceName } from '@types'
import { expect } from 'chai'
import { type Gauge } from 'prom-client'
import * as sinon from 'sinon'
import { type SinonSandbox, type SinonStubbedInstance } from 'sinon'

// Plausible-looking placeholder; grammy's `Bot` only validates shape, not validity.
const FAKE_TOKEN = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghi'

describe('AragonTelegram: index', () => {
  let sandbox: SinonSandbox
  let scheduler: SinonStubbedInstance<TaskSchedulerState>
  let botStop: sinon.SinonStub
  let tokenBk: string | null

  const gaugeValue = async (name: string) => {
    const registry = PrometheusStore.getInstance(EnumServiceName.ARAGON_TELEGRAM).getRegistry()
    const metric = registry.getSingleMetric(name) as Gauge
    return (await metric.get()).values[0]?.value
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'error')

    scheduler = sandbox.createStubInstance(TaskSchedulerState)
    sandbox.stub(TaskSchedulerState, 'getInstance').returns(scheduler)

    tokenBk = config.SERVICES.ARAGON_TELEGRAM.BOT_TOKEN
    config.SERVICES.ARAGON_TELEGRAM.BOT_TOKEN = FAKE_TOKEN

    sandbox.stub(TelegramBotApp.prototype, 'registerMenu').resolves()
    sandbox.stub(TelegramBotApp.prototype, 'start')
    botStop = sandbox.stub(TelegramBotApp.prototype, 'stop').resolves()
    sandbox.stub(TelegramBotApp.prototype, 'getApi').returns({ getMe: sinon.stub().resolves({}) } as any)
    sandbox.stub(NotificationDispatcher.prototype, 'start').resolves()
  })

  afterEach(async () => {
    await AragonTelegramService.stop()
    config.SERVICES.ARAGON_TELEGRAM.BOT_TOKEN = tokenBk
    sandbox.restore()
  })

  it('boots without a blockchain connection, the block gap comes from the dao service over the queue', () => {
    expect(AragonTelegramService.NEED_CONNECTIONS).to.deep.equal([EnumConnection.MONGODB, EnumConnection.RABBITMQ])
  })

  it('refuses to start without a bot token', async () => {
    config.SERVICES.ARAGON_TELEGRAM.BOT_TOKEN = ''

    await expect(AragonTelegramService.start()).to.be.rejectedWith('SERVICES_ARAGON_TELEGRAM_BOT_TOKEN is required')
    expect(scheduler.startTask.called).to.be.false
  })

  it('starts the bot, the dispatcher and the two scheduled tasks, ticking faster than their intervals', async () => {
    await AragonTelegramService.start()

    expect((TelegramBotApp.prototype.registerMenu as sinon.SinonStub).calledOnce).to.be.true
    expect((NotificationDispatcher.prototype.start as sinon.SinonStub).calledOnce).to.be.true
    expect((TelegramBotApp.prototype.start as sinon.SinonStub).calledOnce).to.be.true

    expect(scheduler.startTask.calledTwice).to.be.true
    const [endingSoonName, endingSoon] = scheduler.startTask.firstCall.args
    const [outboxName, outbox] = scheduler.startTask.secondCall.args

    expect(endingSoonName).to.equal('telegramEndingSoon')
    expect(endingSoon.fn()).to.deep.equal([[{ endingSoon: EndingSoonNotifier }]])
    expect(endingSoon.interval).to.equal(config.SERVICES.ARAGON_TELEGRAM.ENDING_SOON_INTERVAL)
    expect(endingSoon.checkInterval).to.equal(5000)
    expect(endingSoon.runNow).to.be.true
    expect(endingSoon.stopOnError).to.be.false

    expect(outboxName).to.equal('telegramNotificationOutbox')
    expect(outbox.fn()).to.deep.equal([[{ notificationOutbox: TelegramNotificationOutboxPublisher }]])
    expect(outbox.interval).to.equal(config.SERVICES.ARAGON_TELEGRAM.OUTBOX_INTERVAL)
    expect(outbox.checkInterval).to.equal(5000)
    expect(outbox.runNow).to.be.true
    expect(outbox.stopOnError).to.be.false
  })

  it('logs task errors instead of letting them stop the scheduler', async () => {
    await AragonTelegramService.start()

    const endingSoon = scheduler.startTask.firstCall.args[1]
    const outbox = scheduler.startTask.secondCall.args[1]
    endingSoon.onError!(new Error('ending soon boom'))
    outbox.onError!(new Error('outbox boom'))

    const errorLog = logger.error as sinon.SinonStub
    expect(errorLog.calledTwice).to.be.true
    expect(errorLog.firstCall.args[0]).to.equal('TelegramService endingSoon task error')
    expect(errorLog.secondCall.args[0]).to.equal('TelegramService notification outbox task error')
  })

  it('feeds the bot state into the metrics probes while running and after stop', async () => {
    const isRunning = sandbox.stub(TelegramBotApp.prototype, 'isRunning').returns(true)

    await AragonTelegramService.start()
    expect(await gaugeValue('telegram_bot_running')).to.equal(1)
    expect(await gaugeValue('telegram_api_reachable')).to.equal(1)

    isRunning.returns(false)
    expect(await gaugeValue('telegram_bot_running')).to.equal(0)

    await AragonTelegramService.stop()
    expect(await gaugeValue('telegram_bot_running')).to.equal(0)
    expect(await gaugeValue('telegram_api_reachable')).to.equal(0)
  })

  it('stops both tasks and the bot', async () => {
    await AragonTelegramService.start()
    await AragonTelegramService.stop()

    expect(scheduler.stopTask.calledTwice).to.be.true
    expect(scheduler.stopTask.firstCall.args[0]).to.equal('telegramEndingSoon')
    expect(scheduler.stopTask.secondCall.args[0]).to.equal('telegramNotificationOutbox')
    expect(botStop.calledOnce).to.be.true

    // a second stop finds no bot and must not try to stop it again
    await AragonTelegramService.stop()
    expect(botStop.calledOnce).to.be.true
  })

  it('logs and keeps going when the bot refuses to stop', async () => {
    botStop.rejects(new Error('runner stuck'))

    await AragonTelegramService.start()
    await AragonTelegramService.stop()

    const errorLog = logger.error as sinon.SinonStub
    expect(errorLog.calledOnce).to.be.true
    expect(errorLog.firstCall.args[0]).to.equal('TelegramService bot.stop failed')
    expect(scheduler.stopTask.calledTwice).to.be.true
  })
})
