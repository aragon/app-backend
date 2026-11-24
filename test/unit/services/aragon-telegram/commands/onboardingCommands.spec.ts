import config from '@config'
import { Models } from '@dbModels'
import logger from '@logger'
import {
  helpHandler,
  menuCallback,
  registerOnboarding,
  startHandler,
  subscriptionConfirmationCallback,
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
  subscriptions: [],
  hasDaoSubscription: () => false,
  setStatus: sinon.stub().resolves(),
  addDaoSubscription: sinon.stub().resolves(),
  setAppCode: sinon.stub().resolves(),
  recordConsent: sinon.stub().resolves(),
  ...overrides,
})

const DEFAULT_APP = 'https://app.aragon.org'
const OCC_APP = 'https://new.app.aragon.org'

const urlsOf = (replyOptions: any): string[] =>
  replyOptions.reply_markup.inline_keyboard.flat().flatMap((button: any) => (button.url ? [button.url] : []))

const confirmationData = (ctx: any): string =>
  ctx.reply.firstCall.args[1].reply_markup.inline_keyboard.flat().find((b: any) => b.text === 'Agree and subscribe')
    .callback_data

describe('AragonTelegram: onboardingCommands', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    sandbox.stub(config.SERVICES.ARAGON_TELEGRAM, 'APP_BASE_URL').value(DEFAULT_APP)
    sandbox.stub(config.SERVICES.ARAGON_TELEGRAM, 'APP_URLS').value([`o=${OCC_APP}`])
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

    it('shows a brand-new user the welcome menu and writes nothing', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create')

      const ctx = fakeCtx({ match: '' })
      await startHandler(ctx)

      expect(createStub.called).to.be.false
      expect(ctx.reply.firstCall.args[0]).to.include("Don't miss proposal activity")
      const flat = JSON.stringify(ctx.reply.firstCall.args[1].reply_markup.inline_keyboard)
      expect(flat).to.include('Subscribe to an organization')
      expect(flat).to.include('menu:subscribe')
      expect(flat).to.not.include('c:')
    })

    it('greets a consented user with the cold-start menu', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(consentedSub() as any)

      const ctx = fakeCtx({ match: '' })
      await startHandler(ctx)
      expect(ctx.reply.calledOnce).to.be.true
      expect(ctx.reply.firstCall.args[0]).to.include("Don't miss proposal activity")
    })

    it('shows the welcome menu to a legacy user without a current acknowledgement', async () => {
      sandbox
        .stub(Models.TelegramSubscription, 'findByTelegramUserId')
        .resolves(consentedSub({ consent: { version: '2020-01-01' } }) as any)

      const ctx = fakeCtx({ match: '' })
      await startHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include("Don't miss proposal activity")
      expect(ctx.reply.firstCall.args[0]).to.not.include('Agree')
    })

    it('reactivates a Blocked consented user when they /start again', async () => {
      const sub = consentedSub({ status: ITelegramSubscriptionStatus.Blocked })
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)

      const ctx = fakeCtx({ match: '' })
      await startHandler(ctx)
      expect(sub.setStatus.calledWith(ITelegramSubscriptionStatus.Active)).to.be.true
    })

    it('shows the disclosure and confirmation before subscribing from a deep link', async () => {
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create')
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)

      expect(createStub.called).to.be.false
      expect(ctx.reply.firstCall.args[0]).to.include('Andr')
      expect(ctx.reply.firstCall.args[0]).to.include('Select Agree to accept and subscribe')
      expect(ctx.reply.firstCall.args[0]).to.include('Telegram recipient ID')
      const flat = JSON.stringify(ctx.reply.firstCall.args[1].reply_markup.inline_keyboard)
      expect(flat).to.include('Agree and subscribe')
      expect(flat).to.include('Privacy policy')
      expect(flat).to.include(`c:s:${NetworksEnum.ethereumSepolia}-${DAO}`)
      // Declining is leaving the prompt alone, so there is no Cancel button to store a refusal.
      expect(flat).to.not.include('Cancel')
    })

    describe('app code', () => {
      const SEPOLIA_ID = `ethereum-sepolia-${DAO}`

      it('carries the OCC app in the confirmation button without touching the default data', async () => {
        sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

        const withCode = fakeCtx({ match: `${SEPOLIA_ID}_o` })
        await startHandler(withCode)
        expect(confirmationData(withCode)).to.eq(`c:o:${SEPOLIA_ID}`)

        const withoutCode = fakeCtx({ match: SEPOLIA_ID })
        await startHandler(withoutCode)
        expect(confirmationData(withoutCode)).to.eq(`c:s:${SEPOLIA_ID}`)
      })

      it('keeps the confirmation data within 64 bytes for every network, default app and OCC', async () => {
        sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
        let longest = 0

        for (const network of Object.values(NetworksEnum)) {
          for (const suffix of ['', '_o']) {
            const ctx = fakeCtx({ match: `${network}-${DAO}${suffix}` })
            await startHandler(ctx)
            const data = confirmationData(ctx)
            expect(Buffer.byteLength(data), data).to.be.at.most(64)
            expect(`${network}-${DAO}${suffix}`.length).to.be.at.most(64)
            longest = Math.max(longest, Buffer.byteLength(data))
          }
        }
        expect(longest).to.eq(64)
      })

      it('treats an unknown code or a garbage suffix as the default app', async () => {
        sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

        for (const suffix of ['_z', '_oo', '_O', '_1']) {
          const ctx = fakeCtx({ match: `${SEPOLIA_ID}${suffix}` })
          await startHandler(ctx)
          expect(confirmationData(ctx), suffix).to.eq(`c:s:${SEPOLIA_ID}`)
        }
      })

      it('does not move an existing OCC subscription for a code the backend does not know', async () => {
        const sub = consentedSub({
          subscriptions: [{ daoId: SEPOLIA_ID, events: [], appCode: 'o' }],
        })
        sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
        sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

        const ctx = fakeCtx({ match: `${SEPOLIA_ID}_z` })
        await startHandler(ctx)

        expect(sub.setAppCode.called).to.be.false
        expect(urlsOf(ctx.reply.lastCall.args[1])).to.deep.eq([`${OCC_APP}/dao/ethereum-sepolia/${DAO}`])
      })

      it('subscribes a consented user from OCC and links the confirmation to OCC', async () => {
        const sub = consentedSub()
        sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
        sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

        const ctx = fakeCtx({ match: `${SEPOLIA_ID}_o` })
        await startHandler(ctx)

        expect(sub.addDaoSubscription.firstCall.args[0]).to.deep.include({ daoAddress: DAO, appCode: 'o' })
        expect(urlsOf(ctx.reply.lastCall.args[1])).to.deep.eq([`${OCC_APP}/dao/ethereum-sepolia/${DAO}`])
      })

      it('subscribes a consented user from the default app without a code', async () => {
        const sub = consentedSub()
        sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
        sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

        const ctx = fakeCtx({ match: SEPOLIA_ID })
        await startHandler(ctx)

        expect(sub.addDaoSubscription.firstCall.args[0].appCode).to.be.undefined
        expect(urlsOf(ctx.reply.lastCall.args[1])).to.deep.eq([`${DEFAULT_APP}/dao/ethereum-sepolia/${DAO}`])
      })

      it('moves an existing subscription to the app of the deep link, leaving events untouched', async () => {
        const sub = consentedSub({
          subscriptions: [{ daoId: SEPOLIA_ID, events: [], appCode: undefined }],
        })
        sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
        sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

        const ctx = fakeCtx({ match: `${SEPOLIA_ID}_o` })
        await startHandler(ctx)

        expect(sub.addDaoSubscription.called).to.be.false
        expect(
          sub.setAppCode.calledOnceWith({ network: NetworksEnum.ethereumSepolia, daoAddress: DAO, appCode: 'o' }, 'o'),
        ).to.be.true
        expect(urlsOf(ctx.reply.lastCall.args[1])).to.deep.eq([`${OCC_APP}/dao/ethereum-sepolia/${DAO}`])
      })

      it('moves an OCC subscription back when the default-app deep link is used', async () => {
        const sub = consentedSub({
          subscriptions: [{ daoId: SEPOLIA_ID, events: [], appCode: 'o' }],
        })
        sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
        sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

        const ctx = fakeCtx({ match: SEPOLIA_ID })
        await startHandler(ctx)

        expect(sub.setAppCode.firstCall.args[1]).to.be.undefined
        expect(urlsOf(ctx.reply.lastCall.args[1])).to.deep.eq([`${DEFAULT_APP}/dao/ethereum-sepolia/${DAO}`])
      })

      it('does not rewrite an unchanged app', async () => {
        const sub = consentedSub({
          subscriptions: [{ daoId: SEPOLIA_ID, events: [], appCode: 'o' }],
        })
        sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
        sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

        await startHandler(fakeCtx({ match: `${SEPOLIA_ID}_o` }))
        expect(sub.setAppCode.called).to.be.false
      })

      it('points the welcome button at the app of a bare code, and at the default app otherwise', async () => {
        sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)

        const occ = fakeCtx({ match: '_o' })
        await startHandler(occ)
        expect(urlsOf(occ.reply.firstCall.args[1])).to.deep.eq([OCC_APP])

        for (const match of ['', '_z', '_oo']) {
          const ctx = fakeCtx({ match })
          await startHandler(ctx)
          expect(urlsOf(ctx.reply.firstCall.args[1]), match).to.deep.eq([DEFAULT_APP])
        }
      })

      it('does not store anything before consent when the deep link carries a code', async () => {
        sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
        const createStub = sandbox.stub(Models.TelegramSubscription, 'create')
        sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

        await startHandler(fakeCtx({ match: `${SEPOLIA_ID}_o` }))
        expect(createStub.called).to.be.false
      })
    })

    it('subscribes a consented user directly from a deep link, without asking again', async () => {
      const sub = consentedSub()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)

      // Consent was already collected under the current notice, so there is nothing to agree to again.
      expect(sub.addDaoSubscription.calledOnce).to.be.true
      expect(ctx.reply.lastCall.args[0]).to.include('Notifications are on for')
      expect(ctx.reply.lastCall.args[0]).to.include('Andr')
      expect(ctx.reply.lastCall.args[0]).to.not.include('Agree')
      const flat = JSON.stringify(ctx.reply.lastCall.args[1].reply_markup.inline_keyboard)
      expect(flat).to.include('Manage notifications')
      expect(flat).to.include('Open in Aragon')
    })

    it('opens the detail view for a deep link to an already-subscribed organization', async () => {
      const sub = consentedSub({
        hasDaoSubscription: () => true,
        subscriptions: [{ daoId: `${NetworksEnum.ethereumSepolia}-${DAO}`, events: [] }],
      })
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)

      expect(sub.addDaoSubscription.called).to.be.false
      expect(ctx.reply.lastCall.args[0]).to.not.include('Confirm subscription')
      // The paused state the user chose survives: the detail view offers to resume, not to pause.
      const flat = JSON.stringify(ctx.reply.lastCall.args[1].reply_markup.inline_keyboard)
      expect(flat).to.include('Resume notifications')
      expect(flat).to.include(`d:r:${NetworksEnum.ethereumSepolia}-${DAO}`)
    })

    it('reactivates a Blocked user who deep-links to an organization they already follow', async () => {
      const setStatus = sinon.stub().resolves()
      const sub = consentedSub({
        status: ITelegramSubscriptionStatus.Blocked,
        setStatus,
        hasDaoSubscription: () => true,
        subscriptions: [{ daoId: `${NetworksEnum.ethereumSepolia}-${DAO}`, events: [] }],
      })
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)

      // Without this, the detail view claims notifications work while dispatch skips
      // the Blocked record and its deletion TTL keeps counting down.
      expect(setStatus.calledWith(ITelegramSubscriptionStatus.Active)).to.be.true
      expect(ctx.reply.lastCall.args[0]).to.not.include('Confirm subscription')
    })

    it('re-prompts through the confirmation flow when consent is stale, even for a followed organization', async () => {
      const sub = consentedSub({
        consent: { version: '2020-01-01' },
        hasDaoSubscription: () => true,
        subscriptions: [{ daoId: `${NetworksEnum.ethereumSepolia}-${DAO}`, events: [] }],
      })
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)

      expect(sub.addDaoSubscription.called).to.be.false
      expect(ctx.reply.lastCall.args[0]).to.include('Agree to accept and subscribe')
      expect(ctx.reply.lastCall.args[0]).to.include('Telegram recipient ID')
    })

    it('reactivates a Blocked consented user and subscribes them from a deep link', async () => {
      const sub = consentedSub({ status: ITelegramSubscriptionStatus.Blocked })
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)
      expect(sub.setStatus.calledWith(ITelegramSubscriptionStatus.Active)).to.be.true
      expect(sub.addDaoSubscription.calledOnce).to.be.true
      expect(ctx.reply.lastCall.args[0]).to.include('Notifications are on for')
    })

    it('does not reactivate or subscribe a Blocked user whose consent is stale', async () => {
      const sub = consentedSub({ status: ITelegramSubscriptionStatus.Blocked, consent: { version: '2020-01-01' } })
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)
      expect(sub.setStatus.called).to.be.false
      expect(sub.addDaoSubscription.called).to.be.false
      expect(ctx.reply.lastCall.args[0]).to.include('Agree to accept and subscribe')
    })

    it('greets a consented user when the command carries no payload at all', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(consentedSub() as any)

      const ctx = fakeCtx({ match: undefined })
      await startHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include("Don't miss proposal activity")
    })

    it("tells the user when the deep-linked DAO doesn't exist", async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include('Organization not found')
    })

    it('surfaces the subscription limit when a consented user hits the cap from a deep link', async () => {
      const sub = consentedSub({
        addDaoSubscription: sinon.stub().rejects(new Error('Subscription limit reached (200)')),
      })
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      sandbox.stub(logger, 'warn')

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)
      expect(ctx.reply.lastCall.args[0]).to.eq(
        "Couldn't subscribe to this organization: Subscription limit reached (200)",
      )
    })

    it('still asks a brand-new user to agree before writing anything', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create')
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ match: `ethereum-sepolia-${DAO}` })
      await startHandler(ctx)
      expect(createStub.called).to.be.false
      expect(ctx.reply.lastCall.args[0]).to.include('Agree to accept and subscribe')
    })
  })

  describe('subscriptionConfirmationCallback', () => {
    it('keeps the search-pick reply (id echo, app link only) when consent was collected first', async () => {
      const addDaoSubscription = sandbox.stub().resolves()
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      sandbox.stub(Models.TelegramSubscription, 'create').resolves({
        recordConsent: sandbox.stub().resolves(),
        addDaoSubscription,
        hasDaoSubscription: () => false,
        status: ITelegramSubscriptionStatus.Active,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Citrea' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `c:q:ethereum-sepolia-${DAO}` } })
      await subscriptionConfirmationCallback(ctx)

      expect(addDaoSubscription.calledOnce).to.be.true
      const text = ctx.reply.lastCall.args[0]
      expect(text).to.include('Notifications are on for')
      expect(text).to.include(`${NetworksEnum.ethereumSepolia}-${DAO}`)
      const flat = JSON.stringify(ctx.reply.lastCall.args[1].reply_markup.inline_keyboard)
      expect(flat).to.include('Open in Aragon')
      expect(flat).to.not.include('Manage notifications')
    })

    it('ignores a legacy generic acknowledgement callback without creating a record', async () => {
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create')

      const ctx = fakeCtx({ callbackQuery: { data: 'c:a' } })
      await subscriptionConfirmationCallback(ctx)

      expect(createStub.called).to.be.false
      expect(ctx.answerCallbackQuery.calledOnce).to.be.true
      expect(ctx.reply.called).to.be.false
    })

    it('creates the record, records acknowledgement, and subscribes only on confirmation', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const recordConsent = sandbox.stub().resolves()
      const addStub = sandbox.stub().resolves()
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create').resolves({
        recordConsent,
        addDaoSubscription: addStub,
        hasDaoSubscription: () => false,
        status: ITelegramSubscriptionStatus.Active,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `c:s:ethereum-sepolia-${DAO}` }, chat: undefined })
      await subscriptionConfirmationCallback(ctx)

      expect(createStub.firstCall.args[0]).to.deep.include({ telegramUserId: 100, chatId: 100 })
      expect(recordConsent.calledOnceWith(TELEGRAM_CONSENT_VERSION)).to.be.true
      expect(addStub.firstCall.args[0]).to.deep.include({
        network: NetworksEnum.ethereumSepolia,
        daoAddress: DAO,
      })
      expect(ctx.reply.lastCall.args[0]).to.include('Notifications are on for')
    })

    describe('app code', () => {
      let addDaoSubscription: sinon.SinonStub

      beforeEach(() => {
        addDaoSubscription = sandbox.stub().resolves()
        sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
        sandbox.stub(Models.TelegramSubscription, 'create').resolves({
          recordConsent: sandbox.stub().resolves(),
          addDaoSubscription,
          hasDaoSubscription: () => false,
          status: ITelegramSubscriptionStatus.Active,
        } as any)
        sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      })

      const confirm = async (data: string) => {
        addDaoSubscription.resetHistory()
        const ctx = fakeCtx({ callbackQuery: { data } })
        await subscriptionConfirmationCallback(ctx)
        return { ctx, added: addDaoSubscription.firstCall?.args[0] }
      }

      it('subscribes to the default app from callback data sent before this change', async () => {
        const { ctx, added } = await confirm(`c:s:ethereum-sepolia-${DAO}`)
        expect(added.appCode).to.be.undefined
        expect(urlsOf(ctx.reply.lastCall.args[1])).to.deep.eq([`${DEFAULT_APP}/dao/ethereum-sepolia/${DAO}`])
      })

      it('keeps the search-pick reply of callback data sent before this change on the default app', async () => {
        const { ctx, added } = await confirm(`c:q:ethereum-sepolia-${DAO}`)
        expect(added.appCode).to.be.undefined
        expect(ctx.reply.lastCall.args[0]).to.include(`ethereum-sepolia-${DAO}`)
        expect(urlsOf(ctx.reply.lastCall.args[1])).to.deep.eq([`${DEFAULT_APP}/dao/ethereum-sepolia/${DAO}`])
      })

      it('round-trips OCC from the prompt keyboard into the stored subscription and the reply links', async () => {
        const prompt = fakeCtx({ match: `ethereum-sepolia-${DAO}_o` })
        await startHandler(prompt)

        const { ctx, added } = await confirm(confirmationData(prompt))
        expect(added).to.deep.include({ daoAddress: DAO, appCode: 'o' })
        expect(urlsOf(ctx.reply.lastCall.args[1])).to.include(`${OCC_APP}/dao/ethereum-sepolia/${DAO}`)
      })

      it('round-trips the longest DAO id for the default app and for OCC within 64 bytes', async () => {
        const id = `${NetworksEnum.robinhoodMainnet}-${DAO}`

        for (const [match, appCode] of [
          [id, undefined],
          [`${id}_o`, 'o'],
        ] as const) {
          const prompt = fakeCtx({ match })
          await startHandler(prompt)
          const data = confirmationData(prompt)
          expect(Buffer.byteLength(data)).to.be.at.most(64)

          const { ctx, added } = await confirm(data)
          expect(added.network).to.eq(NetworksEnum.robinhoodMainnet)
          expect(added.appCode).to.eq(appCode)
          expect(urlsOf(ctx.reply.lastCall.args[1])).to.include(
            `${appCode ? OCC_APP : DEFAULT_APP}/dao/${NetworksEnum.robinhoodMainnet}/${DAO}`,
          )
        }
      })

      it('does not treat an uppercase letter as a confirmation', async () => {
        const { ctx, added } = await confirm(`c:O:ethereum-sepolia-${DAO}`)
        expect(added).to.be.undefined
        expect(ctx.reply.called).to.be.false
      })

      const reConsent = async (data: string, appCode?: string) => {
        const sub = consentedSub({
          consent: { version: '2020-01-01' },
          hasDaoSubscription: () => true,
          subscriptions: [{ daoId: `ethereum-sepolia-${DAO}`, events: [], appCode }],
        })
        ;(Models.TelegramSubscription.findByTelegramUserId as sinon.SinonStub).resolves(sub)
        await subscriptionConfirmationCallback(fakeCtx({ callbackQuery: { data } }))
        return sub
      }

      it('leaves an existing OCC subscription alone for `c:s:` and `c:q:` after re-consent', async () => {
        for (const action of ['s', 'q']) {
          const sub = await reConsent(`c:${action}:ethereum-sepolia-${DAO}`, 'o')
          expect(sub.addDaoSubscription.called, action).to.be.false
          expect(sub.setAppCode.called, action).to.be.false
        }
      })

      it('moves an existing default subscription to the app named by `c:o:` after re-consent', async () => {
        const sub = await reConsent(`c:o:ethereum-sepolia-${DAO}`)
        expect(sub.addDaoSubscription.called).to.be.false
        expect(
          sub.setAppCode.calledOnceWith({ network: NetworksEnum.ethereumSepolia, daoAddress: DAO, appCode: 'o' }, 'o'),
        ).to.be.true
      })

      it('does not move a subscription for an app that is no longer configured', async () => {
        const sub = await reConsent(`c:k:ethereum-sepolia-${DAO}`, 'o')
        expect(sub.setAppCode.called).to.be.false
      })

      it('subscribes to the default app when the prompt names an app that is no longer configured', async () => {
        const { ctx, added } = await confirm(`c:k:ethereum-sepolia-${DAO}`)
        expect(added.appCode).to.be.undefined
        expect(urlsOf(ctx.reply.lastCall.args[1])).to.deep.eq([`${DEFAULT_APP}/dao/ethereum-sepolia/${DAO}`])
      })

      it('never reads an app code out of the DAO id part of the callback data', async () => {
        const { added } = await confirm(`c:s:ethereum-sepolia-${DAO}_o`)
        expect(added.appCode).to.be.undefined
      })
    })

    it('uses the existing recipient when concurrent confirmation delivery hits the unique index', async () => {
      const recordConsent = sandbox.stub().resolves()
      const addDaoSubscription = sandbox.stub().resolves()
      const sub = consentedSub({ recordConsent, addDaoSubscription })
      const findStub = sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId')
      findStub.onFirstCall().resolves(null)
      findStub.onSecondCall().resolves(sub as any)
      sandbox.stub(Models.TelegramSubscription, 'create').rejects({ code: 11000 })
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `c:s:ethereum-sepolia-${DAO}` } })
      await subscriptionConfirmationCallback(ctx)

      expect(addDaoSubscription.calledOnce).to.be.true
      expect(recordConsent.calledOnceWith(TELEGRAM_CONSENT_VERSION)).to.be.true
    })

    it('still cancels from a keyboard sent before the Cancel button was retired, writing nothing', async () => {
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create')

      const ctx = fakeCtx({ callbackQuery: { data: 'c:x' } })
      await subscriptionConfirmationCallback(ctx)

      expect(createStub.called).to.be.false
      expect(ctx.editMessageText.firstCall.args[0]).to.include('Subscription cancelled')
    })

    it('reactivates a Blocked recipient when they confirm a subscription', async () => {
      const setStatus = sandbox.stub().resolves()
      const sub = consentedSub({ status: ITelegramSubscriptionStatus.Blocked, setStatus })
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `c:s:ethereum-sepolia-${DAO}` } })
      await subscriptionConfirmationCallback(ctx)

      expect(setStatus.calledOnceWith(ITelegramSubscriptionStatus.Active)).to.be.true
      expect(sub.addDaoSubscription.calledOnce).to.be.true
    })

    it('rejects an invalid DAO id without creating a record', async () => {
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create')

      const ctx = fakeCtx({ callbackQuery: { data: 'c:s:not-a-dao' } })
      await subscriptionConfirmationCallback(ctx)

      expect(createStub.called).to.be.false
      expect(ctx.answerCallbackQuery.firstCall.args[0]).to.include('Invalid organization ID')
    })

    it('rejects a missing DAO without creating a record', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      const createStub = sandbox.stub(Models.TelegramSubscription, 'create')

      const ctx = fakeCtx({ callbackQuery: { data: `c:s:ethereum-sepolia-${DAO}` } })
      await subscriptionConfirmationCallback(ctx)

      expect(createStub.called).to.be.false
      expect(ctx.reply.firstCall.args[0]).to.include('Organization not found')
    })

    it('surfaces the addDaoSubscription error after confirmation', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      sandbox.stub(Models.TelegramSubscription, 'create').resolves({
        recordConsent: sandbox.stub().resolves(),
        addDaoSubscription: sandbox.stub().rejects(new Error('Subscription limit reached (200)')),
        hasDaoSubscription: () => false,
        status: ITelegramSubscriptionStatus.Active,
      } as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)
      sandbox.stub(logger, 'warn')

      const ctx = fakeCtx({ callbackQuery: { data: `c:s:ethereum-sepolia-${DAO}` } })
      await subscriptionConfirmationCallback(ctx)
      expect(ctx.reply.lastCall.args[0]).to.include("Couldn't subscribe")
    })

    it('answers a callback that carries no data without replying', async () => {
      const ctx = fakeCtx({ callbackQuery: { data: undefined } })
      await subscriptionConfirmationCallback(ctx)
      expect(ctx.answerCallbackQuery.calledOnce).to.be.true
      expect(ctx.reply.called).to.be.false
    })

    it('answers an unknown confirmation action without replying', async () => {
      const ctx = fakeCtx({ callbackQuery: { data: 'c:z' } })
      await subscriptionConfirmationCallback(ctx)
      expect(ctx.answerCallbackQuery.calledOnce).to.be.true
      expect(ctx.reply.called).to.be.false
    })

    it('is safe when Telegram delivers the same confirmation again', async () => {
      const addDaoSubscription = sandbox.stub().resolves()
      const recordConsent = sandbox.stub().resolves()
      const sub = consentedSub({ hasDaoSubscription: () => true, addDaoSubscription, recordConsent })
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(sub as any)
      sandbox.stub(Models.Dao, 'findByAddress').resolves({ name: 'Andr' } as any)

      const ctx = fakeCtx({ callbackQuery: { data: `c:s:ethereum-sepolia-${DAO}` } })
      await subscriptionConfirmationCallback(ctx)
      await subscriptionConfirmationCallback(ctx)

      expect(addDaoSubscription.called).to.be.false
      expect(recordConsent.callCount).to.eq(2)
      expect(ctx.reply.lastCall.args[0]).to.include('already on')
    })

    it('swallows Telegram API failures while answering, editing and replying', async () => {
      const failingCtx = (data: string) =>
        fakeCtx({
          callbackQuery: { data },
          answerCallbackQuery: sinon.stub().rejects(new Error('tg down')),
          editMessageText: sinon.stub().rejects(new Error('tg down')),
          reply: sinon.stub().rejects(new Error('tg down')),
        })

      await subscriptionConfirmationCallback(failingCtx('c:x'))

      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      sandbox.stub(Models.TelegramSubscription, 'create').resolves({
        recordConsent: sinon.stub().resolves(),
        status: ITelegramSubscriptionStatus.Active,
      } as any)
      await subscriptionConfirmationCallback(failingCtx('c:a'))

      await subscriptionConfirmationCallback(failingCtx('c:s:not-a-dao'))
      await subscriptionConfirmationCallback(failingCtx('c:z'))
      await subscriptionConfirmationCallback(
        fakeCtx({ callbackQuery: { data: undefined }, answerCallbackQuery: sinon.stub().rejects() }),
      )

      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)
      await subscriptionConfirmationCallback(failingCtx(`c:s:ethereum-sepolia-${DAO}`))
    })
  })

  describe('helpHandler', () => {
    it('replies with the help text', async () => {
      const ctx = fakeCtx()
      await helpHandler(ctx)
      expect(ctx.reply.calledOnce).to.be.true
      expect(ctx.reply.firstCall.args[0]).to.include("Don't miss proposal activity")
    })
  })

  describe('menuCallback', () => {
    it('replies with subscribe help when menu:subscribe is tapped', async () => {
      const ctx = fakeCtx({ callbackQuery: { data: 'menu:subscribe' } })
      await menuCallback(ctx)
      expect(ctx.answerCallbackQuery.calledOnce).to.be.true
      expect(ctx.reply.firstCall.args[0]).to.include('Subscribe to an organization')
    })

    it('forwards menu:list to the dao list handler', async () => {
      sandbox.stub(Models.TelegramSubscription, 'findByTelegramUserId').resolves(null)
      const ctx = fakeCtx({ callbackQuery: { data: 'menu:list' } })
      await menuCallback(ctx)
      expect(ctx.answerCallbackQuery.calledOnce).to.be.true
      // listHandler replies with the empty state when the user has none.
      expect(ctx.reply.firstCall.args[0]).to.include("aren't subscribed to any organizations")
    })

    it('forwards menu:help to the help handler', async () => {
      const ctx = fakeCtx({ callbackQuery: { data: 'menu:help' } })
      await menuCallback(ctx)
      expect(ctx.reply.firstCall.args[0]).to.include("Don't miss proposal activity")
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
    it('wires /start, /help, and the menu + confirmation callbacks onto the bot', () => {
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
