import { Models } from '@dbModels'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { NotificationDispatcher } from '@services/aragon-telegram/helpers/dispatcher'
import { NotificationRenderer } from '@services/aragon-telegram/helpers/notificationRenderer'
import { DescriptionCache } from '@services/aragon-telegram/helpers/descriptionCache'
import {
  EnumQueueName,
  type HexAddress,
  type IQueueTelegramNotification,
  ITelegramNotificationEvent,
  ITelegramSubscriptionStatus,
  NetworksEnum,
} from '@types'
import { expect } from 'chai'
import { GrammyError } from 'grammy'
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

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    api = { sendMessage: sandbox.stub().resolves({ message_id: 1 }) }
    const renderer = new NotificationRenderer(new DescriptionCache())
    // Renderer hits Mongo for entity lookup; stub it out so the dispatcher
    // tests focus purely on dedup + rate-limit + send-error behaviour.
    renderStub = sandbox.stub(renderer, 'render').resolves({
      text: 'rendered',
      keyboard: { inline_keyboard: [] } as any,
    })
    dispatcher = new NotificationDispatcher(api as any, renderer)
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
    })
  })

  describe('handle (via the consumer callback)', () => {
    let consumerCb: (data: IQueueTelegramNotification) => Promise<void>
    let claimStub: sinon.SinonStub

    beforeEach(async () => {
      sandbox.stub(RabbitMQHelper, 'process').callsFake(async (_q: any, cb: any) => {
        consumerCb = cb
      })
      // Default: every (event, user) pair is fresh — claim returns true so the send fires.
      claimStub = sandbox.stub(Models.NotificationDispatched, 'claim').resolves(true)
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

    it('skips a subscriber whose (event, user) pair was already dispatched', async () => {
      sandbox
        .stub(Models.TelegramSubscription, 'findActiveSubscribersForDao')
        .resolves([{ telegramUserId: 1, chatId: 1 } as any, { telegramUserId: 2, chatId: 2 } as any])
      // user 1 already saw this event, user 2 is fresh
      claimStub.onCall(0).resolves(false)
      claimStub.onCall(1).resolves(true)

      await consumerCb(buildMsg())
      expect(api.sendMessage.callCount).to.eq(1)
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
      // Each call must use MarkdownV2 and have its rate-limit-friendly preview disabled
      const opts = api.sendMessage.firstCall.args[2]
      expect(opts.parse_mode).to.eq('MarkdownV2')
      expect(opts.link_preview_options.is_disabled).to.eq(true)
    })

    it('marks a subscriber as Blocked on a 403 from Telegram', async () => {
      const blockedSub = { telegramUserId: 99, chatId: 99 } as any
      sandbox.stub(Models.TelegramSubscription, 'findActiveSubscribersForDao').resolves([blockedSub])

      const setStatus = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({ setStatus } as any)

      api.sendMessage.rejects(
        new GrammyError(
          'Forbidden: bot was blocked by the user',
          { ok: false, error_code: 403, description: 'Forbidden: bot was blocked by the user' } as any,
          'sendMessage' as any,
          {} as any,
        ),
      )

      await consumerCb(buildMsg())
      expect(setStatus.calledWith(ITelegramSubscriptionStatus.Blocked)).to.be.true
    })

    it('pauses subsequent sends when Telegram returns 429 with retry_after', async () => {
      sandbox
        .stub(Models.TelegramSubscription, 'findActiveSubscribersForDao')
        .resolves([{ telegramUserId: 1, chatId: 1 } as any])

      // First send returns 429, second send (next event) should wait until pauseUntil.
      api.sendMessage.onFirstCall().rejects(
        new GrammyError(
          'Too Many Requests: retry after 2',
          {
            ok: false,
            error_code: 429,
            description: 'Too Many Requests: retry after 2',
            parameters: { retry_after: 2 },
          } as any,
          'sendMessage' as any,
          {} as any,
        ),
      )

      const beforeFirst = Date.now()
      await consumerCb(buildMsg({ id: 'evt-1' }))

      // The dispatcher itself doesn't fail the message; pause is internal state.
      // Verify by introspecting the private field — we own the test, so it's fair.
      const pauseUntil = (dispatcher as any).pauseUntil as number
      expect(pauseUntil).to.be.greaterThan(beforeFirst + 2_000) // retry_after=2s
      expect(pauseUntil).to.be.lessThan(beforeFirst + 5_000) // sanity upper bound
    })

    it('rethrows on Mongo failure during dedup claim so RabbitMQ does not ack', async () => {
      sandbox
        .stub(Models.TelegramSubscription, 'findActiveSubscribersForDao')
        .resolves([{ telegramUserId: 1, chatId: 1 } as any])
      claimStub.rejects(new Error('mongo connection lost'))

      // Infrastructure errors must propagate so the message is redelivered.
      let thrown: Error | undefined
      try {
        await consumerCb(buildMsg())
      } catch (err) {
        thrown = err as Error
      }
      expect(thrown).to.be.instanceOf(Error)
      expect(thrown!.message).to.eq('mongo connection lost')
      expect(api.sendMessage.called).to.be.false
    })

    it('does NOT rethrow on Telegram-side send failure (dedup row already exists)', async () => {
      sandbox
        .stub(Models.TelegramSubscription, 'findActiveSubscribersForDao')
        .resolves([{ telegramUserId: 1, chatId: 1 } as any])
      api.sendMessage.rejects(
        new GrammyError(
          'Bad Request: chat not found',
          { ok: false, error_code: 400, description: 'Bad Request: chat not found' } as any,
          'sendMessage' as any,
          {} as any,
        ),
      )

      // Should NOT throw — telegram-side errors are swallowed per-subscriber
      // because the dedup row already exists, so a redelivery would skip
      // anyway. No point banging on Rabbit.
      await consumerCb(buildMsg())
      expect(api.sendMessage.calledOnce).to.be.true
    })
  })
})
