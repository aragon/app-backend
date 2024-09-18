import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import RabbitMQ from '@modules/rabbitMQ'
import { RabbitMQHelper } from '@helpers/redditMQ'
import { EnumQueueName } from '@types'

describe('Manual: RabbitMQ', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox && sandbox.restore()
  })

  const rabbitSendMessage = async () => {
    const message: any = {
      type: 'daoAssets',
      id: '0',
      params: {
        address: 'fake-address',
        network: 'fake-network',
      },
    }

    await RabbitMQHelper.sendMessage(EnumQueueName.daoTransactions, message)
    await RabbitMQHelper.sendMessage(EnumQueueName.daoAssets, message)
    console.log(`messages sent`)
  }

  const rabbitReceiveMessage = async () => {
    await RabbitMQHelper.process(EnumQueueName.daoAssets, 10, async job => {
      console.log(`Processing job for user ${job}`)
    })
  }

  it('should test rabbitMQ', async () => {
    await RabbitMQ.connect()

    const receivePromise = rabbitReceiveMessage()

    // Wait a short time to ensure the receiver is ready
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Send a message
    await rabbitSendMessage()

    // Wait for the receiver to process the message
    await rabbitReceiveMessage()
  })

  it('should send rabbitMQ', async () => {
    await RabbitMQ.connect()

    // Send a message
    await rabbitSendMessage()
  })
})
