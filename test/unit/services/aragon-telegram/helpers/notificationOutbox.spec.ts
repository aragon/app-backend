import config from '@config'
import { Models } from '@dbModels'
import TelegramNotifier from '@helpers/telegramNotifier'
import { TelegramNotificationOutboxPublisher } from '@services/aragon-telegram/helpers/notificationOutbox'
import {
  type HexAddress,
  ITelegramNotificationEvent,
  NetworksEnum,
  TelegramNotificationOutboxStatus,
} from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const payload = {
  id: 'proposal-executed:0xabc',
  event: ITelegramNotificationEvent.ProposalExecuted,
  network: NetworksEnum.ethereumSepolia,
  daoAddress: '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df' as HexAddress,
  proposalId: '0xabc',
}

describe('AragonTelegram: NotificationOutbox', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('publishes pending records and marks them published after RabbitMQ confirms', async () => {
    await Models.TelegramNotificationOutbox.enqueue(payload)
    const publishStub = sandbox.stub(TelegramNotifier, 'publishOrThrow').resolves()

    await TelegramNotificationOutboxPublisher.start()

    expect(publishStub.calledOnceWith(payload)).to.be.true
    const record = await Models.TelegramNotificationOutbox.findOne({ id: payload.id })
    expect(record?.status).to.eq(TelegramNotificationOutboxStatus.Published)
  })

  it('keeps broker failures pending for a later retry', async () => {
    await Models.TelegramNotificationOutbox.enqueue(payload)
    sandbox.stub(TelegramNotifier, 'publishOrThrow').rejects(new Error('rabbit down'))

    await TelegramNotificationOutboxPublisher.start()

    const record = await Models.TelegramNotificationOutbox.findOne({ id: payload.id })
    expect(record?.status).to.eq(TelegramNotificationOutboxStatus.Pending)
    expect(record?.attemptCount).to.eq(1)
    expect(record?.lastError).to.eq('rabbit down')
    expect(record?.nextAttemptAt.getTime()).to.be.greaterThan(Date.now() - config.SERVICES.ARAGON_TELEGRAM.OUTBOX_INTERVAL)
  })
})
