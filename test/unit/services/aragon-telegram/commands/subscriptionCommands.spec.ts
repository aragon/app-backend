import { Models } from '@dbModels'
import {
  registerSubscription,
  subscribeHandler,
  unsubscribeHandler,
} from '@services/aragon-telegram/commands/subscriptionCommands'
import { type HexAddress, ITelegramSubscriptionStatus, NetworksEnum, TELEGRAM_CONSENT_VERSION } from '@types'
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

    it('prompts for consent instead of writing when the user has no record yet', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create')

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await subscribeHandler(ctx)

      expect(createStub.called).to.be.false
      expect(ctx.reply.firstCall.args[0]).to.include('Agree to accept and subscribe')
      const flat = JSON.stringify(ctx.reply.firstCall.args[1].reply_markup.inline_keyboard)
      expect(flat).to.include(`c:s:${NetworksEnum.ethereumSepolia}-${DAO}`)
    })

    it('prompts for consent again when the stored consent is for an older disclosure version', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      const addStub = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        consent: { version: '2020-01-01' },
        addDaoSubscription: addStub,
      } as any)

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await subscribeHandler(ctx)

      expect(addStub.called).to.be.false
      expect(ctx.reply.firstCall.args[0]).to.include('Agree to accept and subscribe')
    })

    it('subscribes end-to-end for a consented user', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      const addStub = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        consent: { version: TELEGRAM_CONSENT_VERSION },
        addDaoSubscription: addStub,
      } as any)
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create')

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`, 200)
      await subscribeHandler(ctx)

      expect(createStub.called).to.be.false
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

    it('reactivates a blocked user before subscribing', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      const setStatus = sandbox.stub().resolves()
      const addDaoSubscription = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        status: ITelegramSubscriptionStatus.Blocked,
        consent: { version: TELEGRAM_CONSENT_VERSION },
        setStatus,
        addDaoSubscription,
      } as any)

      await subscribeHandler(fakeCtx(`ethereum-sepolia-${DAO}`))

      expect(setStatus.calledOnceWith(ITelegramSubscriptionStatus.Active)).to.be.true
      expect(addDaoSubscription.calledOnce).to.be.true
    })

    it('names the DAO after its network when the DAO row has no name', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: '' } as any)
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        consent: { version: TELEGRAM_CONSENT_VERSION },
        addDaoSubscription: sandbox.stub().resolves(),
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
      const addStub = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        consent: { version: TELEGRAM_CONSENT_VERSION },
        addDaoSubscription: addStub,
      } as any)

      const ctx = fakeCtx(`https://app.aragon.org/dao/ethereum-sepolia/${DAO}`)
      await subscribeHandler(ctx)

      expect(addStub.calledOnce).to.be.true
      expect(addStub.firstCall.args[0].network).to.eq(NetworksEnum.ethereumSepolia)
    })

    it('surfaces the addDaoSubscription error to the user when subscribe fails', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      const addStub = sandbox.stub().rejects(new Error('Subscription limit reached (50)'))
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        consent: { version: TELEGRAM_CONSENT_VERSION },
        addDaoSubscription: addStub,
      } as any)

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`, 200)
      await subscribeHandler(ctx)
      expect(ctx.reply.lastCall.args[0]).to.include("Couldn't subscribe")
      expect(ctx.reply.lastCall.args[0]).to.include('limit reached')
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

    it('removes one of multiple DAO subscriptions and keeps the bot record', async () => {
      const sub = {
        subscriptions: [{ daoId: 'first' }, { daoId: 'remaining' }],
        hasDaoSubscription: () => true,
        removeDaoSubscription: sandbox.stub().callsFake(async () => {
          sub.subscriptions = [{ daoId: 'remaining' }]
        }),
      }
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await unsubscribeHandler(ctx)
      expect(sub.removeDaoSubscription.calledOnce).to.be.true
      expect(ctx.reply.lastCall.args[0]).to.include('other DAO subscriptions are still active')
    })

    it('explains that the bot record was deleted after removing the final DAO', async () => {
      const sub = {
        subscriptions: [{ daoId: 'only' }],
        hasDaoSubscription: () => true,
        removeDaoSubscription: sandbox.stub().callsFake(async () => {
          sub.subscriptions = []
        }),
      }
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await unsubscribeHandler(ctx)
      expect(sub.removeDaoSubscription.calledOnce).to.be.true
      expect(ctx.reply.lastCall.args[0]).to.include('bot record was deleted')
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
