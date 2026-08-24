import { Models } from '@dbModels'
import { listHandler, registerDao } from '@services/aragon-telegram/commands/daoCommands'
import {
  type HexAddress,
  ITelegramNotificationEvent,
  ITelegramSubscriptionStatus,
  NetworksEnum,
  TELEGRAM_DEFAULT_EVENTS,
} from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const DAO = '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress
const DAO_ID = `${NetworksEnum.ethereumSepolia}-${DAO}`

const fakeCtx = (overrides: Record<string, any> = {}) =>
  ({
    from: { id: 100 },
    chat: { id: 100, type: 'private' },
    reply: sinon.stub().resolves(),
    answerCallbackQuery: sinon.stub().resolves(),
    editMessageText: sinon.stub().resolves(),
    editMessageReplyMarkup: sinon.stub().resolves(),
    callbackQuery: undefined,
    ...overrides,
  }) as any

/** Resolves the four handlers wired up by registerDao via a fake bot. */
const buildHandlers = () => {
  const handlers: Record<string, any> = {}
  const callbacks: { regex: RegExp; handler: any }[] = []
  registerDao({
    command: (name: string, h: any) => {
      handlers[name] = h
    },
    callbackQuery: (regex: RegExp, h: any) => {
      callbacks.push({ regex, handler: h })
    },
  } as any)
  return { handlers, callbacks }
}

