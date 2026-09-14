import config from '@config'
import RabbitMQHelper from '@helpers/rabbitMQ'
import utils from '@helpers/utils'
import logger from '@logger'
import RabbitMQ from '@modules/rabbitMQ'
import { EnumQueueName } from '@types'
import { ConfirmChannel } from 'amqplib'
import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'

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

    it('should clear the active job and requeue when retry is enabled', async () => {
      const queueName = EnumQueueName.telegramNotifications
      const fakeMsg: any = {
        content: Buffer.from(JSON.stringify({ id: 'retry-me' })),
        properties: {},
        fields: {} as any,
      }
      const fakeChannel: Partial<any> = {
        consume: sandbox.stub().callsFake((_queue, onMessage) => setImmediate(() => onMessage(fakeMsg))),
        ack: sandbox.stub(),
        nack: sandbox.stub(),
        prefetch: sandbox.stub().resolves(),
        assertQueue: sandbox.stub().resolves(),
      }
      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => setupFn(fakeChannel as ConfirmChannel)),
      }
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      const handler = sandbox.stub().rejects(new Error('temporary failure'))

      await RabbitMQHelper.process(queueName, handler, { requeueOnError: true, retryDelayMs: 0 })
      await utils.wait(20)

      expect(fakeChannel.nack.calledOnceWith(fakeMsg, false, true)).to.be.true
      expect(RabbitMQHelper.activeJobs.has(`${queueName}-retry-me`)).to.be.false
    })

    it('should schedule bounded retries through an exponentially delayed queue', async () => {
      const queueName = EnumQueueName.telegramNotifications
      const fakeMsg: any = {
        content: Buffer.from(JSON.stringify({ id: 'retry-with-backoff' })),
        properties: { headers: { 'x-aragon-retry-attempt': 1 } },
        fields: {} as any,
      }
      const fakeChannel: Partial<any> = {
        consume: sandbox.stub().callsFake((_queue, onMessage) => setImmediate(() => onMessage(fakeMsg))),
        ack: sandbox.stub(),
        nack: sandbox.stub(),
        prefetch: sandbox.stub().resolves(),
        assertQueue: sandbox.stub().resolves(),
      }
      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => setupFn(fakeChannel as ConfirmChannel)),
      }
      const fakeDelayChannel = { sendToQueue: sandbox.stub().resolves(true) }
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      const getDelayChannelStub = sandbox.stub(RabbitMQ, 'getDelayChannel').returns(fakeDelayChannel as any)
      const handler = sandbox.stub().rejects(new Error('temporary failure'))

      await RabbitMQHelper.process(queueName, handler, {
        retry: {
          maxAttempts: 5,
          baseDelayMs: 100,
          maxDelayMs: 1_000,
          deadLetterQueue: EnumQueueName.telegramNotificationsDeadLetter,
        },
      })
      await utils.wait(20)

      expect(getDelayChannelStub.calledOnceWith(queueName, 200)).to.be.true
      expect(
        fakeDelayChannel.sendToQueue.calledOnceWith(
          `${queueName}.wait.200`,
          { id: 'retry-with-backoff' },
          {
            persistent: true,
            contentType: 'application/json',
            headers: {
              'x-aragon-retry-attempt': 2,
              'x-aragon-retry-error': 'temporary failure',
            },
          },
        ),
      ).to.be.true
      expect(fakeChannel.ack.calledOnceWith(fakeMsg)).to.be.true
      expect(fakeChannel.nack.notCalled).to.be.true
    })

    it('should dead-letter a message after the configured retry limit', async () => {
      const queueName = EnumQueueName.telegramNotifications
      const fakeMsg: any = {
        content: Buffer.from(JSON.stringify({ id: 'exhausted-retry' })),
        properties: { headers: { 'x-aragon-retry-attempt': 4 } },
        fields: {} as any,
      }
      const fakeChannel: Partial<any> = {
        consume: sandbox.stub().callsFake((_queue, onMessage) => setImmediate(() => onMessage(fakeMsg))),
        ack: sandbox.stub(),
        nack: sandbox.stub(),
        prefetch: sandbox.stub().resolves(),
        assertQueue: sandbox.stub().resolves(),
      }
      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => setupFn(fakeChannel as ConfirmChannel)),
        sendToQueue: sandbox.stub().resolves(true),
      }
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      const getDelayChannelStub = sandbox.stub(RabbitMQ, 'getDelayChannel')
      const handler = sandbox.stub().rejects(new Error('still unavailable'))

      await RabbitMQHelper.process(queueName, handler, {
        retry: {
          maxAttempts: 5,
          baseDelayMs: 100,
          maxDelayMs: 1_000,
          deadLetterQueue: EnumQueueName.telegramNotificationsDeadLetter,
        },
      })
      await utils.wait(20)

      expect(getDelayChannelStub.notCalled).to.be.true
      expect(
        fakeChannelWrapper.sendToQueue.calledOnceWith(
          EnumQueueName.telegramNotificationsDeadLetter,
          { id: 'exhausted-retry' },
          {
            persistent: true,
            contentType: 'application/json',
            headers: {
              'x-aragon-retry-attempt': 5,
              'x-aragon-retry-error': 'still unavailable',
            },
          },
        ),
      ).to.be.true
      expect(fakeChannel.ack.calledOnceWith(fakeMsg)).to.be.true
      expect(fakeChannel.nack.notCalled).to.be.true
      expect(loggerErrorStub.calledWith('Message exhausted retry attempts and was moved to the dead-letter queue')).to
        .be.true
    })

    it('should nack for redelivery when scheduling the retry itself fails', async () => {
      const queueName = EnumQueueName.telegramNotifications
      const fakeMsg: any = {
        content: Buffer.from(JSON.stringify({ id: 'retry-schedule-broken' })),
        properties: { headers: {} },
        fields: {} as any,
      }
      const fakeChannel: Partial<any> = {
        consume: sandbox.stub().callsFake((_queue, onMessage) => setImmediate(() => onMessage(fakeMsg))),
        ack: sandbox.stub(),
        nack: sandbox.stub(),
        prefetch: sandbox.stub().resolves(),
        assertQueue: sandbox.stub().resolves(),
      }
      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => setupFn(fakeChannel as ConfirmChannel)),
      }
      const fakeDelayChannel = { sendToQueue: sandbox.stub().rejects(new Error('delay channel down')) }
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      sandbox.stub(RabbitMQ, 'getDelayChannel').returns(fakeDelayChannel as any)
      const handler = sandbox.stub().rejects(new Error('temporary failure'))

      await RabbitMQHelper.process(queueName, handler, {
        retry: {
          maxAttempts: 5,
          baseDelayMs: 100,
          maxDelayMs: 1_000,
          deadLetterQueue: EnumQueueName.telegramNotificationsDeadLetter,
        },
      })
      await utils.wait(20)

      expect(loggerErrorStub.calledWith('Failed to schedule retry or dead-letter message')).to.be.true
      expect(fakeChannel.nack.calledOnceWith(fakeMsg, false, true)).to.be.true
      expect(fakeChannel.ack.notCalled).to.be.true
      expect(RabbitMQHelper.activeJobs.has(`${queueName}-retry-schedule-broken`)).to.be.false
    })

    it('should only warn when the nack after a retry-scheduling failure also fails', async () => {
      const queueName = EnumQueueName.telegramNotifications
      const fakeMsg: any = {
        content: Buffer.from(JSON.stringify({ id: 'nack-broken' })),
        properties: { headers: {} },
        fields: {} as any,
      }
      const fakeChannel: Partial<any> = {
        consume: sandbox.stub().callsFake((_queue, onMessage) => setImmediate(() => onMessage(fakeMsg))),
        ack: sandbox.stub(),
        nack: sandbox.stub().throws(new Error('channel closed')),
        prefetch: sandbox.stub().resolves(),
        assertQueue: sandbox.stub().resolves(),
      }
      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => setupFn(fakeChannel as ConfirmChannel)),
      }
      const fakeDelayChannel = { sendToQueue: sandbox.stub().rejects(new Error('delay channel down')) }
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      sandbox.stub(RabbitMQ, 'getDelayChannel').returns(fakeDelayChannel as any)
      const handler = sandbox.stub().rejects(new Error('temporary failure'))

      await RabbitMQHelper.process(queueName, handler, {
        retry: {
          maxAttempts: 5,
          baseDelayMs: 100,
          maxDelayMs: 1_000,
          deadLetterQueue: EnumQueueName.telegramNotificationsDeadLetter,
        },
      })
      await utils.wait(20)

      expect(loggerWarnStub.calledWith('Failed to nack message after retry scheduling error')).to.be.true
    })

    it('should only warn when the requeue nack fails on a closed channel', async () => {
      const queueName = EnumQueueName.telegramNotifications
      const fakeMsg: any = {
        content: Buffer.from(JSON.stringify({ id: 'requeue-nack-broken' })),
        properties: {},
        fields: {} as any,
      }
      const fakeChannel: Partial<any> = {
        consume: sandbox.stub().callsFake((_queue, onMessage) => setImmediate(() => onMessage(fakeMsg))),
        ack: sandbox.stub(),
        nack: sandbox.stub().throws(new Error('channel closed')),
        prefetch: sandbox.stub().resolves(),
        assertQueue: sandbox.stub().resolves(),
      }
      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => setupFn(fakeChannel as ConfirmChannel)),
      }
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      const handler = sandbox.stub().rejects(new Error('boom'))

      await RabbitMQHelper.process(queueName, handler, { requeueOnError: true, retryDelayMs: 0 })
      await utils.wait(20)

      expect(loggerWarnStub.calledWith('Failed to nack message after handler error')).to.be.true
    })

    it('should reply to every replyTo message even when ids are duplicated', async () => {
      const queueName = EnumQueueName.contractInfo
      const makeMsg = (correlationId: string, replyTo: string): any => ({
        content: Buffer.from(JSON.stringify({ id: 'same-id', data: 'test' })),
        properties: { correlationId, replyTo },
        fields: {} as any,
      })

      let onMessage: any
      const fakeChannel: Partial<any> = {
        consume: sandbox.stub().callsFake((_queue, callback) => {
          onMessage = callback
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
      const handler = sandbox.stub().callsFake(async () => {
        await utils.wait(50)
        return { ok: true }
      })

      await RabbitMQHelper.process(queueName, handler)
      // second message arrives while the first is still being handled
      await Promise.all([onMessage(makeMsg('corr-A', 'reply-A')), onMessage(makeMsg('corr-B', 'reply-B'))])

      const replies = fakeChannelWrapper.sendToQueue.getCalls().map((call: any) => call.args[2].correlationId)
      expect(replies).to.have.members(['corr-A', 'corr-B'])
      expect(handler.calledTwice).to.be.true
      expect(fakeChannel.ack.callCount).to.equal(2)
    })

    it('should answer and acknowledge a replyTo message whose handler throws', async () => {
      const queueName = EnumQueueName.contractInfo
      const fakeMsg: any = {
        content: Buffer.from(JSON.stringify({ id: 'reply-handler-fails' })),
        properties: { correlationId: 'corr-fail', replyTo: 'reply-fail' },
        fields: {} as any,
      }

      let onMessage: any
      const fakeChannel: Partial<any> = {
        consume: sandbox.stub().callsFake((_queue, callback) => {
          onMessage = callback
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

      await RabbitMQHelper.process(queueName, sandbox.stub().rejects(new Error('Handler failed')))
      await onMessage(fakeMsg)

      const reply = fakeChannelWrapper.sendToQueue.firstCall
      expect(reply.args[1].toString()).to.equal('null')
      expect(reply.args[2].correlationId).to.equal('corr-fail')
      // Without the ack the message keeps its prefetch slot for the life of the connection.
      expect(fakeChannel.ack.calledOnceWith(fakeMsg)).to.be.true
      expect(loggerErrorStub.calledWith('Error in messageHandler')).to.be.true
    })

    it('should only warn when the ack of a replied message fails', async () => {
      const queueName = EnumQueueName.contractInfo
      const fakeMsg: any = {
        content: Buffer.from(JSON.stringify({ id: 'reply-ack-fails' })),
        properties: { correlationId: 'corr-ack-fails', replyTo: 'reply-ack' },
        fields: {} as any,
      }

      let onMessage: any
      const fakeChannel: Partial<any> = {
        consume: sandbox.stub().callsFake((_queue, callback) => {
          onMessage = callback
        }),
        ack: sandbox.stub().throws(new Error('Channel is closed')),
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

      await RabbitMQHelper.process(queueName, sandbox.stub().resolves({ ok: true }))
      await onMessage(fakeMsg)

      expect(fakeChannelWrapper.sendToQueue.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Failed to ack replied message')).to.be.true
    })

    it('should acknowledge a replyTo message even when the reply cannot be sent', async () => {
      const queueName = EnumQueueName.contractInfo
      const fakeMsg: any = {
        content: Buffer.from(JSON.stringify({ id: 'reply-send-fails' })),
        properties: { correlationId: 'corr-no-reply', replyTo: 'reply-gone' },
        fields: {} as any,
      }

      let onMessage: any
      const fakeChannel: Partial<any> = {
        consume: sandbox.stub().callsFake((_queue, callback) => {
          onMessage = callback
        }),
        ack: sandbox.stub(),
        prefetch: sandbox.stub().returns(Promise.resolve()),
        assertQueue: sandbox.stub().resolves(),
      }

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn(fakeChannel as ConfirmChannel)
        }),
        sendToQueue: sandbox.stub().rejects(new Error('Reply queue is gone')),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      await RabbitMQHelper.process(queueName, sandbox.stub().resolves({ ok: true }))
      await onMessage(fakeMsg)

      expect(fakeChannel.ack.calledOnceWith(fakeMsg)).to.be.true
      expect(loggerErrorStub.calledWith('Failed to reply to message')).to.be.true
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
      expect(loggerErrorStub.calledWithMatch('Error sendMessage with response')).to.be.true
    })

    it('should handle timeout in _sendMessageWithResponse', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'timeout-msg' }

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn({
            assertQueue: sandbox.stub().resolves({ queue: 'temp-queue' }),
            consume: sandbox.stub().callsFake((_queue, _onMessage) => {
              // Don't call onMessage, so it times out
              return { consumerTag: 'tag-123' }
            }),
          })
        }),
        sendToQueue: sandbox.stub().resolves(true),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const result = await RabbitMQHelper.sendMessage(queueName, payload, {
        waitResponse: true,
        timeout: 10, // Very short timeout
      })

      // Add a small delay to ensure timeout has had a chance to fire
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(result).to.be.null
      expect(loggerWarnStub.calledWithMatch('Timeout waiting for response')).to.be.true
      expect(fakeChannelWrapper.sendToQueue.calledOnce).to.be.true
      expect(loggerErrorStub.called).to.be.false
      expect(RabbitMQHelper.pendingReplies.size).to.equal(0)
    })

    it('should give up on a reply consumer that never finishes attaching', async () => {
      sandbox.stub(config.RABBITMQ, 'TIMEOUT').value(10)
      const fakeChannelWrapper = {
        addSetup: sandbox.stub().returns(new Promise(() => undefined)),
        removeSetup: sandbox.stub().returns(new Promise(() => undefined)),
        sendToQueue: sandbox.stub().resolves(true),
      }
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const started = Date.now()
      const result = await RabbitMQHelper.sendMessage(
        EnumQueueName.contractInfo,
        { id: 'stalled-setup' },
        { waitResponse: true, timeout: 10 },
      )

      expect(result).to.be.null
      expect(Date.now() - started).to.be.lessThan(1000)
      expect(fakeChannelWrapper.sendToQueue.called).to.be.false
      expect(loggerErrorStub.calledWithMatch('_sendMessageWithResponse error')).to.be.true
      expect(RabbitMQHelper.replyConsumers.has(fakeChannelWrapper)).to.be.false
      expect(fakeChannelWrapper.removeSetup.calledOnceWith(fakeChannelWrapper.addSetup.firstCall.args[0])).to.be.true
    })

    it('should retry setup and cancel the abandoned consumer before attaching its replacement', async () => {
      const clock = sandbox.useFakeTimers()
      sandbox.stub(config.RABBITMQ, 'TIMEOUT').value(20)
      let finishConsume!: (value: { consumerTag: string }) => void
      const channel = { consume: sandbox.stub(), cancel: sandbox.stub().resolves() }
      channel.consume.onFirstCall().returns(
        new Promise(resolve => {
          finishConsume = resolve
        }),
      )
      channel.consume.onSecondCall().resolves({ consumerTag: 'replacement' })
      const wrapper = {
        addSetup: sandbox.stub().callsFake(setup => setup(channel)),
        removeSetup: sandbox.stub().resolves(),
        sendToQueue: sandbox.stub().resolves(false),
      }
      sandbox.stub(RabbitMQ, 'getChannel').returns(wrapper as any)
      const first = RabbitMQHelper.sendMessage(
        EnumQueueName.contractInfo,
        { id: 'first' },
        { waitResponse: true, timeout: 20 },
      )
      await clock.tickAsync(20)
      expect(await first).to.be.null
      const tag = channel.consume.firstCall.args[2].consumerTag
      expect(channel.cancel.calledOnceWith(tag)).to.be.true
      expect(RabbitMQHelper.replyConsumers.has(wrapper)).to.be.false

      await RabbitMQHelper.sendMessage(
        EnumQueueName.contractInfo,
        { id: 'second' },
        { waitResponse: true, timeout: 20 },
      )
      const replacement = RabbitMQHelper.replyConsumers.get(wrapper)
      expect(wrapper.addSetup.calledTwice).to.be.true
      expect(channel.cancel.firstCall.calledBefore(channel.consume.secondCall)).to.be.true
      finishConsume({ consumerTag: tag })
      await clock.tickAsync(0)
      expect(RabbitMQHelper.replyConsumers.get(wrapper)).to.equal(replacement)
      expect(wrapper.removeSetup.alwaysCalledWith(wrapper.addSetup.firstCall.args[0])).to.be.true
    })

    it('should skip and remove an abandoned setup registered after its deadline', async () => {
      const clock = sandbox.useFakeTimers()
      sandbox.stub(config.RABBITMQ, 'TIMEOUT').value(20)
      let reconnect!: () => void
      const waiting = new Promise<void>(resolve => {
        reconnect = resolve
      })
      const channel = { consume: sandbox.stub().resolves({ consumerTag: 'late' }) }
      const setups = new Set<unknown>()
      const wrapper = {
        addSetup: sandbox.stub().callsFake(async setup => {
          await waiting
          setups.add(setup)
          await setup(channel)
        }),
        removeSetup: sandbox.stub().callsFake(async setup => {
          setups.delete(setup)
        }),
        sendToQueue: sandbox.stub().resolves(true),
      }
      sandbox.stub(RabbitMQ, 'getChannel').returns(wrapper as any)
      const result = RabbitMQHelper.sendMessage(
        EnumQueueName.contractInfo,
        { id: 'late' },
        { waitResponse: true, timeout: 20 },
      )
      await clock.tickAsync(20)
      expect(await result).to.be.null
      reconnect()
      await clock.tickAsync(0)
      expect(channel.consume.called).to.be.false
      expect(setups.size).to.equal(0)
      expect(RabbitMQHelper.replyConsumers.has(wrapper)).to.be.false
    })

    it('should keep shared setup available when only a shorter caller times out', async () => {
      const clock = sandbox.useFakeTimers()
      sandbox.stub(config.RABBITMQ, 'TIMEOUT').value(100)
      let finishSetup!: () => void
      const wrapper = {
        addSetup: sandbox.stub().returns(
          new Promise<void>(resolve => {
            finishSetup = resolve
          }),
        ),
        removeSetup: sandbox.stub().resolves(),
        sendToQueue: sandbox.stub().callsFake((_queue, _payload, options) => {
          RabbitMQHelper.pendingReplies.get(options.correlationId)!({ ok: true })
          return Promise.resolve(true)
        }),
      }
      sandbox.stub(RabbitMQ, 'getChannel').returns(wrapper as any)
      const short = RabbitMQHelper.sendMessage(
        EnumQueueName.contractInfo,
        { id: 'short' },
        { waitResponse: true, timeout: 10 },
      )
      const long = RabbitMQHelper.sendMessage(
        EnumQueueName.contractInfo,
        { id: 'long' },
        { waitResponse: true, timeout: 80 },
      )
      await clock.tickAsync(10)
      expect(await short).to.be.null
      expect(wrapper.removeSetup.called).to.be.false
      finishSetup()
      expect(await long).to.deep.equal({ ok: true })
      expect(wrapper.addSetup.calledOnce).to.be.true
      expect(clock.countTimers()).to.equal(0)
    })

    it('should bound the publish itself, so a request the caller gave up on is not sent later', async () => {
      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn({ consume: sandbox.stub().resolves({ consumerTag: 'tag-1' }) })
        }),
        sendToQueue: sandbox.stub().resolves(true),
      }
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      await RabbitMQHelper.sendMessage(
        EnumQueueName.contractInfo,
        { id: 'bounded-publish' },
        { waitResponse: true, timeout: 30 },
      )

      const publishOpts = fakeChannelWrapper.sendToQueue.firstCall.args[2]
      expect(publishOpts.timeout).to.be.greaterThan(0)
      expect(publishOpts.timeout).to.be.at.most(30)
    })

    it('should handle active jobs that are already being processed', async () => {
      const queueName = EnumQueueName.contractInfo
      const fakeMsg: any = {
        content: Buffer.from(JSON.stringify({ id: 'duplicate-job', data: 'test' })),
        properties: {},
        fields: {} as any,
      }

      // Pre-set the active job
      RabbitMQHelper.activeJobs.set(`${queueName}-duplicate-job`, true)

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
      const handler = sandbox.stub()

      await RabbitMQHelper.process(queueName, handler)
      await utils.wait(20)

      // The message should be acknowledged without processing
      expect(fakeChannel.ack.calledOnce).to.be.true
      expect(handler.called).to.be.false
    })

    it('should handle failed sendToQueue in _sendMessageWithResponse', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'failed-send-msg' }

      const fakeChannel: any = {
        consume: sandbox.stub().resolves({ consumerTag: 'reply-consumer' }),
      }

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn(fakeChannel)
        }),
        removeSetup: sandbox.stub().resolves(),
        sendToQueue: sandbox.stub().resolves(false), // sendToQueue returns false
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const result = await RabbitMQHelper.sendMessage(queueName, payload, {
        waitResponse: true,
        timeout: 5000,
      })

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('Failed to send message to queue')).to.be.true
    })

    for (const failure of ['rejects', 'throws'] as const) {
      it(`should clean up immediately when the publish ${failure}`, async () => {
        const clock = sandbox.useFakeTimers()
        const queueName = EnumQueueName.contractInfo
        const payload = { id: 'publish-rejects' }

        const fakeChannel: any = {
          consume: sandbox.stub().resolves({ consumerTag: 'reply-consumer' }),
        }

        const fakeChannelWrapper = {
          addSetup: sandbox.stub().callsFake(async setupFn => {
            await setupFn(fakeChannel)
          }),
          removeSetup: sandbox.stub().resolves(),
          sendToQueue: sandbox.stub()[failure](new Error('Publish failed')),
        }

        sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

        const result = await RabbitMQHelper.sendMessage(queueName, payload, {
          waitResponse: true,
          timeout: 5000,
        })

        expect(result).to.be.null
        expect(loggerErrorStub.calledWith('Failed to send message to queue')).to.be.true
        expect(RabbitMQHelper.pendingReplies.size).to.equal(0)
        expect(clock.countTimers()).to.equal(0)
        await clock.tickAsync(5000)
        expect(loggerWarnStub.called).to.be.false
      })
    }

    it('should attach one reply consumer no matter how many calls the channel serves', async () => {
      const queueName = EnumQueueName.contractInfo

      const fakeChannel: any = {
        consume: sandbox.stub().resolves({ consumerTag: 'reply-consumer' }),
      }

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn(fakeChannel)
        }),
        removeSetup: sandbox.stub().resolves(),
        sendToQueue: sandbox.stub().resolves(false),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      await Promise.all(
        ['one', 'two', 'three'].map(id =>
          RabbitMQHelper.sendMessage(queueName, { id }, { waitResponse: true, timeout: 5000 }),
        ),
      )

      expect(fakeChannelWrapper.addSetup.callCount).to.equal(1)
      expect(fakeChannel.consume.callCount).to.equal(1)
      expect(fakeChannel.consume.firstCall.args[0]).to.equal('amq.rabbitmq.reply-to')
      expect(fakeChannel.consume.firstCall.args[2]).to.include({ noAck: true })
      expect(RabbitMQHelper.pendingReplies.size).to.equal(0)
    })

    it('should handle response with matching correlationId', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'response-msg' }
      const responseData = { result: 'success' }

      let consumeCallback: any
      let correlationId: string

      const fakeChannel: any = {
        consume: sandbox.stub().callsFake((_queue, callback) => {
          consumeCallback = callback
          return Promise.resolve({ consumerTag: 'reply-consumer' })
        }),
      }

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn(fakeChannel)
        }),
        removeSetup: sandbox.stub().resolves(),
        sendToQueue: sandbox.stub().callsFake((_q, _p, opts) => {
          correlationId = opts.correlationId
          // Simulate receiving a response after sending
          setImmediate(() => {
            if (consumeCallback && correlationId) {
              const responseMsg: any = {
                content: Buffer.from(JSON.stringify(responseData)),
                properties: { correlationId },
              }
              consumeCallback(responseMsg)
            }
          })
          return Promise.resolve(true)
        }),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const result = await RabbitMQHelper.sendMessage(queueName, payload, {
        waitResponse: true,
        timeout: 5000,
      })

      await utils.wait(50) // Wait a bit for the async operations to complete

      expect(result).to.deep.equal(responseData)
      expect(RabbitMQHelper.pendingReplies.has(correlationId!)).to.be.false
    })

    it('should handle _sendMessageWithResponse exception', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'exception-msg' }

      // Create a channel wrapper that throws an error in addSetup
      const fakeChannelWrapper = {
        addSetup: sandbox.stub().rejects(new Error('Setup failed')),
        removeSetup: sandbox.stub().resolves(),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const result = await RabbitMQHelper.sendMessage(queueName, payload, {
        waitResponse: true,
        timeout: 5000,
      })

      expect(result).to.be.null
      expect(loggerErrorStub.calledWithMatch('_sendMessageWithResponse error')).to.be.true
    })

    it('should handle catch block in _sendMessageWithResponse', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'catch-block-msg' }
      const uniqueKey = `${queueName}-${payload.id}`

      // Mock the channelWrapper to throw an exception during setup
      const fakeChannelWrapper = {
        addSetup: sandbox.stub().rejects(new Error('Unexpected error in addSetup')),
        removeSetup: sandbox.stub().resolves(),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      // Call _sendMessageWithResponse directly to test the catch block
      const result = await RabbitMQHelper._sendMessageWithResponse(fakeChannelWrapper, queueName, payload, uniqueKey, {
        waitResponse: true,
        timeout: 5000,
      })

      expect(result).to.be.null
      expect(loggerErrorStub.calledWith('_sendMessageWithResponse error')).to.be.true
    })

    it('should ignore a reply for another caller and leave nothing waiting after a timeout', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'foreign-reply-msg' }

      let consumeCallback: any

      const fakeChannel: any = {
        consume: sandbox.stub().callsFake((_queue, callback) => {
          consumeCallback = callback
          return Promise.resolve({ consumerTag: 'reply-consumer' })
        }),
      }

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn(fakeChannel)
        }),
        removeSetup: sandbox.stub().resolves(),
        sendToQueue: sandbox.stub().callsFake(() => {
          setImmediate(() => {
            consumeCallback({
              content: Buffer.from(JSON.stringify({ result: 'for someone else' })),
              properties: { correlationId: 'a-correlation-id-nobody-is-waiting-on' },
            })
          })
          return Promise.resolve(true)
        }),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const result = await RabbitMQHelper.sendMessage(queueName, payload, {
        waitResponse: true,
        timeout: 50,
      })

      expect(result).to.be.null
      expect(loggerWarnStub.calledWith('Timeout waiting for response')).to.be.true
      expect(RabbitMQHelper.pendingReplies.size).to.equal(0)
    })
  })

  describe('sendDelayedMessage', () => {
    it('should publish the payload to the per-delay wait queue', async () => {
      const queueName = EnumQueueName.executionActions
      const payload = { id: 'delayed-1', params: { id: 'delayed-1' } }
      const delayMs = 2000

      const fakeChannelWrapper = {
        sendToQueue: sandbox.stub().resolves(true),
      }
      const getDelayChannelStub = sandbox.stub(RabbitMQ, 'getDelayChannel').returns(fakeChannelWrapper as any)

      await RabbitMQHelper.sendDelayedMessage(queueName, payload, delayMs)

      expect(getDelayChannelStub.calledOnceWith(queueName, delayMs)).to.be.true
      expect(
        fakeChannelWrapper.sendToQueue.calledOnceWith(`${queueName}.wait.${delayMs}`, payload, {
          persistent: true,
          contentType: 'application/json',
        }),
      ).to.be.true
    })

    it('should handle publish errors gracefully', async () => {
      const queueName = EnumQueueName.executionActions

      sandbox.stub(RabbitMQ, 'getDelayChannel').throws(new Error('not connected'))

      await RabbitMQHelper.sendDelayedMessage(queueName, { id: 'delayed-2' }, 2000)

      expect(loggerErrorStub.calledWith('Error sendDelayedMessage')).to.be.true
    })
  })

  describe('getQueueMessageCount', () => {
    it('should return the correct message count', async () => {
      const queueName = EnumQueueName.contractInfo
      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn({ checkQueue: sandbox.stub().resolves({ messageCount: 3 }) })
        }),
        removeSetup: sandbox.stub().resolves(),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      const count = await RabbitMQHelper.getQueueMessageCount(queueName)

      expect(count).to.equal(3)
      // The read is polled in a loop, so its setup must not stay on the channel's replay list.
      expect(fakeChannelWrapper.removeSetup.calledOnceWith(fakeChannelWrapper.addSetup.firstCall.args[0])).to.be.true
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
