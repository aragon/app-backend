import { Models } from '@dbModels'
import {
  type HexAddress,
  ITelegramNotificationEvent,
  ITelegramSubscriptionStatus,
  NetworksEnum,
  TELEGRAM_CONSENT_VERSION,
  TELEGRAM_DEFAULT_EVENTS,
  TELEGRAM_MAX_DAO_SUBSCRIPTIONS,
} from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const TG_USER_ID = 755403189
const NETWORK_A = NetworksEnum.ethereumSepolia
const NETWORK_B = NetworksEnum.polygonMainnet
const DAO_A = '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress
const DAO_B = '0xAaaaBbbbCcccDdddEeeeFfff0011223344556677' as HexAddress

describe('Model: TelegramSubscription', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('Static helpers', () => {
    it('getEntityId derives a stable id from the Telegram user id', () => {
      expect(Models.TelegramSubscription.getEntityId({ telegramUserId: 1 })).to.eq('tg-1')
      expect(Models.TelegramSubscription.getEntityId({ telegramUserId: TG_USER_ID })).to.eq(`tg-${TG_USER_ID}`)
    })

    it('getDaoId joins network and address with a dash', () => {
      expect(Models.TelegramSubscription.getDaoId({ network: NETWORK_A, daoAddress: DAO_A })).to.eq(
        `${NETWORK_A}-${DAO_A}`,
      )
    })
  })

  describe('create', () => {
    it('creates a subscription with sensible defaults', async () => {
      const sub = await Models.TelegramSubscription.create({
        telegramUserId: TG_USER_ID,
        chatId: TG_USER_ID,
      })

      expect(sub.id).to.eq(`tg-${TG_USER_ID}`)
      expect(sub.telegramUserId).to.eq(TG_USER_ID)
      expect(sub.chatId).to.eq(TG_USER_ID)
      expect(sub.status).to.eq(ITelegramSubscriptionStatus.Active)
      expect(sub.subscriptions).to.be.an('array').with.lengthOf(0)
      expect(sub.consent.version).to.eq(TELEGRAM_CONSENT_VERSION)
      expect(sub.consent.acceptedAt).to.be.a('number').greaterThan(0)
    })

    it('rejects when telegramUserId is missing', async () => {
      await expect(Models.TelegramSubscription.create({} as any)).to.be.rejected
    })
  })

  describe('addDaoSubscription', () => {
    it('adds a new DAO with default events', async () => {
      const sub = await Models.TelegramSubscription.create({ telegramUserId: TG_USER_ID, chatId: TG_USER_ID })
      await sub.addDaoSubscription({ network: NETWORK_A, daoAddress: DAO_A })

      const reloaded = await Models.TelegramSubscription.findByTelegramUserId(TG_USER_ID)
      expect(reloaded?.subscriptions).to.have.lengthOf(1)
      expect(reloaded?.subscriptions[0].daoId).to.eq(`${NETWORK_A}-${DAO_A}`)
      expect(reloaded?.subscriptions[0].network).to.eq(NETWORK_A)
      expect(reloaded?.subscriptions[0].daoAddress).to.eq(DAO_A)
      expect(reloaded?.subscriptions[0].events).to.deep.eq(TELEGRAM_DEFAULT_EVENTS)
      expect(reloaded?.subscriptions[0].subscribedAt).to.be.a('number').and.gt(0)
    })

    it('is idempotent — re-adding the same DAO updates events instead of duplicating', async () => {
      const sub = await Models.TelegramSubscription.create({ telegramUserId: TG_USER_ID, chatId: TG_USER_ID })
      await sub.addDaoSubscription({ network: NETWORK_A, daoAddress: DAO_A })
      await sub.addDaoSubscription({
        network: NETWORK_A,
        daoAddress: DAO_A,
        events: [ITelegramNotificationEvent.ProposalCreated],
      })

      const reloaded = await Models.TelegramSubscription.findByTelegramUserId(TG_USER_ID)
      expect(reloaded?.subscriptions).to.have.lengthOf(1)
      expect(reloaded?.subscriptions[0].events).to.deep.eq([ITelegramNotificationEvent.ProposalCreated])
    })

    it('enforces the per-user DAO cap', async () => {
      const sub = await Models.TelegramSubscription.create({ telegramUserId: TG_USER_ID, chatId: TG_USER_ID })

      // Fill exactly to the cap with synthetic addresses
      for (let i = 0; i < TELEGRAM_MAX_DAO_SUBSCRIPTIONS; i++) {
        const synthetic = `0x${i.toString(16).padStart(40, '0')}` as HexAddress
        await sub.addDaoSubscription({ network: NETWORK_A, daoAddress: synthetic })
      }
      expect(sub.subscriptions).to.have.lengthOf(TELEGRAM_MAX_DAO_SUBSCRIPTIONS)

      await expect(sub.addDaoSubscription({ network: NETWORK_B, daoAddress: DAO_B })).to.be.rejected
    })
  })

  describe('removeDaoSubscription', () => {
    it('removes a matching subscription and is a no-op when missing', async () => {
      const sub = await Models.TelegramSubscription.create({ telegramUserId: TG_USER_ID, chatId: TG_USER_ID })
      await sub.addDaoSubscription({ network: NETWORK_A, daoAddress: DAO_A })
      await sub.addDaoSubscription({ network: NETWORK_B, daoAddress: DAO_B })

      await sub.removeDaoSubscription({ network: NETWORK_A, daoAddress: DAO_A })
      expect(sub.subscriptions.map((s: any) => s.daoId)).to.deep.eq([`${NETWORK_B}-${DAO_B}`])

      // No-op when not present
      const before = sub.subscriptions.length
      await sub.removeDaoSubscription({ network: NETWORK_A, daoAddress: DAO_A })
      expect(sub.subscriptions.length).to.eq(before)
    })

    it('deletes the whole record when the last DAO is removed', async () => {
      const sub = await Models.TelegramSubscription.create({ telegramUserId: TG_USER_ID, chatId: TG_USER_ID })
      await sub.addDaoSubscription({ network: NETWORK_A, daoAddress: DAO_A })

      await sub.removeDaoSubscription({ network: NETWORK_A, daoAddress: DAO_A })

      const reloaded = await Models.TelegramSubscription.findByTelegramUserId(TG_USER_ID)
      expect(reloaded).to.be.null
    })

    it('keeps the record while other DAOs remain', async () => {
      const sub = await Models.TelegramSubscription.create({ telegramUserId: TG_USER_ID, chatId: TG_USER_ID })
      await sub.addDaoSubscription({ network: NETWORK_A, daoAddress: DAO_A })
      await sub.addDaoSubscription({ network: NETWORK_B, daoAddress: DAO_B })

      await sub.removeDaoSubscription({ network: NETWORK_A, daoAddress: DAO_A })

      const reloaded = await Models.TelegramSubscription.findByTelegramUserId(TG_USER_ID)
      expect(reloaded?.subscriptions).to.have.lengthOf(1)
    })
  })

  describe('setEvents', () => {
    it('updates the events array on an existing subscription', async () => {
      const sub = await Models.TelegramSubscription.create({ telegramUserId: TG_USER_ID, chatId: TG_USER_ID })
      await sub.addDaoSubscription({ network: NETWORK_A, daoAddress: DAO_A })

      await sub.setEvents({ network: NETWORK_A, daoAddress: DAO_A }, [])
      const reloaded = await Models.TelegramSubscription.findByTelegramUserId(TG_USER_ID)
      expect(reloaded?.subscriptions[0].events).to.deep.eq([])
    })

    it('rejects when the subscription does not exist', async () => {
      const sub = await Models.TelegramSubscription.create({ telegramUserId: TG_USER_ID, chatId: TG_USER_ID })
      await expect(sub.setEvents({ network: NETWORK_A, daoAddress: DAO_A }, [])).to.be.rejected
    })
  })

  describe('setStatus', () => {
    it('flips status and skips the save when unchanged', async () => {
      const sub = await Models.TelegramSubscription.create({ telegramUserId: TG_USER_ID, chatId: TG_USER_ID })
      await sub.setStatus(ITelegramSubscriptionStatus.Paused)
      expect(sub.status).to.eq(ITelegramSubscriptionStatus.Paused)

      // Setting to the same status should be a no-op (returns the same instance)
      const result = await sub.setStatus(ITelegramSubscriptionStatus.Paused)
      expect(result).to.eq(sub)
    })

    it('stamps blockedAt on Blocked and clears it on reactivation', async () => {
      const sub = await Models.TelegramSubscription.create({ telegramUserId: TG_USER_ID, chatId: TG_USER_ID })

      await sub.setStatus(ITelegramSubscriptionStatus.Blocked)
      let reloaded = await Models.TelegramSubscription.findByTelegramUserId(TG_USER_ID)
      expect(reloaded?.blockedAt).to.be.instanceOf(Date)

      await sub.setStatus(ITelegramSubscriptionStatus.Active)
      reloaded = await Models.TelegramSubscription.findByTelegramUserId(TG_USER_ID)
      expect(reloaded?.blockedAt ?? undefined).to.eq(undefined)
    })
  })

  describe('recordConsent', () => {
    it('keeps the first acceptance while the version is unchanged', async () => {
      const sub = await Models.TelegramSubscription.create({ telegramUserId: TG_USER_ID, chatId: TG_USER_ID })
      const acceptedAt = sub.consent.acceptedAt

      const result = await sub.recordConsent(TELEGRAM_CONSENT_VERSION)
      expect(result).to.eq(sub)
      expect(sub.consent.acceptedAt).to.eq(acceptedAt)
    })

    it('re-records acceptance when the disclosure version changes', async () => {
      const sub = await Models.TelegramSubscription.create({ telegramUserId: TG_USER_ID, chatId: TG_USER_ID })
      const acceptedAt = sub.consent.acceptedAt

      await sub.recordConsent('2099-01-01')

      const stored = await Models.TelegramSubscription.findByTelegramUserId(TG_USER_ID)
      expect(stored!.consent.version).to.eq('2099-01-01')
      expect(stored!.consent.acceptedAt).to.be.at.least(acceptedAt)
    })
  })

  describe('hasDaoSubscription', () => {
    it('returns true only for matching network+address', async () => {
      const sub = await Models.TelegramSubscription.create({ telegramUserId: TG_USER_ID, chatId: TG_USER_ID })
      await sub.addDaoSubscription({ network: NETWORK_A, daoAddress: DAO_A })

      expect(sub.hasDaoSubscription({ network: NETWORK_A, daoAddress: DAO_A })).to.be.true
      expect(sub.hasDaoSubscription({ network: NETWORK_B, daoAddress: DAO_A })).to.be.false
      expect(sub.hasDaoSubscription({ network: NETWORK_A, daoAddress: DAO_B })).to.be.false
    })
  })

  describe('findActiveSubscribersForDao', () => {
    it('returns only Active users subscribed to the DAO for that event', async () => {
      const u1 = await Models.TelegramSubscription.create({ telegramUserId: 1, chatId: 1 })
      await u1.addDaoSubscription({ network: NETWORK_A, daoAddress: DAO_A })

      const u2 = await Models.TelegramSubscription.create({ telegramUserId: 2, chatId: 2 })
      await u2.addDaoSubscription({
        network: NETWORK_A,
        daoAddress: DAO_A,
        events: [ITelegramNotificationEvent.ProposalCreated], // only proposals
      })

      // Paused user — must be excluded
      const u3 = await Models.TelegramSubscription.create({ telegramUserId: 3, chatId: 3 })
      await u3.addDaoSubscription({ network: NETWORK_A, daoAddress: DAO_A })
      await u3.setStatus(ITelegramSubscriptionStatus.Paused)

      // Different DAO — must be excluded
      const u4 = await Models.TelegramSubscription.create({ telegramUserId: 4, chatId: 4 })
      await u4.addDaoSubscription({ network: NETWORK_B, daoAddress: DAO_A })

      const proposalSubs = await Models.TelegramSubscription.findActiveSubscribersForDao(
        { network: NETWORK_A, daoAddress: DAO_A },
        ITelegramNotificationEvent.ProposalCreated,
      )
      expect(proposalSubs.map((s: any) => s.telegramUserId).sort()).to.deep.eq([1, 2])

      const voteSubs = await Models.TelegramSubscription.findActiveSubscribersForDao(
        { network: NETWORK_A, daoAddress: DAO_A },
        ITelegramNotificationEvent.VoteCast,
      )
      // u2 is opted out of vote events; only u1 remains
      expect(voteSubs.map((s: any) => s.telegramUserId)).to.deep.eq([1])
    })
  })
})
