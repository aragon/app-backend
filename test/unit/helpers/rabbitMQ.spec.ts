import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'
import RabbitMQHelper from '@helpers/rabbitMQ'
import RabbitMQ from '@modules/rabbitMQ'
import { EnumQueueName } from '@types'
import proxyquire from 'proxyquire'
import logger from '@logger'

describe('Helpers:RabbitMQ', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
    RabbitMQHelper.queuedMessages.clear()
  })

  describe('queuedMessages', () => {
    it('should return false for a key not added yet', async () => {
      const key = 'test-key'
      const duplicate = await RabbitMQHelper.isMessageDuplicate(key)
      expect(duplicate).to.be.false
    })

    it('should mark a message as queued and detect it as duplicate', async () => {
      const key = 'test-key'
      await RabbitMQHelper.addMessageToQueue(key)
      const duplicateAfter = await RabbitMQHelper.isMessageDuplicate(key)
      expect(duplicateAfter).to.be.true
    })

    it('should remove a key from the queued messages', async () => {
      const key = 'test-key'
      await RabbitMQHelper.addMessageToQueue(key)
      expect(await RabbitMQHelper.isMessageDuplicate(key)).to.be.true

      await RabbitMQHelper.clearMessageFromQueue(key)
      expect(await RabbitMQHelper.isMessageDuplicate(key)).to.be.false
    })

    it('should ensure thread safety when modifying queued messages', async () => {
      const key = 'test-concurrent-key'
      const addPromise = RabbitMQHelper.addMessageToQueue(key)
      const checkPromise = RabbitMQHelper.isMessageDuplicate(key)
      await Promise.all([addPromise, checkPromise])
      expect(await RabbitMQHelper.isMessageDuplicate(key)).to.be.true

      const clearPromise = RabbitMQHelper.clearMessageFromQueue(key)
      await clearPromise
      expect(await RabbitMQHelper.isMessageDuplicate(key)).to.be.false
    })
  })

  describe('executeWithMutex', () => {
    it('should execute the callback and return its value', async () => {
      const result = await RabbitMQHelper.executeWithMutex(() => Promise.resolve(42))
      expect(result).to.equal(42)
    })

    it('should not allow concurrent execution', async () => {
      let inProgress = 0
      let maxInProgress = 0

      // Create several tasks that run concurrently using executeWithMutex.
      const tasks = [1, 2, 3].map(() =>
        RabbitMQHelper.executeWithMutex(async () => {
          inProgress++
          if (inProgress > maxInProgress) {
            maxInProgress = inProgress
          }
          await new Promise(resolve => setTimeout(resolve, 50))
          inProgress--
          return true
        }),
      )

      await Promise.all(tasks)
      expect(maxInProgress).to.equal(1)
    })
  })

  describe('process', () => {
    it('should consume a message and process successfully', async () => {
      const queueName = EnumQueueName.contractInfo
      const stubLoggerWarn = sandbox.stub(logger, 'warn')
      const stubLoggerError = sandbox.stub(logger, 'error')

      const fakeContent = Buffer.from(JSON.stringify({ test: 'data' }))
      const fakeMsg = {
        content: fakeContent,
        properties: {
          replyTo: 'fake-reply-queue',
          correlationId: '1234',
        },
      }

      const fakeChannel = {
        consume: sandbox.stub().callsFake(async (_queue, onMessage) => {
          setImmediate(() => onMessage(fakeMsg))
          return { consumerTag: 'fake-consumer-tag' }
        }),
        ack: sandbox.stub(),
        nack: sandbox.stub(),
      }

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn(fakeChannel)
        }),
        sendToQueue: sandbox.stub().resolves(true),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      const handler = sandbox.stub().resolves({ response: 'ok' })

      await RabbitMQHelper.process(queueName, handler)
      await new Promise(resolve => setTimeout(resolve, 20))

      expect(handler.calledOnce).to.be.true
      expect(handler.firstCall.args[0]).to.deep.equal({ test: 'data' })
      expect(fakeChannelWrapper.sendToQueue.calledOnce).to.be.true

      const publishOpts = fakeChannelWrapper.sendToQueue.firstCall.args[2]
      expect(publishOpts.correlationId).to.equal('1234')
      expect(publishOpts.contentType).to.equal('application/json')
      expect(fakeChannel.ack.calledOnce).to.be.true

      // Ensure no warnings or errors
      expect(stubLoggerWarn.notCalled).to.be.true
      expect(stubLoggerError.notCalled).to.be.true
    })

    it('should nack the message when handler throws an error', async () => {
      const queueName = EnumQueueName.contractInfo
      const stubLoggerError = sandbox.stub(logger, 'error')

      const fakeMsg = {
        content: Buffer.from(JSON.stringify({ test: 'data' })),
        properties: {},
      }

      const fakeChannel = {
        consume: sandbox.stub().callsFake(async (_queue, onMessage) => {
          setImmediate(() => onMessage(fakeMsg))
        }),
        ack: sandbox.stub(),
        nack: sandbox.stub(),
      }

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn(fakeChannel)
        }),
      }
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      const handler = sandbox.stub().throws(new Error('Handler error'))

      await RabbitMQHelper.process(queueName, handler)
      await new Promise(resolve => setTimeout(resolve, 20))

      expect(fakeChannel.nack.calledOnce).to.be.true
      expect(stubLoggerError.calledOnceWith('Error in messageHandler' as any)).to.be.true
    })

    it('should log a warning if no message is received', async () => {
      const queueName = EnumQueueName.contractInfo
      const stubLoggerWarn = sandbox.stub(logger, 'warn')

      const fakeChannel = {
        consume: sandbox.stub().callsFake(async (_queue, onMessage) => {
          setImmediate(() => onMessage(null))
        }),
        ack: sandbox.stub(),
      }

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn(fakeChannel)
        }),
      }
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      const handler = sandbox.stub().resolves({ response: 'ok' })

      await RabbitMQHelper.process(queueName, handler)
      await new Promise(resolve => setTimeout(resolve, 20))

      expect(fakeChannel.ack.called).to.be.false
      expect(stubLoggerWarn.calledOnceWith('No message to consume' as any)).to.be.true
    })

    it('should log an error if JSON parsing fails', async () => {
      const queueName = EnumQueueName.contractInfo
      const stubLoggerError = sandbox.stub(logger, 'error')

      const fakeMsg = {
        content: Buffer.from('invalid-json'),
        properties: {},
      }

      const fakeChannel = {
        consume: sandbox.stub().callsFake(async (_queue, onMessage) => {
          setImmediate(() => onMessage(fakeMsg))
        }),
        ack: sandbox.stub(),
      }

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn(fakeChannel)
        }),
      }
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      const handler = sandbox.stub().resolves({ response: 'ok' })

      await RabbitMQHelper.process(queueName, handler)
      await new Promise(resolve => setTimeout(resolve, 20))

      expect(stubLoggerError.calledOnceWith('Failed to parse Buffer as JSON' as any)).to.be.true
    })

    it('should log a warning if ack fails', async () => {
      const queueName = EnumQueueName.contractInfo
      const stubLoggerWarn = sandbox.stub(logger, 'warn')

      const fakeMsg = {
        content: Buffer.from(JSON.stringify({ test: 'data' })),
        properties: {},
      }

      const fakeChannel = {
        consume: sandbox.stub().callsFake(async (_queue, onMessage) => {
          setImmediate(() => onMessage(fakeMsg))
        }),
        ack: sandbox.stub().throws(new Error('Ack error')),
      }

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn(fakeChannel)
        }),
      }
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      const handler = sandbox.stub().resolves({ response: 'ok' })

      await RabbitMQHelper.process(queueName, handler)
      await new Promise(resolve => setTimeout(resolve, 20))

      expect(stubLoggerWarn.calledOnceWith('Failed to ack message—channel may be closed' as any)).to.be.true
    })

    it('should log an error if the process function itself throws an error', async () => {
      const queueName = EnumQueueName.contractInfo
      const stubLoggerError = sandbox.stub(logger, 'error')

      sandbox.stub(RabbitMQ, 'getChannel').throws(new Error('Critical error'))

      await RabbitMQHelper.process(queueName, sandbox.stub().resolves())

      expect(stubLoggerError.calledOnceWith('rabbit process error' as any)).to.be.true
    })
  })

  describe('sendMessage', () => {
    it('should publish message in fire-and-forget mode and clear duplicate marker', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'test-1', params: { network: 'eth', address: '0x123' } }
      const uniqueKey = `${queueName}-${payload.id}`

      const fakeChannelWrapper = {
        sendToQueue: sandbox.stub().resolves(true),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const result = await RabbitMQHelper.sendMessage(queueName, payload, { waitResponse: false })
      expect(result).to.be.null
      expect(fakeChannelWrapper.sendToQueue.calledOnce).to.be.true

      const sendArgs = fakeChannelWrapper.sendToQueue.firstCall.args
      expect(sendArgs[0]).to.equal(queueName)
      expect(sendArgs[1]).to.deep.equal(payload)
      expect(sendArgs[2]).to.include({ persistent: true, contentType: 'application/json' })

      const duplicate = await RabbitMQHelper.isMessageDuplicate(uniqueKey)
      expect(duplicate).to.be.false
    })

    it('should not send a duplicate message and log a warning', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'test-duplicate' }
      const stubLoggerWarn = sandbox.stub(logger, 'warn')

      await RabbitMQHelper.addMessageToQueue(`${queueName}-${payload.id}`)

      const result = await RabbitMQHelper.sendMessage(queueName, payload, { waitResponse: false })
      expect(result).to.be.null

      expect(stubLoggerWarn.calledOnceWith('Duplicate message detected' as any)).to.be.true
    })

    it('should send a message with waitResponse set to true', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'test-response-wait' }

      sandbox.stub(RabbitMQ, 'getChannel').returns('channel1' as any)
      sandbox.stub(RabbitMQHelper, '_sendMessageWithResponse').resolves({ response: 'ok' })

      const response = await RabbitMQHelper.sendMessage(queueName, payload, { waitResponse: true })
      expect(response).to.deep.equal({ response: 'ok' })
    })

    it('should handle errors in sendMessage gracefully and log an error', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'test-error' }
      const stubLoggerError = sandbox.stub(logger, 'error')

      const fakeChannelWrapper = {
        sendToQueue: sandbox.stub().throws(new Error('Simulated error')),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const result = await RabbitMQHelper.sendMessage(queueName, payload, { waitResponse: false })
      expect(result).to.be.null

      expect(stubLoggerError.calledOnceWith('sendMessage error' as any)).to.be.true
    })

    it('should always clear message from queue in finally block', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'test-finally' }
      const uniqueKey = `${queueName}-${payload.id}`

      const stubClearMsg = sandbox.stub(RabbitMQHelper, 'clearMessageFromQueue').resolves()
      const fakeChannelWrapper = {
        sendToQueue: sandbox.stub().throws(new Error('Simulated failure')),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)
      await RabbitMQHelper.sendMessage(queueName, payload, { waitResponse: false })

      expect(stubClearMsg.calledOnceWith(uniqueKey)).to.be.true
    })

    it('should log an error if _sendMessageWithResponse fails', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'test-send-fail' }
      const stubLoggerError = sandbox.stub(logger, 'error')

      sandbox.stub(RabbitMQHelper, '_sendMessageWithResponse').throws(new Error('Response failure'))
      sandbox.stub(RabbitMQ, 'getChannel').returns({ sendToQueue: sandbox.stub().resolves(true) } as any)

      const response = await RabbitMQHelper.sendMessage(queueName, payload, { waitResponse: true })
      expect(response).to.be.null

      expect(stubLoggerError.calledOnceWith('sendMessage error' as any)).to.be.true
    })
  })

  describe('_sendMessageWithResponse', () => {
    it('should send a message and receive a response', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'test-response', data: 'test' }
      const stubLoggerError = sandbox.stub(logger, 'error')
      const stubLoggerWarn = sandbox.stub(logger, 'warn')

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn({
            assertQueue: sandbox.stub().resolves({ queue: 'replyQueue' }),
            consume: sandbox.stub().callsFake(async (_queue, onMessage) => {
              setTimeout(
                () =>
                  onMessage({
                    properties: { correlationId: 'uuid-test' },
                    content: Buffer.from(JSON.stringify({ response: 'ok' })),
                  }),
                50,
              )
            }),
            ack: sandbox.stub().returns(true),
            sendToQueue: sandbox.stub().resolves(true),
            cancel: sandbox.stub().resolves(),
          })
        }),
      }

      const { default: RabbitMQHelperProxy } = proxyquire.noCallThru()('@helpers/rabbitMQ', {
        uuid: { v4: () => 'uuid-test' },
      })
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const response = await RabbitMQHelperProxy._sendMessageWithResponse(
        fakeChannelWrapper,
        queueName,
        payload,
        'unique-key',
        { waitResponse: true },
      )
      expect(response).to.deep.equal({ response: 'ok' })

      expect(stubLoggerWarn.notCalled).to.be.true
      expect(stubLoggerError.notCalled).to.be.true
    })

    it('should send a message and receive a response but fail to ack', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'test-response', data: 'test' }
      const stubLoggerWarn = sandbox.stub(logger, 'warn')

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn({
            assertQueue: sandbox.stub().resolves({ queue: 'replyQueue' }),
            consume: sandbox.stub().callsFake(async (_queue, onMessage) => {
              setTimeout(
                () =>
                  onMessage({
                    properties: { correlationId: 'uuid-test' },
                    content: Buffer.from(JSON.stringify({ response: 'ok' })),
                  }),
                50,
              )
            }),
            ack: sandbox.stub().throws(new Error('Ack error')), // Simulate ack failure
            sendToQueue: sandbox.stub().resolves(true),
            cancel: sandbox.stub().resolves(),
          })
        }),
      }

      const { default: RabbitMQHelperProxy } = proxyquire.noCallThru()('@helpers/rabbitMQ', {
        uuid: { v4: () => 'uuid-test' },
      })
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const response = await RabbitMQHelperProxy._sendMessageWithResponse(
        fakeChannelWrapper,
        queueName,
        payload,
        'unique-key',
        { waitResponse: true },
      )
      expect(response).to.deep.equal({ response: 'ok' })

      expect(stubLoggerWarn.calledOnceWith('Failed to ack ephemeral msg' as any)).to.be.true
    })

    it('should return null on timeout', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'test-timeout' }
      const stubLoggerWarn = sandbox.stub(logger, 'warn')

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn({
            assertQueue: sandbox.stub().resolves({ queue: 'replyQueue' }),
            consume: sandbox.stub().callsFake(async (_queue, _onMessage) => {
              // No response is sent to trigger the timeout
            }),
            sendToQueue: sandbox.stub().resolves(true),
          })
        }),
      }
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const response = await RabbitMQHelper._sendMessageWithResponse(
        fakeChannelWrapper,
        queueName,
        payload,
        'unique-key',
        {
          waitResponse: true,
          timeout: 100,
        },
      )
      expect(response).to.be.null
      expect(stubLoggerWarn.calledOnceWith('Timeout waiting for response' as any)).to.be.true
    })

    it('should handle invalid JSON response gracefully', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'test-invalid-json' }
      const stubLoggerError = sandbox.stub(logger, 'error')

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn({
            assertQueue: sandbox.stub().resolves({ queue: 'replyQueue' }),
            consume: sandbox.stub().callsFake(async (_queue, onMessage) => {
              setTimeout(
                () =>
                  onMessage({
                    properties: { correlationId: 'uuid-test' },
                    content: Buffer.from('invalid-json'),
                  }),
                50,
              )
            }),
            ack: sandbox.stub().returns(undefined),
            sendToQueue: sandbox.stub().resolves(true),
          })
        }),
      }

      const { default: RabbitMQHelperProxy } = proxyquire.noCallThru()('@helpers/rabbitMQ', {
        uuid: { v4: () => 'uuid-test' },
      })

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const response = await RabbitMQHelperProxy._sendMessageWithResponse(
        fakeChannelWrapper,
        queueName,
        payload,
        'unique-key',
        { waitResponse: true },
      )

      expect(response).to.be.null
      expect(stubLoggerError.calledOnceWith('Failed to parse ephemeral response as JSON' as any)).to.be.true
    })

    it('should log an error when failing to cancel ephemeral consumer on timeout', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'test-response', data: 'test' }
      const stubLoggerWarn = sandbox.stub(logger, 'warn')
      const stubLoggerError = sandbox.stub(logger, 'error')

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn({
            assertQueue: sandbox.stub().resolves({ queue: 'replyQueue' }),
            consume: sandbox.stub().resolves({ consumerTag: 'fake-consumer-tag' }),
            cancel: sandbox.stub().rejects(new Error('Cancel error')),
          })
        }),
        sendToQueue: sandbox.stub().resolves(false),
      }

      const { default: RabbitMQHelperProxy } = proxyquire.noCallThru()('@helpers/rabbitMQ', {
        uuid: { v4: () => 'uuid-test' },
      })
      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const response = await RabbitMQHelperProxy._sendMessageWithResponse(
        fakeChannelWrapper,
        queueName,
        payload,
        'unique-key',
        { waitResponse: true },
      )
      expect(response).to.be.null

      expect(stubLoggerWarn.calledOnceWith('Failed to cancel ephemeral consumer on timeout' as any)).to.be.true
      expect(stubLoggerError.calledOnceWith('Failed to send message to queue' as any)).to.be.true
    })

    it('should log an error when an unexpected error occurs in _sendMessageWithResponse', async () => {
      const queueName = EnumQueueName.contractInfo
      const payload = { id: 'test-unexpected-error' }
      const uniqueKey = 'unique-key'
      const stubLoggerError = sandbox.stub(logger, 'error')

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().throws(new Error('Unexpected failure')),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const response = await RabbitMQHelper._sendMessageWithResponse(
        fakeChannelWrapper,
        queueName,
        payload,
        uniqueKey,
        {
          waitResponse: true,
        },
      )

      expect(response).to.be.null

      expect(stubLoggerError.calledOnceWith('_sendMessageWithResponse error' as any)).to.be.true
    })
  })

  describe('getQueueMessageCount', () => {
    it('should return the correct message count from the queue and log it', async () => {
      const queueName = EnumQueueName.contractInfo
      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn({ checkQueue: sandbox.stub().resolves({ messageCount: 5 }) })
        }),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const count = await RabbitMQHelper.getQueueMessageCount(queueName)
      expect(count).to.equal(5)

      expect(stubLoggerVerbose.calledOnceWith('Queue "contract.info" has 5 messages' as any)).to.be.true
    })

    it('should return 0 when queue is empty and still log', async () => {
      const queueName = EnumQueueName.contractInfo
      const stubLoggerVerbose = sandbox.stub(logger, 'verbose')

      const fakeChannelWrapper = {
        addSetup: sandbox.stub().callsFake(async setupFn => {
          await setupFn({ checkQueue: sandbox.stub().resolves({ messageCount: 0 }) })
        }),
      }

      sandbox.stub(RabbitMQ, 'getChannel').returns(fakeChannelWrapper as any)

      const count = await RabbitMQHelper.getQueueMessageCount(queueName)
      expect(count).to.equal(0)

      expect(stubLoggerVerbose.calledOnceWith(`Queue "contract.info" has 0 messages` as any)).to.be.true
    })

    it('should return null and log an error when an error occurs', async () => {
      const queueName = EnumQueueName.contractInfo
      const stubLoggerError = sandbox.stub(logger, 'error')

      sandbox.stub(RabbitMQ, 'getChannel').throws(new Error('Queue error'))

      const count = await RabbitMQHelper.getQueueMessageCount(queueName)
      expect(count).to.be.null

      expect(stubLoggerError.calledOnceWith('getQueueMessageCount error' as any)).to.be.true
    })
  })
})
