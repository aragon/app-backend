import { Models } from '@dbModels'
import { SubscriptionCommands } from '@services/aragon-telegram/commands/subscriptionCommands'
import { type HexAddress, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const DAO = '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress

interface IFakeCtx {
  from: { id: number; username?: string; language_code?: string } | undefined
  chat: { id: number } | undefined
  match: string
  reply: sinon.SinonStub
}

const fakeCtx = (match: string, fromId = 100): IFakeCtx => ({
  from: { id: fromId, username: 'sishir', language_code: 'en' },
  chat: { id: fromId },
  match,
  reply: sinon.stub().resolves(),
})

/** Resolves the private subscribe handler the bot.command(...) wires up. */
const buildCommands = () => {
  const cmd = new SubscriptionCommands()
  let subscribe!: (ctx: IFakeCtx) => Promise<void>
  let unsubscribe!: (ctx: IFakeCtx) => Promise<void>
  cmd.register({
    command: (name: string, handler: any) => {
      if (name === 'subscribe') subscribe = handler
      if (name === 'unsubscribe') unsubscribe = handler
    },
  } as any)
  return { subscribe, unsubscribe }
}

describe('AragonTelegram: SubscriptionCommands', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('subscribe', () => {
    it('replies with usage when no argument is supplied', async () => {
      const { subscribe } = buildCommands()
      const ctx = fakeCtx('')
      await subscribe(ctx)
      expect(ctx.reply.calledOnce).to.be.true
      expect(ctx.reply.firstCall.args[0]).to.include('Usage:')
    })

    it('rejects an unparseable DAO id with a friendly error', async () => {
      const { subscribe } = buildCommands()
      const ctx = fakeCtx('not-a-real-dao')
      await subscribe(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include("couldn't parse")
    })

    it('rejects when the DAO does not exist on the backend', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const { subscribe } = buildCommands()

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await subscribe(ctx)
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

      const { subscribe } = buildCommands()
      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`, 200)
      await subscribe(ctx)

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

      const { subscribe } = buildCommands()
      const ctx = fakeCtx(`https://app.aragon.org/dao/ethereum-sepolia/${DAO}`)
      await subscribe(ctx)

      expect(addStub.calledOnce).to.be.true
      expect(addStub.firstCall.args[0].network).to.eq(NetworksEnum.ethereumSepolia)
    })
  })

  describe('unsubscribe', () => {
    it('responds when the user is not subscribed to the DAO', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const { unsubscribe } = buildCommands()
      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await unsubscribe(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('not subscribed')
    })

    it('removes a matching subscription', async () => {
      const removeStub = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        hasDaoSubscription: () => true,
        removeDaoSubscription: removeStub,
      } as any)

      const { unsubscribe } = buildCommands()
      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await unsubscribe(ctx)
      expect(removeStub.calledOnce).to.be.true
      expect(ctx.reply.lastCall.args[0]).to.include('Unsubscribed')
    })
  })
})
