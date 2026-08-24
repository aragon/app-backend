import { Models } from '@dbModels'
import {
  registerSubscription,
  subscribeHandler,
  unsubscribeHandler,
} from '@services/aragon-telegram/commands/subscriptionCommands'
import { type HexAddress, NetworksEnum, TELEGRAM_CONSENT_VERSION } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const DAO = '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress

const fakeCtx = (match: string, fromId = 100) =>
  ({
    from: { id: fromId, username: 'sishir', language_code: 'en' },
    chat: { id: fromId },
    match,
    reply: sinon.stub().resolves(),
  }) as any

describe('AragonTelegram: subscriptionCommands', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('subscribeHandler', () => {
    it('returns silently when there is no Telegram user', async () => {
      const ctx = fakeCtx('') as any
      ctx.from = undefined
      await subscribeHandler(ctx)
      expect(ctx.reply.called).to.be.false
    })

    it('falls back to userId as chatId when ctx.chat is missing', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)

      const addStub = sandbox.stub().resolves()
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create').resolves({
        addDaoSubscription: addStub,
        recordConsent: sandbox.stub().resolves(),
      } as any)

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`, 555) as any
      ctx.chat = undefined
      await subscribeHandler(ctx)
      // Without ctx.chat, we should fall back to telegramUserId for chatId.
      expect(createStub.firstCall.args[0]).to.deep.include({ telegramUserId: 555, chatId: 555 })
    })

    it('replies with usage when no argument is supplied', async () => {
      const ctx = fakeCtx('')
      await subscribeHandler(ctx)
      expect(ctx.reply.calledOnce).to.be.true
      expect(ctx.reply.firstCall.args[0]).to.include('Usage:')
    })

    it('rejects an unparseable DAO id with a friendly error', async () => {
      const ctx = fakeCtx('not-a-real-dao')
      await subscribeHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include("couldn't parse")
    })

    it('rejects when the DAO does not exist on the backend', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await subscribeHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include("doesn't exist")
    })

    it('creates the subscription end-to-end when the DAO exists', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      // Force "no existing subscription" so the command takes the create path.
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)

      const addStub = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'create').resolves({
        addDaoSubscription: addStub,
        recordConsent: sandbox.stub().resolves(),
      } as any)

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`, 200)
      await subscribeHandler(ctx)

      expect(addStub.calledOnce).to.be.true
      expect(addStub.firstCall.args[0]).to.deep.include({
        network: NetworksEnum.ethereumSepolia,
        daoAddress: DAO,
      })
      expect(ctx.reply.lastCall.args[0]).to.include('Subscribed to')
      expect(ctx.reply.lastCall.args[0]).to.include('Andr')
      // Subscription disclosure must accompany every successful subscribe.
      expect(ctx.reply.lastCall.args[0]).to.include('No marketing, no profiling')
      expect(ctx.reply.lastCall.args[0]).to.include('/forget')
    })

    it('records consent against the current disclosure version', async () => {
      const recordConsent = sandbox.stub().resolves()
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        addDaoSubscription: sandbox.stub().resolves(),
        recordConsent,
      } as any)

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await subscribeHandler(ctx)
      expect(recordConsent.calledOnceWith(TELEGRAM_CONSENT_VERSION)).to.be.true
    })

    it('names the DAO after its network when the DAO row has no name', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: '' } as any)
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      sandbox.stub(Models.TelegramSubscription, 'create').resolves({
        addDaoSubscription: sandbox.stub().resolves(),
        recordConsent: sandbox.stub().resolves(),
      } as any)

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await subscribeHandler(ctx)
      expect(ctx.reply.lastCall.args[0]).to.include(`${NetworksEnum.ethereumSepolia} DAO`)
    })

    it('replies with usage when the command carries no payload at all', async () => {
      const ctx = fakeCtx('') as any
      ctx.match = undefined
      await subscribeHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('/subscribe')
    })

    it('accepts the URL form too', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const addStub = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'create').resolves({
        addDaoSubscription: addStub,
        recordConsent: sandbox.stub().resolves(),
      } as any)

      const ctx = fakeCtx(`https://app.aragon.org/dao/ethereum-sepolia/${DAO}`)
      await subscribeHandler(ctx)

      expect(addStub.calledOnce).to.be.true
      expect(addStub.firstCall.args[0].network).to.eq(NetworksEnum.ethereumSepolia)
    })

    it('surfaces the addDaoSubscription error to the user when subscribe fails', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const addStub = sandbox.stub().rejects(new Error('Subscription limit reached (50)'))
      sandbox.stub(Models.TelegramSubscription, 'create').resolves({
        addDaoSubscription: addStub,
        recordConsent: sandbox.stub().resolves(),
      } as any)

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`, 200)
      await subscribeHandler(ctx)
      expect(ctx.reply.lastCall.args[0]).to.include("Couldn't subscribe")
      expect(ctx.reply.lastCall.args[0]).to.include('limit reached')
    })

    it('reuses an existing subscription record without calling create', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      const addStub = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        addDaoSubscription: addStub,
        recordConsent: sandbox.stub().resolves(),
      } as any)
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create')

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await subscribeHandler(ctx)
      expect(addStub.calledOnce).to.be.true
      expect(createStub.called).to.be.false
    })
  })

  describe('unsubscribeHandler', () => {
    it('returns silently when there is no Telegram user', async () => {
      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`) as any
      ctx.from = undefined
      await unsubscribeHandler(ctx)
      expect(ctx.reply.called).to.be.false
    })

    it('replies with usage when no argument is supplied', async () => {
      const ctx = fakeCtx('')
      await unsubscribeHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('Usage:')
    })

    it('rejects an unparseable DAO id with a friendly error', async () => {
      const ctx = fakeCtx('not-a-real-dao')
      await unsubscribeHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include("couldn't parse")
    })

    it('replies with usage when the command carries no payload at all', async () => {
      const ctx = fakeCtx('') as any
      ctx.match = undefined
      await unsubscribeHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('Usage:')
    })

    it('responds when the user is not subscribed to the DAO', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await unsubscribeHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('not subscribed')
    })

    it('removes a matching subscription', async () => {
      const removeStub = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        hasDaoSubscription: () => true,
        removeDaoSubscription: removeStub,
      } as any)

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await unsubscribeHandler(ctx)
      expect(removeStub.calledOnce).to.be.true
      expect(ctx.reply.lastCall.args[0]).to.include('Unsubscribed')
    })
  })

  describe('registerSubscription', () => {
    it('wires both /subscribe and /unsubscribe onto the bot', () => {
      const wired: string[] = []
      registerSubscription({
        command: (name: string) => {
          wired.push(name)
        },
      } as any)
      expect(wired).to.deep.eq(['subscribe', 'unsubscribe'])
    })
  })
})
