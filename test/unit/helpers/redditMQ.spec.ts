import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'
import RabbitMQ from '@modules/rabbitMQ'
import { RabbitMQHelper } from '@helpers/radditMQ'
import { EnumQueueName } from '@types'
import { ConsumeMessage } from 'amqplib'
import logger from '@logger'
import proxyquire from 'proxyquire'

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
      checkQueue: sandbox.stub().resolves({ messageCount: 10 }),
    }

    mockRabbitMQ = {
      getChannel: sandbox.stub().returns(mockChannel),
      isConnected: sandbox.stub(),
      connect: sandbox.stub().resolves(),
    }

    sandbox.replace(RabbitMQ, 'getChannel', mockRabbitMQ.getChannel)
    sandbox.replace(RabbitMQ, 'isConnected', mockRabbitMQ.isConnected)
    sandbox.replace(RabbitMQ, 'connect', mockRabbitMQ.connect)

    mockLogger = {
      warn: sandbox.stub(),
      error: sandbox.stub(),
    }

    sandbox.replace(logger, 'warn', mockLogger.warn)
    sandbox.replace(logger, 'error', mockLogger.error)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('ensureChannelConnected', () => {
    it('should connect if not connected', async () => {
      mockRabbitMQ.isConnected.onFirstCall().returns(false).onSecondCall().returns(true)

      await RabbitMQHelper.ensureChannelConnected()

      expect(mockRabbitMQ.connect.calledOnce).to.be.true
    })

    it('should do nothing if already connected', async () => {
      mockRabbitMQ.isConnected.returns(true)

      await RabbitMQHelper.ensureChannelConnected()

      expect(mockRabbitMQ.connect.called).to.be.false
    })

    it('should throw an error if RabbitMQ fails to connect', async () => {
      mockRabbitMQ.isConnected.returns(false)
      mockRabbitMQ.connect.resolves()

      try {
        await RabbitMQHelper.ensureChannelConnected()
        expect.fail('Expected function to throw an error')
      } catch (error: any) {
        expect(error.message).to.equal('Unable to establish a RabbitMQ channel')
      }

      expect(mockRabbitMQ.connect.calledOnce).to.be.true
      expect(mockLogger.warn.calledOnceWith('RabbitMQ not connected. Attempting to connect...')).to.be.true
    })
  })

  describe('process', () => {
    it('should process a message successfully and acknowledge it', async () => {
      const queueName = 'testQueue' as EnumQueueName
      const mockMessage = { id: '123', data: 'test' } as any
      const mockConsumeMessage = {
        content: Buffer.from(JSON.stringify(mockMessage)),
        properties: { replyTo: true, correlationId: 1 },
      } as any

      const mockChannel = {
        prefetch: sandbox.stub(),
        assertQueue: sandbox.stub(),
        consume: sandbox.stub().callsArgWith(1, mockConsumeMessage),
        ack: sandbox.stub().resolves(true),
        sendToQueue: sandbox.stub().resolves(true),
      }

      const messageHandler = sandbox.stub().resolves({ success: true })

      sandbox.stub(RabbitMQHelper, 'ensureChannelConnected').resolves()
      mockRabbitMQ.getChannel.returns(mockChannel as any)
      mockRabbitMQ.isConnected.returns(true)
      sandbox.stub(RabbitMQHelper, 'executeWithMutex').callsFake(async fn => fn())
      sandbox.stub(RabbitMQHelper.queuedMessages, 'delete').callsFake(() => true)

      await RabbitMQHelper.process(queueName, 2, messageHandler)

      // Wait before checking `ack`
      await new Promise(resolve => setTimeout(resolve, 0))

      expect(mockChannel.sendToQueue.calledOnce).to.be.true
      expect(mockChannel.prefetch.calledOnceWith(2)).to.be.true
      expect(mockChannel.assertQueue.calledOnceWith(queueName, { durable: true })).to.be.true
      expect(messageHandler.calledOnceWith(mockMessage)).to.be.true

      expect(mockChannel.ack.calledOnce).to.be.true
      expect(mockChannel.ack.calledWith(mockConsumeMessage)).to.be.true
    })

    it('should ensure the connection and process messages', async () => {
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

      mockRabbitMQ.isConnected.returns(true)

      const stubChannel = sandbox.stub(RabbitMQHelper, 'ensureChannelConnected')
      await RabbitMQHelper.process('testQueue' as EnumQueueName, 1, messageHandler)

      await new Promise(resolve => setImmediate(resolve))

      expect(messageHandler.calledWith(fakeMessageContent)).to.be.true
      expect(mockChannel.ack.calledWith(fakeMsg)).to.be.true
      expect(stubChannel.calledOnce).to.be.true
    })

    it('should log a warning if the channel is closed before ack', async () => {
      const queueName = 'testQueue' as EnumQueueName
      const mockMessage = { id: '123', data: 'test' } as any
      const mockConsumeMessage = {
        content: Buffer.from(JSON.stringify(mockMessage)),
        properties: {},
      } as any

      const mockChannel = {
        prefetch: sandbox.stub(),
        assertQueue: sandbox.stub(),
        consume: sandbox.stub().callsArgWith(1, mockConsumeMessage),
        ack: sandbox.stub(),
        sendToQueue: sandbox.stub(),
      }

      const messageHandler = sandbox.stub().resolves({ success: true })

      sandbox.stub(RabbitMQHelper, 'ensureChannelConnected').resolves()
      mockRabbitMQ.getChannel.returns(mockChannel as any)

      // Simulate connection loss before `ack`
      mockRabbitMQ.isConnected.returns(false)
      sandbox.stub(RabbitMQHelper, 'executeWithMutex').callsFake(async fn => fn())

      await RabbitMQHelper.process(queueName, 2, messageHandler)

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(mockLogger.warn.calledOnce).to.be.true
      expect(mockLogger.warn.calledWith('Channel closed before ack could be sent' as any)).to.be.true
    })

    it('should log Error processing message', async () => {
      const queueName = 'testQueue' as EnumQueueName
      const mockMessage = { id: '123', data: 'test' } as any
      const mockConsumeMessage = {
        content: Buffer.from(JSON.stringify(mockMessage)),
        properties: undefined,
      } as any

      const mockChannel = {
        prefetch: sandbox.stub(),
        assertQueue: sandbox.stub(),
        consume: sandbox.stub().callsArgWith(1, mockConsumeMessage),
        ack: sandbox.stub(),
        sendToQueue: sandbox.stub(),
      }

      const messageHandler = sandbox.stub().resolves({ success: true })

      sandbox.stub(RabbitMQHelper, 'ensureChannelConnected').resolves()
      mockRabbitMQ.getChannel.returns(mockChannel as any)

      // Simulate connection loss before `ack`
      mockRabbitMQ.isConnected.returns(true)
      sandbox.stub(RabbitMQHelper, 'executeWithMutex').callsFake(async fn => fn())

      await RabbitMQHelper.process(queueName, 2, messageHandler)

      await new Promise(resolve => setTimeout(resolve, 0))

      expect(mockLogger.error.calledOnce).to.be.true
      expect(mockLogger.error.calledWith('Error processing message' as any)).to.be.true
    })

    it('should throw Error RabbitMQ channel is not initialized', async () => {
      const queueName = 'testQueue' as EnumQueueName

      sandbox.stub(RabbitMQHelper, 'ensureChannelConnected').resolves()
      mockRabbitMQ.getChannel.returns(false as any)
      const messageHandler = sandbox.stub()

      await expect(RabbitMQHelper.process(queueName, 2, messageHandler)).to.be.rejectedWith(
        Error,
        'RabbitMQ channel is not initialized.',
      )
    })
  })

  describe('sendMessage', () => {
    it('should send a message successfully and receive a response', async () => {
      const queueName = 'testQueue' as EnumQueueName
      const message: any = { id: '123', data: 'test' }
      const fixedCorrelationId = 'fixed-correlation-id'
      const mockReplyQueue = { queue: 'replyQueue' }
      const mockResponse = { success: true }

      const mockConsumeMessage = {
        content: Buffer.from(JSON.stringify(mockResponse)),
        properties: { correlationId: fixedCorrelationId },
      } as any

      const mockChannel = {
        assertQueue: sandbox.stub().resolves(mockReplyQueue),
        sendToQueue: sandbox.stub().resolves(),
        consume: sandbox.stub().callsFake((queue, callback) => {
          // Simulate receiving a message asynchronously BEFORE timeout
          setTimeout(() => callback(mockConsumeMessage), 0)
        }),
        ack: sandbox.stub(),
      }

      const mockUuid = { v4: sandbox.stub().returns(fixedCorrelationId) }

      const { RabbitMQHelper } = proxyquire.noCallThru()('@helpers/radditMQ', {
        uuid: mockUuid,
      })

      sandbox.stub(RabbitMQHelper, 'ensureChannelConnected').resolves()
      mockRabbitMQ.getChannel.returns(mockChannel as any)
      mockRabbitMQ.isConnected.returns(true)
      sandbox.stub(RabbitMQHelper, 'executeWithMutex').callsFake(async (fn: any) => fn())
      sandbox.stub(RabbitMQHelper.queuedMessages, 'add').callsFake(() => true as any)
      sandbox.stub(RabbitMQHelper.queuedMessages, 'delete').callsFake(() => true as any)

      const result = await RabbitMQHelper.sendMessage(queueName, message, { waitResponse: true, timeout: 500 })

      expect(
        mockChannel.sendToQueue.calledOnceWith(queueName, Buffer.from(JSON.stringify(message)), {
          persistent: true,
          replyTo: mockReplyQueue.queue,
          correlationId: fixedCorrelationId,
        }),
      ).to.be.true

      expect(result).to.deep.equal(mockResponse)
      expect(mockChannel.ack.calledOnceWith(mockConsumeMessage)).to.be.true
    })

    it('should send a message successfully without waiting for a response', async () => {
      const queueName = 'testQueue' as EnumQueueName
      const message: any = { id: '123', data: 'test' }

      const mockChannel = {
        assertQueue: sandbox.stub().resolves(),
        sendToQueue: sandbox.stub().resolves(),
      }

      sandbox.stub(RabbitMQHelper, 'ensureChannelConnected').resolves()
      mockRabbitMQ.getChannel.returns(mockChannel as any)
      sandbox.stub(RabbitMQHelper, 'executeWithMutex').callsFake(async fn => fn())

      await RabbitMQHelper.sendMessage(queueName, message, { waitResponse: false })

      expect(
        mockChannel.sendToQueue.calledOnceWith(queueName, Buffer.from(JSON.stringify(message)), { persistent: true }),
      ).to.be.true
    })

    it('should log a warning if the channel is closed before ack could be sent', async () => {
      const queueName = 'testQueue' as EnumQueueName
      const message = { id: '123', data: 'test' }
      const fixedCorrelationId = 'fixed-correlation-id'
      const replyQueueName = 'replyQueue'

      // Simulate the RabbitMQ channel
      const mockChannel = {
        assertQueue: sandbox.stub().resolves({ queue: replyQueueName }),
        sendToQueue: sandbox.stub().resolves(),
        consume: sandbox.stub(),
        ack: sandbox.stub(),
      }

      // Mock UUID to return a fixed correlation ID
      const mockUuid = { v4: sandbox.stub().returns(fixedCorrelationId) }

      const { RabbitMQHelper } = proxyquire.noCallThru()('@helpers/radditMQ', {
        uuid: mockUuid,
      })

      sandbox.stub(RabbitMQHelper, 'ensureChannelConnected').resolves()
      mockRabbitMQ.getChannel.returns(mockChannel as any)

      // Simulate RabbitMQ connection loss before ack
      mockRabbitMQ.isConnected.returns(false)

      // Explicitly initialize consumeCallback as undefined
      let consumeCallback: ((msg: ConsumeMessage) => void) | undefined

      mockChannel.consume.callsFake((queue, callback) => {
        if (queue === replyQueueName) {
          consumeCallback = callback
        }
      })

      // Call `sendMessage` and simulate response reception
      const sendMessagePromise = RabbitMQHelper.sendMessage(queueName, message, { waitResponse: true })

      // Wait for the correlation ID to be assigned
      await new Promise<void>(resolve => setImmediate(resolve))

      // Ensure that `consumeCallback` is assigned before calling it
      if (!consumeCallback) {
        throw new Error('consumeCallback is not set')
      }

      const fakeMsg: ConsumeMessage = {
        content: Buffer.from(JSON.stringify({ success: true })),
        fields: {} as any,
        properties: { correlationId: fixedCorrelationId },
      } as any

      // Simulate receiving a response message
      consumeCallback(fakeMsg)

      await sendMessagePromise

      // Expect the warning to be logged
      expect(mockLogger.warn.calledOnce).to.be.true
      expect(mockLogger.warn.calledWithMatch('Channel closed before ack could be sent')).to.be.true

      // Ensure `ack` was **not** called since channel was disconnected
      expect(mockChannel.ack.called).to.be.false
    })

    it('should exit if the message is null', async () => {
      const queueName = 'testQueue' as EnumQueueName

      const mockChannel = {
        prefetch: sandbox.stub(),
        assertQueue: sandbox.stub().resolves(),
        consume: sandbox.stub(),
      }

      sandbox.stub(RabbitMQHelper, 'ensureChannelConnected').resolves()
      mockRabbitMQ.getChannel.returns(mockChannel as any)

      const messageHandler = sandbox.stub().resolves()

      await RabbitMQHelper.process(queueName, 1, messageHandler)

      expect(mockChannel.consume.calledOnce).to.be.true

      const consumeCallback = mockChannel.consume.getCall(0).args[1]
      expect(consumeCallback).to.be.a('function')

      await consumeCallback(null)

      expect(messageHandler.called).to.be.false
    })

    it('should throw an error if the RabbitMQ channel is not initialized', async () => {
      sandbox.stub(RabbitMQHelper, 'ensureChannelConnected').resolves()
      mockRabbitMQ.getChannel.returns(null)

      await expect(
        RabbitMQHelper.sendMessage(
          'testQueue' as any,
          {
            id: '123',
            data: 'test',
          } as any,
        ),
      ).to.be.rejectedWith(Error, 'RabbitMQ channel is not initialized.')

      expect(mockRabbitMQ.getChannel.calledOnce).to.be.true
    })

    it('should skip duplicate messages', async () => {
      const queueName = 'testQueue' as EnumQueueName
      const message: any = { id: '123', data: 'test' }

      sandbox.stub(RabbitMQHelper, 'ensureChannelConnected').resolves()
      mockRabbitMQ.getChannel.returns({ assertQueue: sandbox.stub().resolves() } as any)
      sandbox.stub(RabbitMQHelper, 'executeWithMutex').callsFake(async fn => fn())
      sandbox.stub(RabbitMQHelper.queuedMessages, 'has').returns(true)

      await RabbitMQHelper.sendMessage(queueName, message, { waitResponse: false })

      expect(mockLogger.warn.calledOnceWith('Skipping duplicate message' as any)).to.be.true
    })

    it('should timeout if no response is received', async () => {
      const queueName = 'testQueue' as EnumQueueName
      const message: any = { id: '123', data: 'test' }
      const fixedCorrelationId = 'fixed-correlation-id'
      const mockReplyQueue = { queue: 'replyQueue' }

      const mockChannel = {
        assertQueue: sandbox.stub().resolves(mockReplyQueue),
        sendToQueue: sandbox.stub().resolves(),
        consume: sandbox.stub(),
      }

      const mockUuid = { v4: sandbox.stub().returns(fixedCorrelationId) }

      const { RabbitMQHelper } = proxyquire.noCallThru()('@helpers/radditMQ', { uuid: mockUuid })

      sandbox.stub(RabbitMQHelper, 'ensureChannelConnected').resolves()
      mockRabbitMQ.getChannel.returns(mockChannel as any)
      mockRabbitMQ.isConnected.returns(true)
      sandbox.stub(RabbitMQHelper, 'executeWithMutex').callsFake(async (fn: any) => fn())
      sandbox.stub(RabbitMQHelper.queuedMessages, 'add').callsFake(() => true as any)
      sandbox.stub(RabbitMQHelper.queuedMessages, 'delete').callsFake(() => true as any)

      await expect(
        RabbitMQHelper.sendMessage(queueName, message, { waitResponse: true, timeout: 50 }),
      ).to.be.rejectedWith('Response timed out.')

      expect(
        mockChannel.sendToQueue.calledOnceWith(queueName, Buffer.from(JSON.stringify(message)), {
          persistent: true,
          replyTo: mockReplyQueue.queue,
          correlationId: fixedCorrelationId,
        }),
      ).to.be.true
    })
  })

  describe('executeWithMutex', () => {
    it('should acquire and release the mutex while executing the callback', async () => {
      const callback = sandbox.stub().resolves('success')
      const releaseStub = sandbox.stub()

      const mutexStub = {
        acquire: sandbox.stub().resolves(() => {}),
      }
      sandbox.stub(RabbitMQHelper, 'mutex').value(mutexStub)

      mutexStub.acquire.resolves(releaseStub)

      const result = await RabbitMQHelper.executeWithMutex(callback)

      expect(callback.calledOnce).to.be.true
      expect(releaseStub.calledOnce).to.be.true
      expect(result).to.equal('success')
    })

    it('should release the mutex even if the callback throws an error', async () => {
      const callback = sandbox.stub().rejects(new Error('Test Error'))
      const releaseStub = sandbox.stub()

      const mutexStub = {
        acquire: sandbox.stub().resolves(() => {}),
      }
      sandbox.stub(RabbitMQHelper, 'mutex').value(mutexStub)

      mutexStub.acquire.resolves(releaseStub)

      try {
        await RabbitMQHelper.executeWithMutex(callback)
        expect.fail('Expected function to throw an error')
      } catch (error: any) {
        expect(error.message).to.equal('Test Error')
      }

      expect(callback.calledOnce).to.be.true
      expect(releaseStub.calledOnce).to.be.true
    })
  })

  describe('getQueueMessageCount', () => {
    it('should return the correct message count for the queue', async () => {
      const queueName = 'testQueue' as EnumQueueName

      const result = await RabbitMQHelper.getQueueMessageCount(queueName)

      expect(result).to.deep.equal({ count: 10 })
      expect(mockChannel.checkQueue.calledOnceWith(queueName)).to.be.true
    })

    it('should throw an error if the RabbitMQ channel is not initialized', async () => {
      mockRabbitMQ.getChannel.returns(null)

      mockChannel = {
        checkQueue: sandbox.stub().resolves({ messageCount: 5 }),
      }

      try {
        await RabbitMQHelper.getQueueMessageCount('testQueue' as EnumQueueName)
        expect.fail('Expected function to throw an error')
      } catch (error: any) {
        expect(error.message).to.equal('RabbitMQ channel is not initialized.')
      }
    })

    it('should throw an error if checkQueue fails', async () => {
      mockChannel.checkQueue.rejects(new Error('Queue check failed'))

      try {
        await RabbitMQHelper.getQueueMessageCount('testQueue' as EnumQueueName)
        expect.fail('Expected function to throw an error')
      } catch (error: any) {
        expect(error.message).to.equal('Queue check failed')
      }
    })
  })
})
