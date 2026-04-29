import { Models } from '@dbModels'
import {
  helpHandler,
  menuCallback,
  startHandler,
} from '@services/aragon-telegram/commands/onboardingCommands'
import { type HexAddress, ITelegramSubscriptionStatus, NetworksEnum } from '@types'
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
    callbackQuery: undefined,
    ...overrides,
  }) as any

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

    it('greets a brand-new user with the cold-start menu when no deep link is provided', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      sandbox.stub(Models.TelegramSubscription, 'create').resolves({
        addDaoSubscription: sandbox.stub().resolves(),
      } as any)

      const ctx = fakeCtx({ match: '' })
      await startHandler(ctx)
      expect(ctx.reply.calledOnce).to.be.true
      expect(ctx.reply.firstCall.args[0]).to.include('Welcome')
    })

    it('reactivates a Blocked user when they /start again', async () => {
      const setStatus = sandbox.stub().resolves()
      const blockedSub = {
        status: ITelegramSubscriptionStatus.Blocked,
        setStatus,
        addDaoSubscription: sandbox.stub().resolves(),
      } as any
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(blockedSub)

      const ctx = fakeCtx({ match: '' })
      await startHandler(ctx)
      expect(setStatus.calledWith(ITelegramSubscriptionStatus.Active)).to.be.true
    })

    it('auto-subscribes the user when given a deep-link payload pointing to a real DAO', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const addStub = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'create').resolves({ addDaoSubscription: addStub } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)
      expect(addStub.calledOnce).to.be.true
      expect(addStub.firstCall.args[0]).to.deep.include({
        network: NetworksEnum.ethereumSepolia,
        daoAddress: DAO,
      })
      expect(ctx.reply.lastCall.args[0]).to.include("now following")
    })

    it("tells the user when the deep-linked DAO doesn't exist", async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      sandbox.stub(Models.TelegramSubscription, 'create').resolves({
        addDaoSubscription: sandbox.stub().resolves(),
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include("couldn't find that DAO")
    })

    it('surfaces the addDaoSubscription error to the user when subscribe fails', async () => {
      const addStub = sandbox.stub().rejects(new Error('Subscription limit reached (50)'))
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      sandbox.stub(Models.TelegramSubscription, 'create').resolves({ addDaoSubscription: addStub } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)
      expect(ctx.reply.lastCall.args[0]).to.include("Couldn't subscribe")
      expect(ctx.reply.lastCall.args[0]).to.include('limit reached')
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
      expect(ctx.reply.firstCall.args[0]).to.include('two options')
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
  })
})
