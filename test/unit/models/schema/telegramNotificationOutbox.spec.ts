import { Models } from '@dbModels'
import {
  type HexAddress,
  ITelegramNotificationEvent,
  NetworksEnum,
  TELEGRAM_NOTIFICATION_OUTBOX_MAX_PENDING_DAYS,
  TELEGRAM_NOTIFICATION_OUTBOX_RETENTION_DAYS,
  TelegramNotificationOutboxStatus,
} from '@types'
import { expect } from 'chai'

const DAY_MS = 24 * 60 * 60 * 1000

const payload = {
  id: 'proposal-create:0xabc',
  event: ITelegramNotificationEvent.ProposalCreated,
  network: NetworksEnum.ethereumSepolia,
  daoAddress: '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress,
  proposalId: '0xabc',
}

describe('Model: TelegramNotificationOutbox', () => {
  it('gives a new pending record an expiry so it cannot pile up forever', async () => {
    const before = Date.now()
    const record = await Models.TelegramNotificationOutbox.enqueue(payload)

    const expiry = record.deleteAfter!.getTime() - before
    expect(expiry).to.be.within(
      TELEGRAM_NOTIFICATION_OUTBOX_MAX_PENDING_DAYS * DAY_MS - 5_000,
      TELEGRAM_NOTIFICATION_OUTBOX_MAX_PENDING_DAYS * DAY_MS + 5_000,
    )
  })

  it('moves the expiry out to the retention period once published', async () => {
    const record = await Models.TelegramNotificationOutbox.enqueue(payload)
    const before = Date.now()

    const published = await record.markPublished()

    const expiry = published!.deleteAfter!.getTime() - before
    expect(expiry).to.be.within(
      TELEGRAM_NOTIFICATION_OUTBOX_RETENTION_DAYS * DAY_MS - 5_000,
      TELEGRAM_NOTIFICATION_OUTBOX_RETENTION_DAYS * DAY_MS + 5_000,
    )
  })

  it('creates one pending record for repeated enqueue calls', async () => {
    const first = await Models.TelegramNotificationOutbox.enqueue(payload)
    const second = await Models.TelegramNotificationOutbox.enqueue(payload)

    expect(first.id).to.eq(payload.id)
    expect(second.id).to.eq(payload.id)
    expect(await Models.TelegramNotificationOutbox.countDocuments({ id: payload.id })).to.eq(1)
    expect(first.status).to.eq(TelegramNotificationOutboxStatus.Pending)
  })

  it('finds only pending records whose retry time has arrived', async () => {
    await Models.TelegramNotificationOutbox.enqueue(payload)
    const future = await Models.TelegramNotificationOutbox.enqueue({
      ...payload,
      id: 'proposal-create:0xdef',
      proposalId: '0xdef',
    })
    await future.updateOne({ nextAttemptAt: new Date(Date.now() + 60_000) })

    const ready = await Models.TelegramNotificationOutbox.findReadyToPublish(10)

    expect(ready.map(record => record.id)).to.deep.eq([payload.id])
  })

  it('stringifies a non-Error failure reason when marking a failed attempt', async () => {
    const record = await Models.TelegramNotificationOutbox.enqueue(payload)

    const failed = await record.markFailed('broker string rejection', 1000)

    expect(failed?.attemptCount).to.eq(1)
    expect(failed?.lastError).to.eq('broker string rejection')
  })

  it('marks a confirmed record published and schedules its retention expiry', async () => {
    const record = await Models.TelegramNotificationOutbox.enqueue(payload)

    const published = await record.markPublished()

    expect(published?.status).to.eq(TelegramNotificationOutboxStatus.Published)
    expect(published?.publishedAt).to.be.instanceOf(Date)
    expect(published?.deleteAfter).to.be.instanceOf(Date)
  })
})
