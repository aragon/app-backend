import { Models } from '@dbModels'
import { expect } from 'chai'

describe('Model: NotificationDispatched', () => {
  describe('getEntityId', () => {
    it('joins eventId and telegramUserId with a dash', () => {
      expect(Models.NotificationDispatched.getEntityId('evt-1', 99)).to.eq('evt-1-99')
    })
  })

  describe('claim', () => {
    it('returns true on first call and false on second call (dedup)', async () => {
      const eventId = 'proposal-create:eth-sepolia-0xabc-12'
      const userId = 42

      const first = await Models.NotificationDispatched.claim(eventId, userId, 60)
      const second = await Models.NotificationDispatched.claim(eventId, userId, 60)

      expect(first).to.eq(true)
      expect(second).to.eq(false)
    })

    it('treats different users as separate claims', async () => {
      const eventId = 'vote-cast:0xtx:1'

      const u1 = await Models.NotificationDispatched.claim(eventId, 1, 60)
      const u2 = await Models.NotificationDispatched.claim(eventId, 2, 60)

      expect(u1).to.eq(true)
      expect(u2).to.eq(true)
    })

    it('persists `expiresAt` so the TTL index can reap rows', async () => {
      await Models.NotificationDispatched.claim('evt-x', 7, 30)
      const row = await Models.NotificationDispatched.findOne({ id: 'evt-x-7' })
      expect(row).to.not.be.null
      expect(row?.expiresAt).to.be.instanceOf(Date)
      const delta = row!.expiresAt.getTime() - Date.now()
      // ttl was 30s; allow a few seconds of slack
      expect(delta).to.be.greaterThan(20_000)
      expect(delta).to.be.lessThan(31_000)
    })
  })
})
