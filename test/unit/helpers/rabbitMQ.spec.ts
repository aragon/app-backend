import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'
import RabbitMQHelper from '@helpers/rabbitMQ'
import RabbitMQ from '@modules/rabbitMQ'
import { EnumQueueName } from '@types'
import utils from '@helpers/utils'
import { ConfirmChannel } from 'amqplib'
import logger from '@logger'

describe.only('Helpers:RabbitMQ', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
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
  })
})
