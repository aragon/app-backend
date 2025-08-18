import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'
import RabbitMQHelper from '@helpers/rabbitMQ'
import RabbitMQ from '@modules/rabbitMQ'
import { EnumQueueName } from '@types'
import utils from '@helpers/utils'
import { ConfirmChannel } from 'amqplib'
import logger from '@logger'

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
      const stubLoggerWarn = sandbox.stub(logger, 'warn')

      // Send the same message twice (in parallel) to simulate duplicates.
      await Promise.all([
        RabbitMQHelper.sendMessage(queueName, payload),
        RabbitMQHelper.sendMessage(queueName, payload),
      ])

      // Only the first message should actually be queued
      expect(fakeChannelWrapper.sendToQueue.calledOnce).to.be.true

      // The code logs a warning when skipping a duplicate
      expect(stubLoggerWarn.calledOnceWith('Skipping duplicate message' as any)).to.be.true

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
})
