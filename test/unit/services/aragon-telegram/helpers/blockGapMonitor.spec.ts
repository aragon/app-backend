import RabbitMQHelper from '@helpers/rabbitMQ'
import { BlockGapMonitor } from '@services/aragon-telegram/helpers/blockGapMonitor'
import { EnumQueueName, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox, type SinonStub } from 'sinon'

const NETWORK = NetworksEnum.ethereumSepolia
const reading = { network: NETWORK, lastIndexed: 899, chainHead: 1000, lagSeconds: 1212 }

describe('AragonTelegram: BlockGapMonitor', () => {
  let sandbox: SinonSandbox
  let sendMessageStub: SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    BlockGapMonitor.resetShared()
    sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves({ readings: [reading] })
  })

  afterEach(() => {
    sandbox.restore()
    BlockGapMonitor.resetShared()
  })

  it('asks the dao service over the queue and waits for its reply', async () => {
    expect(await BlockGapMonitor.read()).to.deep.equal([reading])

    const [queue, message, options] = sendMessageStub.firstCall.args
    expect(queue).to.equal(EnumQueueName.indexerBlockGap)
    expect(message.params.sentAt).to.be.a('number')
    expect(message.params.replyTimeoutMs).to.equal(options.timeout)
    expect(options.waitResponse).to.be.true
  })

  it('answers with no readings when the reply never arrives', async () => {
    sendMessageStub.resolves(null)

    expect(await BlockGapMonitor.read()).to.deep.equal([])
  })

  it('asks once for the gauges that collect together in a single scrape', async () => {
    await Promise.all([BlockGapMonitor.readShared(), BlockGapMonitor.readShared(), BlockGapMonitor.readShared()])

    expect(sendMessageStub.callCount).to.equal(1)
  })

  it('answers with no readings rather than throwing when the queue fails', async () => {
    sendMessageStub.rejects(new Error('rabbit exploded'))

    expect(await BlockGapMonitor.readShared()).to.deep.equal([])
  })
})
