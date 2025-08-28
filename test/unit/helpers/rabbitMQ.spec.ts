import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'
import RabbitMQHelper from '@helpers/rabbitMQ'
import RabbitMQ from '@modules/rabbitMQ'
import { EnumQueueName } from '@types'
import utils from '@helpers/utils'
import { ConfirmChannel } from 'amqplib'
import logger from '@logger'
import config from '@config'

describe('Helpers:RabbitMQ', () => {
  let sandbox: SinonSandbox
  let loggerErrorStub: sinon.SinonStub
  let loggerWarnStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    loggerErrorStub = sandbox.stub(logger, 'error')
    loggerWarnStub = sandbox.stub(logger, 'warn')
  })

  afterEach(() => {
    sandbox.restore()
    RabbitMQHelper.queuedMessages.clear()
    RabbitMQHelper.activeJobs.clear()
  })

  describe('executeWithMutex', () => {
    it('should execute the callback and return its value', async () => {
      const result = await RabbitMQHelper.executeWithMutex(() => Promise.resolve(42))
      expect(result).to.equal(42)
    })

    it('should enforce mutual exclusion', async () => {
      let concurrentExecutions = 0
      let maxConcurrent = 0

      const tasks = Array.from({ length: 5 }).map(() =>
        RabbitMQHelper.executeWithMutex(async () => {
          concurrentExecutions++
          maxConcurrent = Math.max(maxConcurrent, concurrentExecutions)
          await new Promise(resolve => setTimeout(resolve, 50))
          concurrentExecutions--
        }),
      )

      await Promise.all(tasks)
      expect(maxConcurrent).to.equal(1)
    })
  })

  describe('parseData', () => {
    it('should handle JSON parsing errors gracefully', () => {
      const fakeMsg: any = {
        content: Buffer.from('invalid-json'),
      }

      const result = RabbitMQHelper.parseData(fakeMsg)

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Failed to parse Buffer as JSON')).to.be.true
    })

    it('should handle Buffer type data', () => {
      const originalData = { test: 'data' }
      const bufferTypeData = {
        type: 'Buffer',
        data: Buffer.from(JSON.stringify(originalData)).toJSON().data,
      }

      const fakeMsg: any = {
        content: Buffer.from(JSON.stringify(bufferTypeData)),
      }

      const result = RabbitMQHelper.parseData(fakeMsg)

      expect(result).to.deep.equal(originalData)
    })

    it('should handle non-buffer content', () => {
      const testData = { test: 'data' }
      const fakeMsg: any = {
        content: testData,
      }

      const result = RabbitMQHelper.parseData(fakeMsg)

      expect(result).to.deep.equal(testData)
    })
  })

  describe('process', () => {
    it('should consume a message and process it successfully', async () => {
      const queueName = EnumQueueName.contractInfo
      const fakeMsg: any = {
        content: Buffer.from(JSON.stringify({ id: 'msg-1', data: 'test' })),
        properties: { correlationId: 'corr-id-1', replyTo: 'reply-queue' },
        fields: {} as any,
      }

      const fakeChannel: Partial<any> = {
        consume: sandbox.stub().callsFake((_queue, onMessage) => {
          setImmediate(() => onMessage(fakeMsg))
        }),
        ack: sandbox.stub(),
        prefetch: sandbox.stub().returns(Promise.resolve()),
        assertQueue: sandbox.stub().resolves(),
      }

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn(fakeChannel as ConfirmChannel)
        }),
        sendToQueue: sandbox.stub().resolves(true),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      const handler = sandbox.stub().resolves({ response: 'ok' })

      await RabbitMQHelper.process(queueName, handler)
      await utils.wait(20)

      expect(handler.calledOnce).to.be.true
      expect(fakeChannel.ack.calledOnce).to.be.true
    })

    it('should handle RabbitMQ connection errors gracefully', async () => {
      const queueName = EnumQueueName.contractInfo
      const connectionError = new Error('Connection failed')

      sandbox.stub(RabbitMQ, 'getChannel').throws(connectionError)
      const handler = sandbox.stub()

      await RabbitMQHelper.process(queueName, handler)

      expect(loggerErrorStub.calledWith('rabbit process error')).to.be.true
      expect(handler.called).to.be.false
    })

    it('should handle message handler errors gracefully', async () => {
      const queueName = EnumQueueName.contractInfo
      const handlerError = new Error('Handler failed')
      const fakeMsg: any = {
        content: Buffer.from(JSON.stringify({ id: 'msg-error', data: 'test' })),
        properties: {},
        fields: {} as any,
      }

      const fakeChannel: Partial<any> = {
        consume: sandbox.stub().callsFake((_queue, onMessage) => {
          setImmediate(() => onMessage(fakeMsg))
        }),
        ack: sandbox.stub(),
        prefetch: sandbox.stub().returns(Promise.resolve()),
        assertQueue: sandbox.stub().resolves(),
      }

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn(fakeChannel as ConfirmChannel)
        }),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      const handler = sandbox.stub().rejects(handlerError)

      await RabbitMQHelper.process(queueName, handler)
      await utils.wait(20)

      expect(loggerErrorStub.calledWith('Error in messageHandler')).to.be.true
      expect(handler.calledOnce).to.be.true
    })

    it('should handle null messages gracefully', async () => {
      const queueName = EnumQueueName.contractInfo

      const fakeChannel: Partial<any> = {
        consume: sandbox.stub().callsFake((_queue, onMessage) => {
          setImmediate(() => onMessage(null))
        }),
        prefetch: sandbox.stub().returns(Promise.resolve()),
        assertQueue: sandbox.stub().resolves(),
      }

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn(fakeChannel as ConfirmChannel)
        }),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      const handler = sandbox.stub()

      await RabbitMQHelper.process(queueName, handler)
      await utils.wait(20)

      expect(loggerWarnStub.calledWith('No message to consume')).to.be.true
      expect(handler.called).to.be.false
    })
  })

  describe('sendMessage', () => {
    it('should send a message and return null in fire-and-forget mode', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'msg-2' }

      const fakeChannelWrapper = {
        sendToQueue: sandbox.stub().resolves(true),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const result = await RabbitMQHelper.sendMessage(queueName, payload)
      expect(result).to.be.null
      expect(fakeChannelWrapper.sendToQueue.calledOnce).to.be.true
    })

    it('should skip duplicate messages with the same id and process a new message with a different id', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'msg-2' }
      const payloadDifferent = { id: 'msg-3' }

      const fakeChannelWrapper = {
        sendToQueue: sandbox.stub().resolves(true),
      }

      // Stubs
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      // Send the same message twice (in parallel) to simulate duplicates.
      await Promise.all([
        RabbitMQHelper.sendMessage(queueName, payload),
        RabbitMQHelper.sendMessage(queueName, payload),
      ])

      // Only the first message should actually be queued
      expect(fakeChannelWrapper.sendToQueue.calledOnce).to.be.true

      // The code logs a warning when skipping a duplicate
      expect(loggerWarnStub.calledOnceWith('Skipping duplicate message' as any)).to.be.true

      // Now send a new message (with same ID)
      await RabbitMQHelper.sendMessage(queueName, payload)
      // Now send a new message (with different ID)
      await RabbitMQHelper.sendMessage(queueName, payloadDifferent)

      expect(fakeChannelWrapper.sendToQueue.calledThrice).to.be.true
    })

    it('should handle sendToQueue errors gracefully in fire-and-forget mode', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'msg-error' }
      const sendError = new Error('Send failed')

      const fakeChannelWrapper = {
        sendToQueue: sandbox.stub().rejects(sendError),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const result = await RabbitMQHelper.sendMessage(queueName, payload)

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error sendMessage')).to.be.true
    })

    it('should handle sendMessage with response errors gracefully', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'msg-response-error' }
      const connectionError = new Error('Connection error')

      sandbox.stub(RabbitMQ, 'getChannel').throws(connectionError)

      const result = await RabbitMQHelper.sendMessage(queueName, payload, { waitResponse: true })

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Error sendMessage with response')).to.be.true
    })

    it('should handle timeout in _sendMessageWithResponse', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'timeout-msg' }

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn({
            assertQueue: sandbox.stub().resolves({ queue: 'temp-queue' }),
            consume: sandbox.stub().resolves({ consumerTag: 'tag-123' }),
            sendToQueue: sandbox.stub().resolves(true),
          })
        }),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const result = await RabbitMQHelper.sendMessage(queueName, payload, {
        waitResponse: true,
        timeout: 10, // Very short timeout
      })

      expect(result).to.be.null
      expect(loggerWarnStub.calledWith('Timeout waiting for response')).to.be.true
    })
  })

  describe('getQueueMessageCount', () => {
    it('should return the correct message count', async () => {
      const queueName = EnumQueueName.contractInfo
      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn({ checkQueue: sandbox.stub().resolves({ messageCount: 3 }) })
        }),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      const count = await RabbitMQHelper.getQueueMessageCount(queueName)
      expect(count).to.equal(3)
    })

    it('should handle getQueueMessageCount errors gracefully', async () => {
      const queueName = EnumQueueName.contractInfo
      const queueError = new Error('Queue check failed')

      sandbox.stub(RabbitMQ, 'getChannel').throws(queueError)

      const count = await RabbitMQHelper.getQueueMessageCount(queueName)

      expect(count).to.be.null
      expect(loggerErrorStub.calledWith('getQueueMessageCount error')).to.be.true
    })
  })

  describe('sendMessageWithThrottle', () => {
    let loggerVerboseStub: sinon.SinonStub
    let getQueueMessageCountStub: sinon.SinonStub
    let sendMessageStub: sinon.SinonStub
    let utilsWaitStub: sinon.SinonStub

    beforeEach(() => {
      loggerVerboseStub = sandbox.stub(logger, 'verbose')
      getQueueMessageCountStub = sandbox.stub(RabbitMQHelper, 'getQueueMessageCount')
      sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage')
      utilsWaitStub = sandbox.stub(utils, 'wait').resolves()
    })

    it('should send message immediately when queue is below threshold', async () => {
      const queueName = EnumQueueName.requeue
      const payload = {
        id: 'plugin-123',
        params: { address: '0x123', network: 'mainnet', pluginId: 'p-1' },
      }

      getQueueMessageCountStub.resolves(10) // Below default threshold of 50
      sendMessageStub.resolves()

      await RabbitMQHelper.sendMessageWithThrottle(queueName, payload)

      expect(getQueueMessageCountStub.calledOnceWith(queueName)).to.be.true
      expect(sendMessageStub.calledOnceWith(queueName, payload)).to.be.true
      expect(utilsWaitStub.called).to.be.false
      expect(loggerVerboseStub.calledWith('Message sent to queue "log.requeue"')).to.be.true
    })

    it('should wait and retry when queue is at capacity', async () => {
      const queueName = EnumQueueName.requeue
      const payload = {
        id: 'plugin-456',
        params: { address: '0x456', network: 'testnet' },
      }

      // First call returns 50 (at capacity), second call returns 30 (below capacity)
      getQueueMessageCountStub.onFirstCall().resolves(50)
      getQueueMessageCountStub.onSecondCall().resolves(30)
      sendMessageStub.resolves()

      await RabbitMQHelper.sendMessageWithThrottle(queueName, payload)

      expect(getQueueMessageCountStub.calledTwice).to.be.true
      expect(sendMessageStub.calledOnceWith(queueName, payload)).to.be.true
      expect(utilsWaitStub.calledOnce).to.be.true
      expect(utilsWaitStub.firstCall.args[0]).to.equal(config.RABBITMQ.THROTTLE_RETRY_DELAY)
      expect(loggerWarnStub.calledWith('Queue "log.requeue" has reached the limit. Waiting...')).to.be.true
    })

    it('should retry when getQueueMessageCount returns null', async () => {
      const queueName = EnumQueueName.requeue
      const payload = {
        id: 'plugin-789',
        params: { address: '0x789', network: 'mainnet' },
      }

      // First call returns null, second call returns 20
      getQueueMessageCountStub.onFirstCall().resolves(null)
      getQueueMessageCountStub.onSecondCall().resolves(20)
      sendMessageStub.resolves()

      await RabbitMQHelper.sendMessageWithThrottle(queueName, payload)

      expect(getQueueMessageCountStub.calledTwice).to.be.true
      expect(sendMessageStub.calledOnceWith(queueName, payload)).to.be.true
      expect(utilsWaitStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledWith('Unable to get message count for queue "log.requeue". Retrying...')).to.be.true
    })

    it('should use custom options when provided', async () => {
      const queueName = EnumQueueName.requeue
      const payload = {
        id: 'plugin-custom',
        params: { address: '0xabc', network: 'mainnet' },
      }
      const customOptions = {
        maxQueueSize: 25,
        retryDelay: 1000,
        logContext: { extra: 'context' },
      }

      // First call returns 25 (at custom capacity), second call returns 10
      getQueueMessageCountStub.onFirstCall().resolves(25)
      getQueueMessageCountStub.onSecondCall().resolves(10)
      sendMessageStub.resolves()

      await RabbitMQHelper.sendMessageWithThrottle(queueName, payload, customOptions)

      expect(getQueueMessageCountStub.calledTwice).to.be.true
      expect(sendMessageStub.calledOnceWith(queueName, payload)).to.be.true
      expect(utilsWaitStub.calledOnceWith(1000)).to.be.true
    })

    it('should merge payload params with log context', async () => {
      const queueName = EnumQueueName.requeue
      const payload = {
        id: 'plugin-context',
        params: { address: '0xdef', network: 'mainnet', pluginId: 'p-2' },
      }
      const customOptions = {
        logContext: { customField: 'customValue' },
      }

      getQueueMessageCountStub.resolves(5)
      sendMessageStub.resolves()

      await RabbitMQHelper.sendMessageWithThrottle(queueName, payload, customOptions)

      // Verify that the log contains both params and custom context
      const logCall = loggerVerboseStub.getCall(0)
      const logMeta = logCall.args[1]

      // The log metadata should contain params from payload and custom logContext
      expect(logMeta).to.include({
        queueName: 'log.requeue',
        messageId: 'plugin-context',
        count: 6,
      })
    })

    it('should handle multiple retries until queue has space', async () => {
      const queueName = EnumQueueName.requeue
      const payload = {
        id: 'plugin-multi-retry',
        params: { address: '0x111', network: 'mainnet' },
      }

      // Simulate: null, 50, 50, 49 (finally below threshold)
      getQueueMessageCountStub.onCall(0).resolves(null)
      getQueueMessageCountStub.onCall(1).resolves(50)
      getQueueMessageCountStub.onCall(2).resolves(50)
      getQueueMessageCountStub.onCall(3).resolves(49)
      sendMessageStub.resolves()

      await RabbitMQHelper.sendMessageWithThrottle(queueName, payload)

      expect(getQueueMessageCountStub.callCount).to.equal(4)
      expect(sendMessageStub.calledOnceWith(queueName, payload)).to.be.true
      expect(utilsWaitStub.calledThrice).to.be.true // 3 waits for the 3 retry scenarios
      expect(loggerErrorStub.calledOnce).to.be.true // One error for null
      expect(loggerWarnStub.calledTwice).to.be.true // Two warnings for queue at capacity
    })
  })
})
