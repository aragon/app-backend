import { Models } from '@dbModels'
import {
  consentCallback,
  helpHandler,
  menuCallback,
  registerOnboarding,
  startHandler,
} from '@services/aragon-telegram/commands/onboardingCommands'
import { type HexAddress, ITelegramSubscriptionStatus, NetworksEnum, TELEGRAM_CONSENT_VERSION } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const DAO = '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress

const fakeCtx = (overrides: Record<string, any> = {}) =>
  ({
    from: { id: 100, username: 'sishir', language_code: 'en' },
    chat: { id: 100, type: 'private' },
    match: '',
    reply: sinon.stub().resolves(),
    answerCallbackQuery: sinon.stub().resolves(),
    editMessageText: sinon.stub().resolves(),
    callbackQuery: undefined,
    ...overrides,
  }) as any

const consentedSub = (overrides: Record<string, any> = {}) => ({
  status: ITelegramSubscriptionStatus.Active,
  consent: { version: TELEGRAM_CONSENT_VERSION },
  setStatus: sinon.stub().resolves(),
  addDaoSubscription: sinon.stub().resolves(),
  recordConsent: sinon.stub().resolves(),
  ...overrides,
})

describe('AragonTelegram: onboardingCommands', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('startHandler', () => {
    it('returns silently when there is no Telegram user', async () => {
      const ctx = fakeCtx({ from: undefined })
      await startHandler(ctx)
      expect(ctx.reply.called).to.be.false
    })

    it('prompts a brand-new user for consent and writes nothing', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create')

      const ctx = fakeCtx({ match: '' })
      await startHandler(ctx)

      expect(createStub.called).to.be.false
      expect(ctx.reply.firstCall.args[0]).to.include('Agree to accept and continue')
      const flat = JSON.stringify(ctx.reply.firstCall.args[1].reply_markup.inline_keyboard)
      expect(flat).to.include('c:a')
      expect(flat).to.include('c:x')
    })

    it('greets a consented user with the cold-start menu', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(consentedSub() as any)

      const ctx = fakeCtx({ match: '' })
      await startHandler(ctx)
      expect(ctx.reply.calledOnce).to.be.true
      expect(ctx.reply.firstCall.args[0]).to.include('Welcome')
    })

    it('prompts again when the stored consent is for an older disclosure version', async () => {
      sandbox
        .stub(Models.TelegramSubscription, 'findByTelegramUserId')
        .resolves(consentedSub({ consent: { version: '2020-01-01' } }) as any)

      const ctx = fakeCtx({ match: '' })
      await startHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('Agree to accept and continue')
    })

    it('reactivates a Blocked consented user when they /start again', async () => {
      const sub = consentedSub({ status: ITelegramSubscriptionStatus.Blocked })
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)

      const ctx = fakeCtx({ match: '' })
      await startHandler(ctx)
      expect(sub.setStatus.calledWith(ITelegramSubscriptionStatus.Active)).to.be.true
    })

    it('asks for consent before subscribing on a deep link from a new user', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create')
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)

      expect(createStub.called).to.be.false
      expect(ctx.reply.firstCall.args[0]).to.include('Andr')
      expect(ctx.reply.firstCall.args[0]).to.include('Agree to accept and subscribe')
      const flat = JSON.stringify(ctx.reply.firstCall.args[1].reply_markup.inline_keyboard)
      expect(flat).to.include(`c:s:${NetworksEnum.ethereumSepolia}-${DAO}`)
    })

    it('auto-subscribes a consented user on a deep link to a real DAO', async () => {
      const sub = consentedSub()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)
      expect(sub.addDaoSubscription.calledOnce).to.be.true
      expect(sub.addDaoSubscription.firstCall.args[0]).to.deep.include({
        network: NetworksEnum.ethereumSepolia,
        daoAddress: DAO,
      })
      expect(ctx.reply.lastCall.args[0]).to.include('now following')
      // Subscription disclosure must accompany the deep-link auto-subscribe reply.
      expect(ctx.reply.lastCall.args[0]).to.include('No marketing, no profiling')
      expect(ctx.reply.lastCall.args[0]).to.include('/forget')
    })

    it('reactivates a Blocked consented user on a deep link before subscribing', async () => {
      const sub = consentedSub({ status: ITelegramSubscriptionStatus.Blocked })
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)
      expect(sub.setStatus.calledWith(ITelegramSubscriptionStatus.Active)).to.be.true
      expect(sub.addDaoSubscription.calledOnce).to.be.true
    })

    it('greets a consented user when the command carries no payload at all', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(consentedSub() as any)

      const ctx = fakeCtx({ match: undefined })
      await startHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('Welcome')
    })

    it("tells the user when the deep-linked DAO doesn't exist", async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include("couldn't find that DAO")
    })

    it('surfaces the addDaoSubscription error to the user when subscribe fails', async () => {
      const sub = consentedSub({
        addDaoSubscription: sinon.stub().rejects(new Error('Subscription limit reached (50)')),
      })
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)
      expect(ctx.reply.lastCall.args[0]).to.include("Couldn't subscribe")
      expect(ctx.reply.lastCall.args[0]).to.include('limit reached')
    })
  })

  describe('consentCallback', () => {
    it('creates the record and records consent on Agree', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const recordConsent = sandbox.stub().resolves()
      const createStub = sandbox
        .stub(Models.TelegramSubscription, 'create')
        .resolves({ recordConsent, status: ITelegramSubscriptionStatus.Active } as any)

      const ctx = fakeCtx({ callbackQuery: { data: 'c:a' } })
      await consentCallback(ctx)

      expect(createStub.firstCall.args[0]).to.deep.include({ telegramUserId: 100, chatId: 100 })
      expect(recordConsent.calledOnceWith(TELEGRAM_CONSENT_VERSION)).to.be.true
      expect(ctx.reply.firstCall.args[0]).to.include('Welcome')
    })

    it('subscribes to the DAO on Agree-and-subscribe, falling back to the user id as chat id', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const recordConsent = sandbox.stub().resolves()
      const addStub = sandbox.stub().resolves()
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create').resolves({
        recordConsent,
        addDaoSubscription: addStub,
        status: ITelegramSubscriptionStatus.Active,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `c:s:ethereum-sepolia-${DAO}` }, chat: undefined })
      await consentCallback(ctx)

      expect(createStub.firstCall.args[0]).to.deep.include({ telegramUserId: 100, chatId: 100 })
      expect(recordConsent.calledOnceWith(TELEGRAM_CONSENT_VERSION)).to.be.true
      expect(addStub.firstCall.args[0]).to.deep.include({
        network: NetworksEnum.ethereumSepolia,
        daoAddress: DAO,
      })
      expect(ctx.reply.lastCall.args[0]).to.include('now following')
    })

    it('reactivates a Blocked user who agrees again', async () => {
      const sub = consentedSub({ status: ITelegramSubscriptionStatus.Blocked })
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)

      const ctx = fakeCtx({ callbackQuery: { data: 'c:a' } })
      await consentCallback(ctx)
      expect(sub.setStatus.calledWith(ITelegramSubscriptionStatus.Active)).to.be.true
      expect(sub.recordConsent.calledOnceWith(TELEGRAM_CONSENT_VERSION)).to.be.true
    })

    it('writes nothing and confirms on Cancel', async () => {
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create')

      const ctx = fakeCtx({ callbackQuery: { data: 'c:x' } })
      await consentCallback(ctx)

      expect(createStub.called).to.be.false
      expect(ctx.editMessageText.firstCall.args[0]).to.include('cancelled')
    })

    it('rejects an invalid DAO id without creating a record', async () => {
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create')

      const ctx = fakeCtx({ callbackQuery: { data: 'c:s:not-a-dao' } })
      await consentCallback(ctx)

      expect(createStub.called).to.be.false
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('Invalid DAO id')
    })

    it('rejects a missing DAO without creating a record', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create')

      const ctx = fakeCtx({ callbackQuery: { data: `c:s:ethereum-sepolia-${DAO}` } })
      await consentCallback(ctx)

      expect(createStub.called).to.be.false
      expect(ctx.reply.firstCall.args[0]).to.include("couldn't find that DAO")
    })

    it('surfaces the addDaoSubscription error after consent', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      sandbox.stub(Models.TelegramSubscription, 'create').resolves({
        recordConsent: sandbox.stub().resolves(),
        addDaoSubscription: sandbox.stub().rejects(new Error('Subscription limit reached (50)')),
        status: ITelegramSubscriptionStatus.Active,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `c:s:ethereum-sepolia-${DAO}` } })
      await consentCallback(ctx)
      expect(ctx.reply.lastCall.args[0]).to.include("Couldn't subscribe")
    })

    it('answers a callback that carries no data without replying', async () => {
      const ctx = fakeCtx({ callbackQuery: { data: undefined } })
      await consentCallback(ctx)
      expect(ctx.answerCallbackQuery.calledOnce).to.be.true
      expect(ctx.reply.called).to.be.false
    })

    it('answers an unknown consent action without replying', async () => {
      const ctx = fakeCtx({ callbackQuery: { data: 'c:z' } })
      await consentCallback(ctx)
      expect(ctx.answerCallbackQuery.calledOnce).to.be.true
      expect(ctx.reply.called).to.be.false
    })

    it('swallows Telegram API failures while answering, editing and replying', async () => {
      const failingCtx = (data: string) =>
        fakeCtx({
          callbackQuery: { data },
          answerCallbackQuery: sinon.stub().rejects(new Error('tg down')),
          editMessageText: sinon.stub().rejects(new Error('tg down')),
          reply: sinon.stub().rejects(new Error('tg down')),
        })

      await consentCallback(failingCtx('c:x'))

      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      sandbox.stub(Models.TelegramSubscription, 'create').resolves({
        recordConsent: sinon.stub().resolves(),
        status: ITelegramSubscriptionStatus.Active,
      } as any)
      await consentCallback(failingCtx('c:a'))

      await consentCallback(failingCtx('c:s:not-a-dao'))
      await consentCallback(failingCtx('c:z'))
      await consentCallback(
        fakeCtx({ callbackQuery: { data: undefined }, answerCallbackQuery: sinon.stub().rejects() }),
      )

      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      await consentCallback(failingCtx(`c:s:ethereum-sepolia-${DAO}`))
    })
  })

  describe('helpHandler', () => {
    it('replies with the help text', async () => {
      const ctx = fakeCtx()
      await helpHandler(ctx)
      expect(ctx.reply.calledOnce).to.be.true
      expect(ctx.reply.firstCall.args[0]).to.include('Aragon Notifications Bot')
    })
  })

  describe('menuCallback', () => {
    it('replies with subscribe help when menu:subscribe is tapped', async () => {
      const ctx = fakeCtx({ callbackQuery: { data: 'menu:subscribe' } })
      await menuCallback(ctx)
      expect(ctx.answerCallbackQuery.calledOnce).to.be.true
      expect(ctx.reply.firstCall.args[0]).to.include('To follow a DAO')
    })

    it('forwards menu:list to the dao list handler', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const ctx = fakeCtx({ callbackQuery: { data: 'menu:list' } })
      await menuCallback(ctx)
      expect(ctx.answerCallbackQuery.calledOnce).to.be.true
      // listHandler replies with NO_DAOS_HEADER when the user has none.
      expect(ctx.reply.firstCall.args[0]).to.include('not following any DAOs')
    })

    it('forwards menu:help to the help handler', async () => {
      const ctx = fakeCtx({ callbackQuery: { data: 'menu:help' } })
      await menuCallback(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('Aragon Notifications Bot')
    })

    it('answers the callback query for an unknown action without replying', async () => {
      const ctx = fakeCtx({ callbackQuery: { data: 'menu:unknown' } })
      await menuCallback(ctx)
      expect(ctx.answerCallbackQuery.calledOnce).to.be.true
      expect(ctx.reply.called).to.be.false
    })

    it('answers a callback that carries no data without replying', async () => {
      const ctx = fakeCtx({ callbackQuery: { data: undefined } })
      await menuCallback(ctx)
      expect(ctx.answerCallbackQuery.calledOnce).to.be.true
      expect(ctx.reply.called).to.be.false
    })

    it('swallows Telegram API failures while answering and replying', async () => {
      const ctx = fakeCtx({
        callbackQuery: { data: 'menu:subscribe' },
        answerCallbackQuery: sinon.stub().rejects(new Error('tg down')),
        reply: sinon.stub().rejects(new Error('tg down')),
      })
      await menuCallback(ctx)
      expect(ctx.reply.calledOnce).to.be.true
    })
  })

  describe('registerOnboarding', () => {
    it('wires /start, /help, and the menu + consent callbacks onto the bot', () => {
      const cmds: string[] = []
      const cbs: RegExp[] = []
      registerOnboarding({
        command: (name: string) => {
          cmds.push(name)
        },
        callbackQuery: (regex: RegExp) => {
          cbs.push(regex)
        },
      } as any)
      expect(cmds).to.deep.eq(['start', 'help'])
      expect(cbs.map(r => r.source)).to.deep.eq(['^menu:', '^c:'])
    })
  })
})