describe('AragonTelegram: daoCommands', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('listHandler', () => {
    it('returns silently when there is no Telegram user', async () => {
      const ctx = fakeCtx({ from: undefined })
      await listHandler(ctx)
      expect(ctx.reply.called).to.be.false
    })

    it('shows the empty-state keyboard when the user has no subscriptions', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const ctx = fakeCtx()
      await listHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('not following any DAOs')
    })

    it('lists the user’s DAOs when there are subscriptions', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [
          {
            daoId: DAO_ID,
            events: [ITelegramNotificationEvent.ProposalCreated],
          },
        ],
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr DAO' } as any)

      const ctx = fakeCtx()
      await listHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('Your DAOs')
    })

    it('labels a row with the raw id when the id is unparseable or the DAO is unknown', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [
          { daoId: 'not-a-dao-id', events: [] },
          { daoId: DAO_ID, events: [ITelegramNotificationEvent.ProposalCreated] },
        ],
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

      const ctx = fakeCtx()
      await listHandler(ctx)
      const buttons = JSON.stringify(ctx.reply.firstCall.args[1].reply_markup.inline_keyboard)
      expect(buttons).to.include('not-a-dao-id')
      expect(buttons).to.include(DAO_ID)
    })
  })

  describe('pause / resume', () => {
    it('pause replies "nothing to pause" when the user has no record', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const { handlers } = buildHandlers()
      const ctx = fakeCtx()
      await handlers.pause(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('Nothing to pause')
    })

    it('pause flips status to Paused for an existing subscription', async () => {
      const setStatus = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({ setStatus } as any)
      const { handlers } = buildHandlers()
      const ctx = fakeCtx()
      await handlers.pause(ctx)
      expect(setStatus.calledWith(ITelegramSubscriptionStatus.Paused)).to.be.true
      expect(ctx.reply.firstCall.args[0]).to.include('paused')
    })

    it('resume replies "nothing to resume" when the user has no record', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const { handlers } = buildHandlers()
      const ctx = fakeCtx()
      await handlers.resume(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('Nothing to resume')
    })

    it('resume flips status to Active for an existing subscription', async () => {
      const setStatus = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({ setStatus } as any)
      const { handlers } = buildHandlers()
      const ctx = fakeCtx()
      await handlers.resume(ctx)
      expect(setStatus.calledWith(ITelegramSubscriptionStatus.Active)).to.be.true
      expect(ctx.reply.firstCall.args[0]).to.include('resumed')
    })

    it('pause skips the lookup when there is no Telegram user', async () => {
      const findStub = sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId')
      const { handlers } = buildHandlers()
      const ctx = fakeCtx({ from: undefined })
      await handlers.pause(ctx)
      expect(findStub.called).to.be.false
      expect(ctx.reply.firstCall.args[0]).to.include('Nothing to pause')
    })

    it('resume skips the lookup when there is no Telegram user', async () => {
      const findStub = sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId')
      const { handlers } = buildHandlers()
      const ctx = fakeCtx({ from: undefined })
      await handlers.resume(ctx)
      expect(findStub.called).to.be.false
      expect(ctx.reply.firstCall.args[0]).to.include('Nothing to resume')
    })
  })

  describe('callback (d:[omr]:)', () => {
    let cb: any
    beforeEach(() => {
      const { callbacks } = buildHandlers()
      cb = callbacks[0].handler
    })

    it('rejects an unparseable daoId', async () => {
      const ctx = fakeCtx({ callbackQuery: { data: 'd:o:bogus' } })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('Invalid')
    })

    it('answers without acting when the callback has no data', async () => {
      const ctx = fakeCtx({ callbackQuery: {} })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.calledOnce).to.be.true
      expect(ctx.reply.called).to.be.false
    })

    it('answers without acting when there is no Telegram user', async () => {
      const ctx = fakeCtx({ from: undefined, callbackQuery: { data: `d:o:${DAO_ID}` } })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.calledOnce).to.be.true
      expect(ctx.reply.called).to.be.false
    })

    it('handles "open" by replying with mute state', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [{ daoId: DAO_ID, events: [ITelegramNotificationEvent.ProposalCreated] }],
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `d:o:${DAO_ID}` } })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.calledOnce).to.be.true
      expect(ctx.reply.firstCall.args[0]).to.include('Andr')
      expect(ctx.reply.firstCall.args[0]).to.include('on')
    })

    it('handles "remove" by removing the subscription and refreshing the keyboard', async () => {
      const removeStub = sandbox.stub().resolves()
      const findStub = sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId')
      findStub.onFirstCall().resolves({
        subscriptions: [{ daoId: DAO_ID, events: [] }],
        removeDaoSubscription: removeStub,
      } as any)
      // refreshKeyboard re-fetches; return an empty record so it shows the empty keyboard.
      findStub.onSecondCall().resolves(null)

      const ctx = fakeCtx({ callbackQuery: { data: `d:r:${DAO_ID}` } })
      await cb(ctx)
      expect(removeStub.calledOnce).to.be.true
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('Unsubscribed')
    })

    it('handles "mute toggle" by flipping the events array', async () => {
      const setEvents = sandbox.stub().resolves()
      const findStub = sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId')
      findStub.onFirstCall().resolves({
        subscriptions: [{ daoId: DAO_ID, events: [ITelegramNotificationEvent.ProposalCreated] }],
        setEvents,
      } as any)
      findStub.onSecondCall().resolves(null)

      const ctx = fakeCtx({ callbackQuery: { data: `d:m:${DAO_ID}` } })
      await cb(ctx)
      expect(setEvents.calledOnce).to.be.true
      // currently subscribed with events → toggle should mute (events: [])
      expect(setEvents.firstCall.args[1]).to.deep.eq([])
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('muted')
    })

    it('redraws the DAO buttons after a mute toggle when subscriptions remain', async () => {
      const setEvents = sandbox.stub().resolves()
      const findStub = sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId')
      findStub.resolves({
        subscriptions: [{ daoId: DAO_ID, events: [] }],
        setEvents,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'A DAO with a very long name that gets cut' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `d:m:${DAO_ID}` } })
      await cb(ctx)
      // muted record → toggle turns notifications back on
      expect(setEvents.firstCall.args[1]).to.deep.eq(TELEGRAM_DEFAULT_EVENTS)
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('enabled')
      const buttons = JSON.stringify(ctx.editMessageReplyMarkup.firstCall.args[0].reply_markup.inline_keyboard)
      // labels longer than 30 chars are cut at 28 and get an ellipsis
      expect(buttons).to.include('A DAO with a very long name')
      expect(buttons).to.not.include('that gets cut')
    })

    it('ignores Telegram errors while redrawing the empty-state message', async () => {
      const removeStub = sandbox.stub().resolves()
      const findStub = sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId')
      findStub.onFirstCall().resolves({
        subscriptions: [{ daoId: DAO_ID, events: [] }],
        removeDaoSubscription: removeStub,
      } as any)
      findStub.onSecondCall().resolves(null)

      const ctx = fakeCtx({
        callbackQuery: { data: `d:r:${DAO_ID}` },
        editMessageText: sinon.stub().rejects(new Error('tg down')),
      })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('Unsubscribed')
    })

    it('ignores Telegram errors while redrawing the DAO buttons', async () => {
      const setEvents = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [{ daoId: DAO_ID, events: [] }],
        setEvents,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({
        callbackQuery: { data: `d:m:${DAO_ID}` },
        editMessageReplyMarkup: sinon.stub().rejects(new Error('tg down')),
      })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('enabled')
    })

    it('answers an unknown action without touching the subscription', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [{ daoId: DAO_ID, events: [] }],
      } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `d:x:${DAO_ID}` } })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.be.undefined
      expect(ctx.reply.called).to.be.false
    })

    it('still answers "open" when the follow-up reply fails', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [{ daoId: DAO_ID, events: [] }],
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

      const ctx = fakeCtx({
        callbackQuery: { data: `d:o:${DAO_ID}` },
        reply: sinon.stub().rejects(new Error('tg down')),
      })
      await cb(ctx)
      // no DAO row → the id itself is the name
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.eq(`Active: ${DAO_ID}`)
    })

    it('answers the callback when the user has no subscription record', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const ctx = fakeCtx({ callbackQuery: { data: `d:o:${DAO_ID}` } })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('No subscription')
    })
  })
})
