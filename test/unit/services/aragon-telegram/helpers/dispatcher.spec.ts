import config from '@config'
import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { NotificationDispatcher } from '@services/aragon-telegram/helpers/dispatcher'
import { TelegramMetrics } from '@services/aragon-telegram/helpers/metrics'
import { NotificationRenderer } from '@services/aragon-telegram/helpers/notificationRenderer'
import {
  EnumQueueName,
  type HexAddress,
  type IQueueTelegramNotification,
  ITelegramNotificationEvent,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import { GrammyError } from 'grammy'
import { Registry } from 'prom-client'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const DAO = '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress
const NETWORK = NetworksEnum.ethereumSepolia

const buildMsg = (overrides: Partial<IQueueTelegramNotification> = {}): IQueueTelegramNotification => ({
  id: 'msg-1',
  event: ITelegramNotificationEvent.ProposalCreated,
  network: NETWORK,
  daoAddress: DAO,
  proposalId: 'proposal-entity-id',
  ...overrides,
})

describe('AragonTelegram: NotificationDispatcher', () => {
  let sandbox: SinonSandbox
  let api: { sendMessage: sinon.SinonStub }
  let dispatcher: NotificationDispatcher
  let renderStub: sinon.SinonStub
  let metrics: TelegramMetrics

  const counterValue = async (name: string) => {
    const [value] = (await (metrics as any)[name].get()).values
    return value?.value ?? 0
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    api = { sendMessage: sandbox.stub().resolves({ message_id: 1 }) }
    const renderer = new NotificationRenderer()
    // Renderer hits Mongo for entity lookup; stub it out so the dispatcher
    // tests focus purely on fanout + send-error behaviour.
    renderStub = sandbox.stub(renderer, 'render').resolves({
      text: 'rendered',
      keyboard: { inline_keyboard: [] } as any,
    })
    metrics = new TelegramMetrics(new Registry(), { isBotRunning: () => true, checkApi: async () => ({}) })
    dispatcher = new NotificationDispatcher(api as any, renderer, metrics)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('start', () => {
    it('subscribes to the telegram.notifications queue', async () => {
      const processStub = sandbox.stub(RabbitMQHelper, 'process').resolves()
      await dispatcher.start()
      expect(processStub.calledOnce).to.be.true
      expect(processStub.firstCall.args[0]).to.eq(EnumQueueName.telegramNotifications)
      expect(processStub.firstCall.args[2]).to.deep.eq({
        retry: {
          maxAttempts: config.SERVICES.ARAGON_TELEGRAM.DELIVERY_MAX_ATTEMPTS,
          baseDelayMs: config.SERVICES.ARAGON_TELEGRAM.DELIVERY_RETRY_BASE_DELAY_MS,
          maxDelayMs: config.SERVICES.ARAGON_TELEGRAM.DELIVERY_RETRY_MAX_DELAY_MS,
          deadLetterQueue: EnumQueueName.telegramNotificationsDeadLetter,
        },
      })
    })
  })

  describe('handle (via the consumer callback)', () => {
    let consumerCb: (data: IQueueTelegramNotification) => Promise<void>

    beforeEach(async () => {
      sandbox.stub(RabbitMQHelper, 'process').callsFake(async (_q: any, cb: any) => {
        consumerCb = cb
      })
      await dispatcher.start()
    })

    it('drops invalid payloads silently', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findActiveSubscribersForDao').resolves([])
      await consumerCb({} as IQueueTelegramNotification)
      expect(api.sendMessage.called).to.be.false
    })

    it('skips when the renderer cannot find the referenced entity', async () => {
      sandbox
        .stub(Models.TelegramSubscription, 'findActiveSubscribersForDao')
        .resolves([{ telegramUserId: 1, chatId: 1 } as any])
      renderStub.resolves(null)
      await consumerCb(buildMsg())
      expect(api.sendMessage.called).to.be.false
    })

    it('returns early when there are no subscribers', async () => {
      const findStub = sandbox.stub(Models.TelegramSubscription, 'findActiveSubscribersForDao').resolves([])
      await consumerCb(buildMsg())
      expect(findStub.calledOnce).to.be.true
      expect(api.sendMessage.called).to.be.false
    })

    it('fans out to every active subscriber via the bot api', async () => {
      sandbox
        .stub(Models.TelegramSubscription, 'findActiveSubscribersForDao')
        .resolves([{ telegramUserId: 1, chatId: 1 } as any, { telegramUserId: 2, chatId: 2 } as any])
      await consumerCb(buildMsg())
      expect(api.sendMessage.callCount).to.eq(2)
      const opts = api.sendMessage.firstCall.args[2]
      expect(opts.parse_mode).to.eq('HTML')
      expect(opts.link_preview_options.is_disabled).to.eq(true)
    })

    it('marks a subscriber as Blocked on a 403 from Telegram', async () => {
      const blockedSub = { telegramUserId: 99, chatId: 99 } as any
      sandbox.stub(Models.TelegramSubscription, 'findActiveSubscribersForDao').resolves([blockedSub])

      const blockForDeletion = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({ blockForDeletion } as any)

      api.sendMessage.rejects(
        new GrammyError(
          'Forbidden: bot was blocked by the user',
          { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' } as any,
          'sendMessage' as any,
          {} as any,
        ),
      )

      await consumerCb(buildMsg())
      expect(blockForDeletion.calledWith(config.SERVICES.ARAGON_TELEGRAM.BLOCKED_SUBSCRIBER_RETENTION_DAYS)).to.be.true
    })

    it('delivers a redelivered message only once — the dedup marker survives in the DB', async () => {
      sandbox
        .stub(Models.TelegramSubscription, 'findActiveSubscribersForDao')
        .resolves([{ telegramUserId: 1, chatId: 1 } as any])

      await consumerCb(buildMsg())
      await consumerCb(buildMsg())

      expect(api.sendMessage.callCount).to.eq(1)
      const marker = await Models.TelegramNotifiedEvent.exists({ id: 'dispatched:msg-1' })
      expect(marker).to.not.be.null
    })

    it('retries after a transient failure before delivery', async () => {
      const findStub = sandbox.stub(Models.TelegramSubscription, 'findActiveSubscribersForDao')
      findStub.onFirstCall().rejects(new Error('mongo unavailable'))
      findStub.onSecondCall().resolves([{ telegramUserId: 1, chatId: 1 } as any])

      await expect(consumerCb(buildMsg())).to.be.rejectedWith('mongo unavailable')
      await consumerCb(buildMsg())

      expect(api.sendMessage.calledOnce).to.be.true
    })

    it('does not clash with the producer-side marker for scheduled events', async () => {
      // the producer already claimed the raw key at publish time
      await Models.TelegramNotifiedEvent.claim('proposal-ending:0xabc')
      sandbox
        .stub(Models.TelegramSubscription, 'findActiveSubscribersForDao')
        .resolves([{ telegramUserId: 1, chatId: 1 } as any])

      await consumerCb(
        buildMsg({
          id: 'proposal-ending:0xabc',
          event: ITelegramNotificationEvent.ProposalEnding,
          proposalId: '0xabc',
        }),
      )

      expect(api.sendMessage.callCount).to.eq(1)
    })

    it('does not retry permanent Telegram errors and still delivers to other subscribers', async () => {
      sandbox
        .stub(Models.TelegramSubscription, 'findActiveSubscribersForDao')
        .resolves([{ telegramUserId: 1, chatId: 1 } as any, { telegramUserId: 2, chatId: 2 } as any])
      api.sendMessage
        .onFirstCall()
        .rejects(
          new GrammyError(
            'Bad Request: chat not found',
            { ok: false, error_code: 400, description: 'Bad Request: chat not found' } as any,
            'sendMessage' as any,
            {} as any,
          ),
        )

      await consumerCb(buildMsg())
      await consumerCb(buildMsg())
      expect(api.sendMessage.callCount).to.eq(2)
    })

    it('counts one delivery per subscriber, tagged with the event type', async () => {
      sandbox
        .stub(Models.TelegramSubscription, 'findActiveSubscribersForDao')
        .resolves([{ telegramUserId: 1, chatId: 1 } as any, { telegramUserId: 2, chatId: 2 } as any])

      await consumerCb(buildMsg())

      const [value] = (await metrics.notificationsDelivered.get()).values
      expect(value.labels.event).to.eq(ITelegramNotificationEvent.ProposalCreated)
      expect(value.value).to.eq(2)
    })

    it('counts a blocked user instead of a delivery on a 403', async () => {
      sandbox
        .stub(Models.TelegramSubscription, 'findActiveSubscribersForDao')
        .resolves([{ telegramUserId: 99, chatId: 99 } as any])
      sandbox
        .stub(Models.TelegramSubscription, 'findByTelegramUserId')
        .resolves({ blockForDeletion: sandbox.stub().resolves() } as any)
      api.sendMessage.rejects(
        new GrammyError(
          'Forbidden: bot was blocked by the user',
          { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' } as any,
          'sendMessage' as any,
          {} as any,
        ),
      )

      await consumerCb(buildMsg())

      expect(await counterValue('usersBlocked')).to.eq(1)
      expect(await counterValue('notificationsDelivered')).to.eq(0)
    })

    it('counts permanent and retryable send failures separately', async () => {
      sandbox
        .stub(Models.TelegramSubscription, 'findActiveSubscribersForDao')
        .resolves([{ telegramUserId: 1, chatId: 1 } as any])
      api.sendMessage
        .onFirstCall()
        .rejects(
          new GrammyError(
            'Bad Request: chat not found',
            { ok: false, error_code: 400, description: 'Bad Request: chat not found' } as any,
            'sendMessage' as any,
            {} as any,
          ),
        )
      api.sendMessage.onSecondCall().rejects(new Error('network unavailable'))

      await consumerCb(buildMsg())
      await expect(consumerCb(buildMsg({ id: 'msg-2' }))).to.be.rejected

      const failures = (await metrics.sendFailures.get()).values
      expect(failures.find(value => value.labels.kind === 'permanent')?.value).to.eq(1)
      expect(failures.find(value => value.labels.kind === 'retryable')?.value).to.eq(1)
    })

    it('retries only recipients whose delivery failed transiently', async () => {
      sandbox
        .stub(Models.TelegramSubscription, 'findActiveSubscribersForDao')
        .resolves([{ telegramUserId: 1, chatId: 1 } as any, { telegramUserId: 2, chatId: 2 } as any])

      let firstAttempt = true
      api.sendMessage.callsFake(async (chatId: number) => {
        if (chatId === 1 && firstAttempt) {
          firstAttempt = false
          throw new Error('network unavailable')
        }
        return { message_id: 1 }
      })

      await expect(consumerCb(buildMsg())).to.be.rejectedWith('network unavailable')
      await consumerCb(buildMsg())

      const chats = api.sendMessage.getCalls().map(call => call.args[0])
      expect(chats.filter(chatId => chatId === 1)).to.have.length(2)
      expect(chats.filter(chatId => chatId === 2)).to.have.length(1)
    })
  })
})
