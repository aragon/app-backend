import { Models } from '@dbModels'
import { registerPrivacy } from '@services/aragon-telegram/commands/privacyCommands'
import { ITelegramSubscriptionStatus } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const fakeCtx = (overrides: Record<string, any> = {}) =>
  ({
    from: { id: 100 },
    chat: { id: 100, type: 'private' },
    reply: sinon.stub().resolves(),
    answerCallbackQuery: sinon.stub().resolves(),
    editMessageText: sinon.stub().resolves(),
    callbackQuery: undefined,
    ...overrides,
  }) as any

const buildHandlers = () => {
  const handlers: Record<string, any> = {}
  const callbacks: { regex: RegExp; handler: any }[] = []
  registerPrivacy({
    command: (name: string, h: any) => {
      handlers[name] = h
    },
    callbackQuery: (regex: RegExp, h: any) => {
      callbacks.push({ regex, handler: h })
    },
  } as any)
  return { handlers, callbacks }
}

describe('AragonTelegram: privacyCommands', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('privacy', () => {
    it('replies with what we store, user rights, and the policy URL', async () => {
      const { handlers } = buildHandlers()
      const ctx = fakeCtx()
      await handlers.privacy(ctx)
      const body = ctx.reply.firstCall.args[0]
      expect(body).to.include('Privacy')
      expect(body).to.include('Telegram user ID')
      expect(body).to.include('No marketing, no profiling')
      expect(body).to.include('/mydata')
      expect(body).to.include('/forget')
      expect(body).to.include('aragon.org/privacy-policy')
    })
  })

  describe('mydata', () => {
    it('replies "no data" when the user has no record', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const { handlers } = buildHandlers()
      const ctx = fakeCtx()
      await handlers.mydata(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include("don't have any data")
    })

    it('returns silently when there is no Telegram user', async () => {
      const findStub = sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId')
      const { handlers } = buildHandlers()
      const ctx = fakeCtx({ from: undefined })
      await handlers.mydata(ctx)
      expect(findStub.called).to.be.false
      expect(ctx.reply.called).to.be.false
    })

    it('exports the stored payload when the user has a record', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        telegramUserId: 100,
        chatId: 100,
        status: ITelegramSubscriptionStatus.Active,
        subscriptions: [{ daoId: 'ethereum-sepolia-0xabc', events: [], subscribedAt: 0 }],
        consent: { version: '2026-08-24', acceptedAt: 0 },
      } as any)
      const { handlers } = buildHandlers()
      const ctx = fakeCtx()
      await handlers.mydata(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('telegramUserId')
      expect(ctx.reply.firstCall.args[0]).to.include('100')
      // the export must show which disclosure the user accepted, and when
      expect(ctx.reply.firstCall.args[0]).to.include('"version": "2026-08-24"')
      expect(ctx.reply.firstCall.args[0]).to.include('1970-01-01T00:00:00.000Z')
      // Privacy: we don't store these any more — make sure they don't leak in.
      expect(ctx.reply.firstCall.args[0]).to.not.include('username')
      expect(ctx.reply.firstCall.args[0]).to.not.include('languageCode')
    })
  })

  describe('forget', () => {
    it('replies "nothing to forget" when the user has no record', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const { handlers } = buildHandlers()
      const ctx = fakeCtx()
      await handlers.forget(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('Nothing to forget')
    })

    it('returns silently when there is no Telegram user', async () => {
      const findStub = sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId')
      const { handlers } = buildHandlers()
      const ctx = fakeCtx({ from: undefined })
      await handlers.forget(ctx)
      expect(findStub.called).to.be.false
      expect(ctx.reply.called).to.be.false
    })

    it('asks for confirmation with a Yes/Cancel inline keyboard', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        subscriptions: [],
      } as any)
      const { handlers } = buildHandlers()
      const ctx = fakeCtx()
      await handlers.forget(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('Are you sure')
      expect(ctx.reply.firstCall.args[1].reply_markup).to.exist
    })
  })

  describe('forget callback (forget:)', () => {
    let cb: any
    beforeEach(() => {
      const { callbacks } = buildHandlers()
      cb = callbacks[0].handler
    })

    it('cancels and edits the message when the user taps "no"', async () => {
      const ctx = fakeCtx({ callbackQuery: { data: 'forget:no' } })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.eq('Cancelled')
      expect(ctx.editMessageText.firstCall.args[0]).to.include('Cancelled')
    })

    it('deletes the user record and edits the message when the user taps "yes"', async () => {
      const deleteStub = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        deleteOne: deleteStub,
      } as any)

      const ctx = fakeCtx({ callbackQuery: { data: 'forget:yes' } })
      await cb(ctx)
      expect(deleteStub.calledOnce).to.be.true
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.eq('Deleted')
      expect(ctx.editMessageText.firstCall.args[0]).to.include('deleted')
    })

    it('treats a callback without data as a delete and copes with a missing record', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)

      const ctx = fakeCtx({ callbackQuery: { data: undefined } })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.eq('Deleted')
      expect(ctx.editMessageText.firstCall.args[0]).to.include('deleted')
    })

    it('returns silently when there is no user', async () => {
      const ctx = fakeCtx({ from: undefined, callbackQuery: { data: 'forget:yes' } })
      await cb(ctx)
      expect(ctx.editMessageText.called).to.be.false
    })

    it('still cancels cleanly when editing the message fails', async () => {
      const ctx = fakeCtx({
        callbackQuery: { data: 'forget:no' },
        editMessageText: sinon.stub().rejects(new Error('tg down')),
      })
      await cb(ctx)
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.eq('Cancelled')
    })

    it('still deletes the data when editing the confirmation message fails', async () => {
      const deleteStub = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        deleteOne: deleteStub,
      } as any)

      const ctx = fakeCtx({
        callbackQuery: { data: 'forget:yes' },
        editMessageText: sinon.stub().rejects(new Error('tg down')),
      })
      await cb(ctx)
      expect(deleteStub.calledOnce).to.be.true
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.eq('Deleted')
    })
  })
})
