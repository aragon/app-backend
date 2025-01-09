import RabbitMQ from '@modules/rabbitMQ'
import { RabbitMQHelper } from '@helpers/redditMQ'
import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'
import { ConsumeMessage } from 'amqplib'
import { EnumQueueName } from '@types'
import logger from '@logger'

describe('Helpers:RabbitMQ', () => {
  let sandbox: SinonSandbox
  let mockChannel: any
  let mockRabbitMQ: any
  let mockLogger: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    mockChannel = {
      prefetch: sandbox.stub(),
      assertQueue: sandbox.stub().resolves(),
      consume: sandbox.stub(),
      ack: sandbox.stub(),
      sendToQueue: sandbox.stub(),
    }
    mockRabbitMQ = {
      getChannel: sandbox.stub().returns(mockChannel),
    }
    sandbox.replace(RabbitMQ, 'getChannel', mockRabbitMQ.getChannel)

    mockLogger = {
      warn: sandbox.stub(),
      error: sandbox.stub(),
    }
    sandbox.replace(logger, 'warn', mockLogger.warn)
    sandbox.replace(logger, 'error', mockLogger.error)
    sandbox.stub(RabbitMQHelper, 'ensureChannelConnected').resolves()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('process method', () => {
    it('should throw an error if the channel is not initialized', async () => {
      mockRabbitMQ.getChannel.returns(null)

      try {
        await RabbitMQHelper.process('testQueue' as EnumQueueName, 1, async () => {})
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('RabbitMQ channel is not initialized.')
      }
    })

    it('should set up prefetch with the correct concurrency', async () => {
      await RabbitMQHelper.process('testQueue' as EnumQueueName, 5, async () => {})
      expect(mockChannel.prefetch.calledWith(5)).to.be.true
    })

    it('should assert the queue', async () => {
      await RabbitMQHelper.process('testQueue' as EnumQueueName, 1, async () => {})
      expect(mockChannel.assertQueue.calledWith('testQueue', { durable: true })).to.be.true
    })

    it('should consume messages and process them using the messageHandler', async () => {
      const messageHandler = sandbox.stub().resolves()
      const fakeMessageContent = { id: '123', data: 'test' }
      const fakeMsg: ConsumeMessage = {
        content: Buffer.from(JSON.stringify(fakeMessageContent)),
        fields: {} as any,
        properties: {} as any,
      }

      mockChannel.consume.callsFake((queue, onMessage) => {
        onMessage(fakeMsg)
      })

      await RabbitMQHelper.process('testQueue' as EnumQueueName, 1, messageHandler)

      await new Promise(resolve => setImmediate(resolve))

      expect(messageHandler.calledWith(fakeMessageContent)).to.be.true
      expect(mockChannel.ack.calledWith(fakeMsg)).to.be.true
    })

    it('should handle duplicate messages correctly', async () => {
      const messageHandler = sandbox.stub().resolves()
      const fakeMessageContent = { id: '123', data: 'test' }
      const fakeMsg: ConsumeMessage = {
        content: Buffer.from(JSON.stringify(fakeMessageContent)),
        fields: {} as any,
        properties: {} as any,
      }

      mockChannel.consume.callsFake((queue, onMessage) => {
        onMessage(fakeMsg)
        onMessage(fakeMsg) // Duplicate message
      })

      await RabbitMQHelper.process('testQueue' as EnumQueueName, 1, messageHandler)

      await new Promise(resolve => setImmediate(resolve))

      expect(messageHandler.calledOnce).to.be.true
      expect(mockLogger.warn.calledWith('Duplicate message in queue, skipping')).to.be.true
      expect(mockChannel.ack.calledTwice).to.be.true
    })

    it('should acknowledge messages after processing', async () => {
      const messageHandler = sandbox.stub().resolves()
      const fakeMessageContent = { id: '123', data: 'test' }
      const fakeMsg: ConsumeMessage = {
        content: Buffer.from(JSON.stringify(fakeMessageContent)),
        fields: {} as any,
        properties: {} as any,
      }

      mockChannel.consume.callsFake((queue, onMessage) => {
        onMessage(fakeMsg)
      })

      await RabbitMQHelper.process('testQueue' as EnumQueueName, 1, messageHandler)

      await new Promise(resolve => setImmediate(resolve))

      expect(mockChannel.ack.calledWith(fakeMsg)).to.be.true
    })

    it('should handle errors in messageHandler and not crash', async () => {
      const errorInHandler = new Error('Handler error')
      const messageHandler = sandbox.stub().rejects(errorInHandler)
      const fakeMessageContent = { id: '123', data: 'test' }
      const fakeMsg: ConsumeMessage = {
        content: Buffer.from(JSON.stringify(fakeMessageContent)),
        fields: {} as any,
        properties: {} as any,
      }

      mockChannel.consume.callsFake((queue, onMessage) => {
        onMessage(fakeMsg)
      })

      await RabbitMQHelper.process('testQueue' as EnumQueueName, 1, messageHandler)

      await new Promise(resolve => setImmediate(resolve))

      expect(mockLogger.error.calledWith('Error processing message:')).to.be.true
      expect(mockChannel.ack.calledWith(fakeMsg)).to.be.true
    })
  })

  describe('sendMessage method', () => {
    it('should throw an error if the channel is not initialized', async () => {
      mockRabbitMQ.getChannel.returns(null)

      try {
        await RabbitMQHelper.sendMessage('testQueue' as EnumQueueName, { id: '123', data: 'test' } as any)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('RabbitMQ channel is not initialized.')
      }
    })

    it('should assert the queue', async () => {
      await RabbitMQHelper.sendMessage('testQueue' as EnumQueueName, { id: '123', data: 'test' } as any)
      expect(mockChannel.assertQueue.calledWith('testQueue', { durable: true })).to.be.true
    })

    it('should send message without waiting for a response', async () => {
      const message = { id: '123', data: 'test' }
      await RabbitMQHelper.sendMessage('testQueue' as EnumQueueName, message as any)

      expect(
        mockChannel.sendToQueue.calledWith('testQueue', Buffer.from(JSON.stringify(message)), { persistent: true }),
      ).to.be.true
    })

    it('should send message and wait for a response', async () => {
      const message = { id: '123', data: 'test' }
      const responseMessage = { result: 'success' }
      const replyQueueName = 'amq.gen-test-reply-queue'

      mockChannel.assertQueue.withArgs('', { exclusive: true }).resolves({ queue: replyQueueName })

      let usedCorrelationId: string | undefined
      let consumeCallback: ((msg: ConsumeMessage) => void) | undefined

      mockChannel.consume.callsFake((queue, onMessage) => {
        if (queue === replyQueueName) {
          consumeCallback = onMessage
        }
      })

      mockChannel.sendToQueue.callsFake((queue, content, options) => {
        usedCorrelationId = options.correlationId
      })

      const sendMessagePromise = RabbitMQHelper.sendMessage('testQueue' as EnumQueueName, message as any, {
        waitResponse: true,
      })

      await new Promise<void>(resolve => {
        const checkCorrelationId = () => {
          if (usedCorrelationId) {
            resolve()
          } else {
            setImmediate(checkCorrelationId)
          }
        }
        checkCorrelationId()
      })

      if (!consumeCallback) {
        throw new Error('consumeCallback is not set')
      }

      const fakeMsg: ConsumeMessage = {
        content: Buffer.from(JSON.stringify(responseMessage)),
        fields: {} as any,
        properties: { correlationId: usedCorrelationId },
      } as any

      consumeCallback(fakeMsg)

      const result = await sendMessagePromise

      expect(result).to.deep.equal(responseMessage)
      expect(
        mockChannel.sendToQueue.calledWith(
          'testQueue',
          Buffer.from(JSON.stringify(message)),
          sinon.match({
            persistent: true,
            replyTo: replyQueueName,
            correlationId: usedCorrelationId,
          }),
        ),
      ).to.be.true
    })
  })
})
