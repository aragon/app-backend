import { Models } from '@dbModels'
import { subscribeHandler, unsubscribeHandler } from '@services/aragon-telegram/commands/subscriptionCommands'
import { type HexAddress, NetworksEnum } from '@types'
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
    })

    it('accepts the URL form too', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const addStub = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'create').resolves({
        addDaoSubscription: addStub,
      } as any)

      const ctx = fakeCtx(`https://app.aragon.org/dao/ethereum-sepolia/${DAO}`)
      await subscribeHandler(ctx)

      expect(addStub.calledOnce).to.be.true
      expect(addStub.firstCall.args[0].network).to.eq(NetworksEnum.ethereumSepolia)
    })
  })

  describe('unsubscribeHandler', () => {
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
})
