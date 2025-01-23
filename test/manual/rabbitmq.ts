import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import RabbitMQ from '@modules/rabbitMQ'
import { RabbitMQHelper } from '@helpers/radditMQ'
import { EnumQueueName } from '@types'
import Utils from '@helpers/utils'
import config from '@config'
import { expect } from 'chai'

describe('Manual: RabbitMQ', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    config.RABBITMQ.URI = 'amqp://user:password@localhost:5672'
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

  describe('reconnection test', () => {
    it('should test rabbitMQ reconnection', async () => {
      await RabbitMQ.connect()

      // Close the connection
      await RabbitMQ.forceClose()

      await Utils.wait(config.RABBITMQ.RECONNECT_TIME + 1000)

      expect(RabbitMQ.isConnected()).to.be.true
    })

    it('should recover if only the channel is closed', async () => {
      expect(RabbitMQ.isConnected()).to.be.true

      // Force only the channel to close. The connection remains open.
      if (RabbitMQ.getChannel()) {
        await RabbitMQ.getChannel()!.close()
        console.log('Manually closed RabbitMQ channel')
      }

      await Utils.wait(config.RABBITMQ.RECONNECT_TIME + 1000)

      // The code should recreate the channel automatically,
      // or you can do it manually if your code doesn't automatically do so.
      expect(RabbitMQ.isConnected()).to.be.true
    })
  })
})
