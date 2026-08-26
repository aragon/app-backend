import RabbitMQHelper from '@helpers/rabbitMQ'
import TelegramNotifier from '@helpers/telegramNotifier'
import logger from '@logger'
import RabbitMQ from '@modules/rabbitMQ'
import { EnumQueueName, type IQueueTelegramNotification, ITelegramNotificationEvent, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

const payload: IQueueTelegramNotification = {
  id: 'proposal-created:0xabc',
  event: ITelegramNotificationEvent.ProposalCreated,
  network: NetworksEnum.ethereumSepolia,
  daoAddress: '0xDd1CBF1A28d904A38a53A1CB2Db001F71379f9df',
  proposalId: '0xabc',
}

describe('Helper: TelegramNotifier', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('publishes the payload to the telegram notifications queue', async () => {
    const sendStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

    await TelegramNotifier.publish(payload)

    expect(sendStub.calledOnceWith(EnumQueueName.telegramNotifications, payload)).to.be.true
  })

  it('publishOrThrow sends straight on the channel with a publish timeout', async () => {
    const sendToQueue = sandbox.stub().resolves()
    sandbox.stub(RabbitMQ, 'getChannel').returns({ sendToQueue } as any)

    await TelegramNotifier.publishOrThrow(payload)

    expect(sendToQueue.calledOnce).to.be.true
    const [queueName, sentPayload, opts] = sendToQueue.firstCall.args
    expect(queueName).to.eq(EnumQueueName.telegramNotifications)
    expect(sentPayload).to.deep.eq(payload)
    expect(opts.persistent).to.be.true
    expect(opts.timeout).to.be.a('number')
  })

  it('publishOrThrow surfaces a broker failure instead of swallowing it', async () => {
    const sendToQueue = sandbox.stub().rejects(new Error('rabbit down'))
    sandbox.stub(RabbitMQ, 'getChannel').returns({ sendToQueue } as any)

    await expect(TelegramNotifier.publishOrThrow(payload)).to.be.rejectedWith('rabbit down')
  })

  it('publishOrThrow surfaces a missing channel (broker not connected)', async () => {
    sandbox.stub(RabbitMQ, 'getChannel').throws(new Error('RabbitMQ is not connected. Call RabbitMQ.connect() first.'))

    await expect(TelegramNotifier.publishOrThrow(payload)).to.be.rejectedWith('not connected')
  })

  it('never throws — a queue failure is only logged as a warning', async () => {
    sandbox.stub(RabbitMQHelper, 'sendMessage').rejects(new Error('rabbit down'))
    const warnStub = sandbox.stub(logger, 'warn')

    await TelegramNotifier.publish(payload)

    expect(warnStub.calledOnce).to.be.true
  })
})
