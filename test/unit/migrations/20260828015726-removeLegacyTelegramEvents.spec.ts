import { Models } from '@dbModels'
import removeLegacyTelegramEventsMigration from '@src/migrations/20260828015726-removeLegacyTelegramEvents'
import { ITelegramNotificationEvent, ITelegramSubscriptionStatus, TELEGRAM_CONSENT_VERSION } from '@types'
import { expect } from 'chai'

const legacyDoc = (userId: number, events: string[]) => ({
  id: `tg-${userId}`,
  telegramUserId: userId,
  chatId: userId,
  status: ITelegramSubscriptionStatus.Active,
  subscriptions: [
    {
      daoId: 'citrea-mainnet-0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df',
      network: 'citrea-mainnet',
      daoAddress: '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df',
      events,
      subscribedAt: 1756200000000,
    },
  ],
})

describe('migration: remove legacy telegram events', () => {
  it('strips removed event values so the document validates and saves again', async () => {
    // Written straight to the collection — exactly how the legacy data exists,
    // since the current schema refuses these enum values.
    await Models.TelegramSubscription.collection.insertMany([
      legacyDoc(100, [
        ITelegramNotificationEvent.ProposalCreated,
        ITelegramNotificationEvent.ProposalEnding,
        'vote.cast',
        'vote.reset',
      ]),
      legacyDoc(200, [ITelegramNotificationEvent.ProposalCreated, ITelegramNotificationEvent.ProposalExecuted]),
    ])

    await removeLegacyTelegramEventsMigration.start()

    const cleaned = await Models.TelegramSubscription.collection.findOne({ telegramUserId: 100 })
    expect(cleaned!.subscriptions[0].events).to.deep.eq([
      ITelegramNotificationEvent.ProposalCreated,
      ITelegramNotificationEvent.ProposalEnding,
    ])

    // A document that was already clean is left untouched.
    const untouched = await Models.TelegramSubscription.collection.findOne({ telegramUserId: 200 })
    expect(untouched!.subscriptions[0].events).to.deep.eq([
      ITelegramNotificationEvent.ProposalCreated,
      ITelegramNotificationEvent.ProposalExecuted,
    ])

    // The failure this fixes: a full-document save (consent recording) must pass validation again.
    const sub = await Models.TelegramSubscription.findByTelegramUserId(100)
    await sub!.recordConsent(TELEGRAM_CONSENT_VERSION)
    expect((await Models.TelegramSubscription.findByTelegramUserId(100))!.consent!.version).to.eq(
      TELEGRAM_CONSENT_VERSION,
    )
  })
})
