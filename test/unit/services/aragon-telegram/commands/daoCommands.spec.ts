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
const OTHER_DAO = '0x1111111111111111111111111111111111111111' as HexAddress

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

/** Stub the batched name lookup the subscription list runs (`Dao.find` with an `$or` of refs). */
const stubDaoNames = (sandbox: SinonSandbox, daos: { network: NetworksEnum; address: HexAddress; name: string }[]) =>
  sandbox.stub(Models.Dao, 'find').resolves(daos as any)

/** Resolves the handlers wired up by registerDao via a fake bot. */
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
    it('is wired to /subscriptions', () => {
      const { handlers } = buildHandlers()
      expect(handlers.subscriptions).to.eq(listHandler)
      expect(handlers.dao).to.be.undefined
    })

    it('returns silently when there is no Telegram user', async () => {
      const ctx = fakeCtx({ from: undefined })
      await listHandler(ctx)
      expect(ctx.reply.called).to.be.false
    })

    it('shows the empty state when the user has no subscriptions', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const ctx = fakeCtx()
      await listHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include("aren't subscribed to any organizations")
      const buttons = JSON.stringify(ctx.reply.firstCall.args[1].reply_markup.inline_keyboard)
      expect(buttons).to.include('Subscribe to an organization')
    })

    it('lists one button per organization when there are subscriptions', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [
          {
            daoId: DAO_ID,
            events: [ITelegramNotificationEvent.ProposalCreated],
          },
        ],
      } as any)
      const findStub = stubDaoNames(sandbox, [
        { network: NetworksEnum.ethereumSepolia, address: DAO, name: 'Andr DAO' },
      ])

      const ctx = fakeCtx()
      await listHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('Your notifications')
      // A single page fits one keyboard, so no page indicator and no nav buttons.
      expect(ctx.reply.firstCall.args[0]).to.not.include('Page')
      const buttons = JSON.stringify(ctx.reply.firstCall.args[1].reply_markup.inline_keyboard)
      expect(buttons).to.include('Andr DAO')
      expect(buttons).to.include(`d:o:${DAO_ID}`)
      expect(buttons).to.include('Subscribe to another organization')
      expect(buttons).to.not.include('Next')
      // Names resolve through one batched query, not one lookup per subscription.
      expect(findStub.calledOnce).to.be.true
    })

    it('labels a row with the raw id when the id is unparseable or the DAO is unknown', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [
          { daoId: 'not-a-dao-id', events: [] },
          { daoId: DAO_ID, events: [ITelegramNotificationEvent.ProposalCreated] },
        ],
      } as any)
      stubDaoNames(sandbox, [])

      const ctx = fakeCtx()
      await listHandler(ctx)
      const buttons = JSON.stringify(ctx.reply.firstCall.args[1].reply_markup.inline_keyboard)
      expect(buttons).to.include('not-a-dao-id')
      expect(buttons).to.include(DAO_ID)
    })

    it('splits more than 10 subscriptions into pages with Next / Previous buttons', async () => {
      const subscriptions = Array.from({ length: 12 }, (_, i) => ({
        daoId: `${NetworksEnum.ethereumSepolia}-0x${i.toString(16).padStart(40, '0')}`,
        events: [],
      }))
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({ subscriptions } as any)
      stubDaoNames(sandbox, [])

      const ctx = fakeCtx()
      await listHandler(ctx)

      expect(ctx.reply.firstCall.args[0]).to.include('Page 1 of 2')
      const buttons = JSON.stringify(ctx.reply.firstCall.args[1].reply_markup.inline_keyboard)
      expect(buttons).to.include(subscriptions[0].daoId)
      expect(buttons).to.include(subscriptions[9].daoId)
      expect(buttons).to.not.include(subscriptions[10].daoId)
      expect(buttons).to.include('Next')
      expect(buttons).to.include('d:g:1')
      expect(buttons).to.not.include('Previous')
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
      expect(ctx.reply.firstCall.args[0]).to.include('All notifications are paused')
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
      expect(ctx.reply.firstCall.args[0]).to.include('All notifications are on')
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

  describe('callback (d:l / d:[omr]:)', () => {
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

    it('handles "open" by editing the message into the detail view with explicit actions', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [{ daoId: DAO_ID, events: [ITelegramNotificationEvent.ProposalCreated] }],
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `d:o:${DAO_ID}` } })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.calledOnce).to.be.true
      expect(ctx.editMessageText.firstCall.args[0]).to.include('Andr')
      expect(ctx.editMessageText.firstCall.args[0]).to.include('Notifications are on')
      const buttons = JSON.stringify(ctx.editMessageText.firstCall.args[1].reply_markup.inline_keyboard)
      expect(buttons).to.include('Pause notifications')
      expect(buttons).to.include('Unsubscribe')
      expect(buttons).to.include('Back to notifications')
    })

    it('shows Resume in the detail view when the organization is paused', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [{ daoId: DAO_ID, events: [] }],
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `d:o:${DAO_ID}` } })
      await cb(ctx)
      expect(ctx.editMessageText.firstCall.args[0]).to.include('Notifications are paused')
      const buttons = JSON.stringify(ctx.editMessageText.firstCall.args[1].reply_markup.inline_keyboard)
      expect(buttons).to.include('Resume notifications')
    })

    it('tells the user in the detail view when the whole account is paused', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        status: ITelegramSubscriptionStatus.Paused,
        subscriptions: [{ daoId: DAO_ID, events: [ITelegramNotificationEvent.ProposalCreated] }],
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `d:o:${DAO_ID}` } })
      await cb(ctx)
      // The per-organization line alone would claim notifications flow while /pause silences them.
      expect(ctx.editMessageText.firstCall.args[0]).to.include('Notifications are on')
      expect(ctx.editMessageText.firstCall.args[0]).to.include('paused for your account')
      expect(ctx.editMessageText.firstCall.args[0]).to.include('/resume')
    })

    it('says the bot record was deleted when "remove" takes the last subscription', async () => {
      const subscription = {
        subscriptions: [{ daoId: DAO_ID, events: [] }],
        removeDaoSubscription: sandbox.stub().callsFake(async () => {
          subscription.subscriptions = []
        }),
      }
      const deleteMarkersStub = sandbox.stub(Models.TelegramNotifiedEvent, 'deleteMany').resolves({} as any)
      const findStub = sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId')
      findStub.onFirstCall().resolves(subscription as any)
      // renderList re-fetches; return an empty record so it shows the empty state.
      findStub.onSecondCall().resolves(null)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `d:r:${DAO_ID}` } })
      await cb(ctx)
      expect(subscription.removeDaoSubscription.calledOnce).to.be.true
      expect(deleteMarkersStub.calledOnce).to.be.true
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('no longer subscribed to Andr')
      expect(ctx.editMessageText.firstCall.args[0]).to.include("aren't subscribed to any organizations")
      expect(ctx.reply.firstCall.args[0]).to.include('That was your last subscription')
    })

    it('stays quiet about deletion when "remove" leaves other subscriptions behind', async () => {
      const other = { daoId: `${NetworksEnum.ethereumSepolia}-${OTHER_DAO}`, events: [] }
      const subscription = {
        subscriptions: [{ daoId: DAO_ID, events: [] }, other],
        removeDaoSubscription: sandbox.stub().callsFake(async () => {
          subscription.subscriptions = [other]
        }),
      }
      const deleteMarkersStub = sandbox.stub(Models.TelegramNotifiedEvent, 'deleteMany').resolves({} as any)
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(subscription as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `d:r:${DAO_ID}` } })
      await cb(ctx)

      expect(subscription.removeDaoSubscription.calledOnce).to.be.true
      // Markers belong to the whole record, so they survive while any subscription does.
      expect(deleteMarkersStub.called).to.be.false
      expect(ctx.reply.called).to.be.false
    })

    it('pauses a running organization from the detail view', async () => {
      const setEvents = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [{ daoId: DAO_ID, events: [ITelegramNotificationEvent.ProposalCreated] }],
        setEvents,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `d:m:${DAO_ID}` } })
      await cb(ctx)
      expect(setEvents.calledOnce).to.be.true
      expect(setEvents.firstCall.args[1]).to.deep.eq([])
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('paused for Andr')
      expect(ctx.editMessageText.firstCall.args[0]).to.include('Notifications are paused')
    })

    it('resumes a paused organization from the detail view', async () => {
      const setEvents = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [{ daoId: DAO_ID, events: [] }],
        setEvents,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `d:m:${DAO_ID}` } })
      await cb(ctx)
      expect(setEvents.firstCall.args[1]).to.deep.eq(TELEGRAM_DEFAULT_EVENTS)
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('on for Andr')
      expect(ctx.editMessageText.firstCall.args[0]).to.include('Notifications are on')
    })

    it('says the account is still paused when resuming an organization during /pause', async () => {
      const setEvents = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        status: ITelegramSubscriptionStatus.Paused,
        subscriptions: [{ daoId: DAO_ID, events: [] }],
        setEvents,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `d:m:${DAO_ID}` } })
      await cb(ctx)
      expect(setEvents.firstCall.args[1]).to.deep.eq(TELEGRAM_DEFAULT_EVENTS)
      // The org is enabled, but the account-wide pause still stops delivery.
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('on for Andr')
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('paused for your account')
    })

    it('goes back to the list from the detail view', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [{ daoId: DAO_ID, events: [] }],
      } as any)
      stubDaoNames(sandbox, [{ network: NetworksEnum.ethereumSepolia, address: DAO, name: 'Andr' }])

      const ctx = fakeCtx({ callbackQuery: { data: 'd:l' } })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.calledOnce).to.be.true
      expect(ctx.editMessageText.firstCall.args[0]).to.include('Your notifications')
      const buttons = JSON.stringify(ctx.editMessageText.firstCall.args[1].reply_markup.inline_keyboard)
      expect(buttons).to.include('Andr')
    })

    it('navigates to a later page and clamps a stale page number', async () => {
      const subscriptions = Array.from({ length: 12 }, (_, i) => ({
        daoId: `${NetworksEnum.ethereumSepolia}-0x${i.toString(16).padStart(40, '0')}`,
        events: [],
      }))
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({ subscriptions } as any)
      stubDaoNames(sandbox, [])

      const ctx = fakeCtx({ callbackQuery: { data: 'd:g:1' } })
      await cb(ctx)
      expect(ctx.editMessageText.firstCall.args[0]).to.include('Page 2 of 2')
      let buttons = JSON.stringify(ctx.editMessageText.firstCall.args[1].reply_markup.inline_keyboard)
      expect(buttons).to.include(subscriptions[10].daoId)
      expect(buttons).to.include('Previous')
      expect(buttons).to.include('d:g:0')
      expect(buttons).to.not.include('Next')

      // A Next button left over from before unsubscribes can point past the end.
      const stale = fakeCtx({ callbackQuery: { data: 'd:g:9' } })
      await cb(stale)
      expect(stale.editMessageText.firstCall.args[0]).to.include('Page 2 of 2')
      buttons = JSON.stringify(stale.editMessageText.firstCall.args[1].reply_markup.inline_keyboard)
      expect(buttons).to.include(subscriptions[11].daoId)
    })

    it('truncates long labels in the list at 30 characters', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [{ daoId: DAO_ID, events: [] }],
      } as any)
      stubDaoNames(sandbox, [
        { network: NetworksEnum.ethereumSepolia, address: DAO, name: 'A DAO with a very long name that gets cut' },
      ])

      const ctx = fakeCtx({ callbackQuery: { data: 'd:l' } })
      await cb(ctx)
      const buttons = JSON.stringify(ctx.editMessageText.firstCall.args[1].reply_markup.inline_keyboard)
      expect(buttons).to.include('A DAO with a very long name')
      expect(buttons).to.not.include('that gets cut')
    })

    it('ignores Telegram errors while redrawing after a remove', async () => {
      const removeStub = sandbox.stub().resolves()
      const findStub = sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId')
      findStub.onFirstCall().resolves({
        subscriptions: [{ daoId: DAO_ID, events: [] }],
        removeDaoSubscription: removeStub,
      } as any)
      findStub.onSecondCall().resolves(null)
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

      const ctx = fakeCtx({
        callbackQuery: { data: `d:r:${DAO_ID}` },
        editMessageText: sinon.stub().rejects(new Error('tg down')),
      })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('no longer subscribed')
    })

    it('ignores Telegram errors while rendering the detail view', async () => {
      const setEvents = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [{ daoId: DAO_ID, events: [] }],
        setEvents,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({
        callbackQuery: { data: `d:m:${DAO_ID}` },
        editMessageText: sinon.stub().rejects(new Error('tg down')),
      })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('on for Andr')
    })

    it('answers an unknown action without touching the subscription', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [{ daoId: DAO_ID, events: [] }],
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

      const ctx = fakeCtx({ callbackQuery: { data: `d:x:${DAO_ID}` } })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.be.undefined
      expect(ctx.reply.called).to.be.false
    })

    it('answers with "no subscription" when the tapped organization is no longer on the record', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [],
      } as any)
      const ctx = fakeCtx({ callbackQuery: { data: `d:o:${DAO_ID}` } })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('No subscription')
    })

    it('answers the callback when the user has no subscription record', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const ctx = fakeCtx({ callbackQuery: { data: `d:o:${DAO_ID}` } })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('No subscription')
    })
  })
})
