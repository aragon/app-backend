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

/** Stub the name-search query chain `Dao.find(...).sort(...).limit(...)`. */
const stubDaoSearch = (sandbox: SinonSandbox, results: any[]) =>
  sandbox.stub(Models.Dao, 'find').returns({
    sort: () => ({ limit: async () => results }),
  } as any)

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

    it('replies with the subscribe instructions when no argument is supplied', async () => {
      const ctx = fakeCtx('')
      await subscribeHandler(ctx)
      expect(ctx.reply.calledOnce).to.be.true
      expect(ctx.reply.firstCall.args[0]).to.include('Subscribe to an organization')
      expect(ctx.reply.firstCall.args[0]).to.include('.dao.eth')
    })

    it('rejects when the organization does not exist on the backend', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await subscribeHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('Organization not found')
    })

    it('shows the disclosure and confirmation instead of writing when the user has no record yet', async () => {
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

    it('shows the disclosure and confirmation for a legacy record without the current acknowledgement', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      const addStub = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves({
        consent: { version: '2020-01-01' },
        subscriptions: [],
        addDaoSubscription: addStub,
      } as any)

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await subscribeHandler(ctx)

      expect(addStub.called).to.be.false
      expect(ctx.reply.firstCall.args[0]).to.include('Agree to accept and subscribe')
    })

    it('does not subscribe an acknowledged user until they confirm this request', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      const sub = { subscriptions: [], addDaoSubscription: sandbox.stub().resolves() }
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create')

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`, 200)
      await subscribeHandler(ctx)

      expect(createStub.called).to.be.false
      expect(sub.addDaoSubscription.called).to.be.false
      expect(ctx.reply.lastCall.args[0]).to.include('Agree to accept and subscribe')
      expect(ctx.reply.lastCall.args[0]).to.include('Andr')
    })

    it('subscribes a consented user directly and confirms without a prompt', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      const sub = {
        consent: { version: TELEGRAM_CONSENT_VERSION },
        status: 'active',
        subscriptions: [],
        hasDaoSubscription: () => false,
        addDaoSubscription: sandbox.stub().resolves(),
      }
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await subscribeHandler(ctx)

      expect(sub.addDaoSubscription.calledOnce).to.be.true
      expect(ctx.reply.lastCall.args[0]).to.include('Notifications are on for')
      expect(ctx.reply.lastCall.args[0]).to.include('Use /subscriptions to manage your notifications')
      expect(ctx.reply.lastCall.args[0]).to.not.include('Agree')
    })

    it('opens the detail view instead of asking again for an already-subscribed organization', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      const sub = {
        consent: { version: TELEGRAM_CONSENT_VERSION },
        subscriptions: [{ daoId: `${NetworksEnum.ethereumSepolia}-${DAO}`, events: [] }],
        addDaoSubscription: sandbox.stub().resolves(),
      }
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await subscribeHandler(ctx)

      expect(sub.addDaoSubscription.called).to.be.false
      expect(ctx.reply.lastCall.args[0]).to.not.include('Confirm subscription')
      // Paused stays paused: the detail view offers Resume, it does not silently turn events back on.
      expect(JSON.stringify(ctx.reply.lastCall.args[1].reply_markup.inline_keyboard)).to.include('Resume notifications')
    })

    it('does not alter an existing subscription before confirmation', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      const sub = { subscriptions: [], addDaoSubscription: sandbox.stub().resolves() }
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await subscribeHandler(ctx)

      expect(sub.addDaoSubscription.called).to.be.false
      expect(ctx.reply.lastCall.args[0]).to.include('Agree to accept and subscribe')
    })

    it('does not reactivate a blocked user before confirmation', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      const setStatus = sandbox.stub().resolves()
      const sub = { setStatus, subscriptions: [], addDaoSubscription: sandbox.stub().resolves() }
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)

      await subscribeHandler(fakeCtx(`ethereum-sepolia-${DAO}`))

      expect(setStatus.called).to.be.false
      expect(sub.addDaoSubscription.called).to.be.false
    })

    it('names the DAO after its network when the DAO row has no name', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: '' } as any)

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await subscribeHandler(ctx)
      expect(ctx.reply.lastCall.args[0]).to.include(`${NetworksEnum.ethereumSepolia} DAO`)
    })

    it('replies with the instructions when the command carries no payload at all', async () => {
      const ctx = fakeCtx('') as any
      ctx.match = undefined
      await subscribeHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('/subscribe')
    })

    it('accepts the URL form too', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx(`https://app.aragon.org/dao/ethereum-sepolia/${DAO}`)
      await subscribeHandler(ctx)

      expect(ctx.reply.lastCall.args[0]).to.include('Agree to accept and subscribe')
    })

    it('resolves a bare ENS name on ethereum mainnet', async () => {
      sandbox
        .stub(Models.Dao, 'findOne')
        .resolves({ name: 'Polygon Treasury', network: NetworksEnum.ethereumMainnet, address: DAO } as any)

      const ctx = fakeCtx('polygoncommunitytreasury.dao.eth')
      await subscribeHandler(ctx)

      expect((Models.Dao.findOne as any).firstCall.args[0]).to.deep.eq({
        ens: 'polygoncommunitytreasury.dao.eth',
        network: NetworksEnum.ethereumMainnet,
      })
      expect(ctx.reply.lastCall.args[0]).to.include('Polygon Treasury')
    })

    it("resolves the app's default URL that carries the ENS name instead of the address", async () => {
      sandbox
        .stub(Models.Dao, 'findOne')
        .resolves({ name: 'Polygon Treasury', network: NetworksEnum.ethereumMainnet, address: DAO } as any)

      const ctx = fakeCtx('https://app.aragon.org/dao/ethereum-mainnet/polygoncommunitytreasury.dao.eth/dashboard')
      await subscribeHandler(ctx)

      expect(ctx.reply.lastCall.args[0]).to.include('Agree to accept and subscribe')
    })

    it('reports when an ENS name resolves to no known organization', async () => {
      sandbox.stub(Models.Dao, 'findOne').resolves(null)
      const ctx = fakeCtx('unknown.dao.eth')
      await subscribeHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('Organization not found')
    })

    it('runs a name search for a plain-text argument and offers the matches as buttons', async () => {
      stubDaoSearch(sandbox, [
        { name: 'Citrea', network: NetworksEnum.ethereumMainnet, address: DAO },
        { name: 'Citrea Grants', network: NetworksEnum.polygonMainnet, address: DAO },
      ])

      const ctx = fakeCtx('citrea')
      await subscribeHandler(ctx)

      expect(ctx.reply.firstCall.args[0]).to.include('Organizations matching')
      const flat = JSON.stringify(ctx.reply.firstCall.args[1].reply_markup.inline_keyboard)
      expect(flat).to.include('Citrea · ethereum-mainnet')
      expect(flat).to.include(`s:p:${NetworksEnum.ethereumMainnet}-${DAO}`)
    })

    it('caps search results at five and says when the list was cut off', async () => {
      const many = Array.from({ length: 6 }, (_, i) => ({
        name: `Dao ${i}`,
        network: NetworksEnum.ethereumMainnet,
        address: DAO,
      }))
      stubDaoSearch(sandbox, many)

      const ctx = fakeCtx('dao')
      await subscribeHandler(ctx)

      expect(ctx.reply.firstCall.args[0]).to.include('Showing the first 5')
      expect(ctx.reply.firstCall.args[1].reply_markup.inline_keyboard.length).to.eq(5)
    })

    it('replies with the empty-search message when nothing matches', async () => {
      stubDaoSearch(sandbox, [])
      const ctx = fakeCtx('zzzz')
      await subscribeHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('No organizations found for')
    })

    it('does not attempt addDaoSubscription before confirmation', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      const sub = {
        subscriptions: [],
        addDaoSubscription: sandbox.stub().rejects(new Error('Subscription limit reached (200)')),
      }
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)

      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`, 200)
      await subscribeHandler(ctx)
      expect(sub.addDaoSubscription.called).to.be.false
      expect(ctx.reply.lastCall.args[0]).to.include('Agree to accept and subscribe')
    })
  })

  describe('unsubscribeHandler', () => {
    it('returns silently when there is no Telegram user', async () => {
      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`) as any
      ctx.from = undefined
      await unsubscribeHandler(ctx)
      expect(ctx.reply.called).to.be.false
    })

    it('replies with the unsubscribe instructions when no argument is supplied', async () => {
      const ctx = fakeCtx('')
      await unsubscribeHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('Unsubscribe from an organization')
    })

    it('rejects an unrecognized argument shape', async () => {
      const ctx = fakeCtx('not a real reference')
      await unsubscribeHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include("isn't recognized")
    })

    it("treats an ENS name that resolves to nothing as 'not subscribed'", async () => {
      sandbox.stub(Models.Dao, 'findOne').resolves(null)
      const ctx = fakeCtx('unknown.dao.eth')
      await unsubscribeHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include("aren't subscribed")
    })

    it('unsubscribes by ENS name', async () => {
      sandbox
        .stub(Models.Dao, 'findOne')
        .resolves({ name: 'Polygon Treasury', network: NetworksEnum.ethereumMainnet, address: DAO } as any)
      const sub = {
        subscriptions: [{ daoId: 'first' }, { daoId: 'remaining' }],
        hasDaoSubscription: () => true,
        removeDaoSubscription: sandbox.stub().resolves(),
      }
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
      const deleteMarkersStub = sandbox.stub(Models.TelegramNotifiedEvent, 'deleteMany')

      const ctx = fakeCtx('polygoncommunitytreasury.dao.eth')
      await unsubscribeHandler(ctx)
      expect(sub.removeDaoSubscription.calledOnce).to.be.true
      expect(deleteMarkersStub.notCalled).to.be.true
    })

    it('responds when the user is not subscribed to the DAO', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const ctx = fakeCtx(`ethereum-sepolia-${DAO}`)
      await unsubscribeHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include("aren't subscribed")
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
      expect(ctx.reply.lastCall.args[0]).to.include('no longer subscribed')
      expect(ctx.reply.lastCall.args[0]).to.not.include('deleted')
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
      expect(ctx.reply.lastCall.args[0]).to.include("You're no longer subscribed to")
      expect(ctx.reply.lastCall.args[0]).to.include('data stored by this bot has been deleted')
      expect(ctx.reply.lastCall.args[0]).to.include('Subscribing again will show the privacy notice first')
    })
  })

  describe('search-pick callback (s:p:)', () => {
    const buildPickHandler = () => {
      let handler: any
      registerSubscription({
        command: () => undefined,
        callbackQuery: (_re: RegExp, h: any) => {
          handler = h
        },
      } as any)
      return handler
    }

    const pickCtx = (data: string | undefined, overrides: Record<string, any> = {}) =>
      ({
        from: { id: 100 },
        chat: { id: 100 },
        callbackQuery: { data },
        reply: sinon.stub().resolves(),
        answerCallbackQuery: sinon.stub().resolves(),
        ...overrides,
      }) as any

    it('answers without acting when the callback has no data or user', async () => {
      const handler = buildPickHandler()
      const noData = pickCtx(undefined)
      await handler(noData)
      expect(noData.answerCallbackQuery.calledOnce).to.be.true
      expect(noData.reply.called).to.be.false

      const noUser = pickCtx(`s:p:ethereum-mainnet-${DAO}`, { from: undefined })
      await handler(noUser)
      expect(noUser.answerCallbackQuery.calledOnce).to.be.true
      expect(noUser.reply.called).to.be.false
    })

    it('rejects an unparseable organization id from a stale button', async () => {
      const handler = buildPickHandler()
      const ctx = pickCtx('s:p:bogus')
      await handler(ctx)
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('Invalid organization ID')
    })

    it('reports when the picked organization no longer exists', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const handler = buildPickHandler()
      const ctx = pickCtx(`s:p:ethereum-mainnet-${DAO}`)
      await handler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('Organization not found')
    })

    it('asks for confirmation before subscribing to the picked organization', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Citrea' } as any)

      const handler = buildPickHandler()
      const ctx = pickCtx(`s:p:ethereum-mainnet-${DAO}`)
      await handler(ctx)

      expect(ctx.reply.lastCall.args[0]).to.include('Subscribe to Citrea?')
      expect(ctx.reply.lastCall.args[0]).to.include('Agree to accept and subscribe')
      // The Agree button remembers the search origin so the post-consent reply still echoes the id.
      const flat = JSON.stringify(ctx.reply.lastCall.args[1].reply_markup.inline_keyboard)
      expect(flat).to.include(`c:q:${NetworksEnum.ethereumMainnet}-${DAO}`)
    })

    it('echoes the organization id and links to the app when a consented user picks a result', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Citrea' } as any)
      const sub = {
        consent: { version: TELEGRAM_CONSENT_VERSION },
        status: 'active',
        subscriptions: [],
        hasDaoSubscription: () => false,
        addDaoSubscription: sandbox.stub().resolves(),
      }
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)

      const handler = buildPickHandler()
      const ctx = pickCtx(`s:p:ethereum-mainnet-${DAO}`)
      await handler(ctx)

      expect(sub.addDaoSubscription.calledOnce).to.be.true
      const text = ctx.reply.lastCall.args[0]
      expect(text).to.include('Notifications are on for')
      // Same-named organizations exist across networks, so the id proves which one was picked.
      expect(text).to.include(`${NetworksEnum.ethereumMainnet}-${DAO}`)
      const flat = JSON.stringify(ctx.reply.lastCall.args[1].reply_markup.inline_keyboard)
      expect(flat).to.include('Open in Aragon')
      expect(flat).to.not.include('Manage notifications')
    })

    it('swallows Telegram API failures while answering and replying', async () => {
      const handler = buildPickHandler()
      const failing = (data: string | undefined, overrides: Record<string, any> = {}) =>
        pickCtx(data, {
          answerCallbackQuery: sinon.stub().rejects(new Error('tg down')),
          reply: sinon.stub().rejects(new Error('tg down')),
          ...overrides,
        })

      await handler(failing(undefined))
      await handler(failing(`s:p:ethereum-mainnet-${DAO}`, { from: undefined }))
      await handler(failing('s:p:bogus'))

      const findStub = sandbox.stub(Models.Dao, 'findByAddress')
      findStub.resolves(null)
      await handler(failing(`s:p:ethereum-mainnet-${DAO}`))

      // The confirmation prompt itself is not swallowed — its failure surfaces to bot.catch.
      findStub.resolves({ name: 'Citrea' } as any)
      const surfaced = await handler(failing(`s:p:ethereum-mainnet-${DAO}`)).then(
        () => false,
        () => true,
      )
      expect(surfaced).to.be.true
    })
  })

  describe('registerSubscription', () => {
    it('wires /subscribe, /unsubscribe and the search-pick callback onto the bot', () => {
      const wired: string[] = []
      const callbacks: string[] = []
      registerSubscription({
        command: (name: string) => {
          wired.push(name)
        },
        callbackQuery: (re: RegExp) => {
          callbacks.push(re.source)
        },
      } as any)
      expect(wired).to.deep.eq(['subscribe', 'unsubscribe'])
      expect(callbacks).to.deep.eq(['^s:p:'])
    })
  })
})
