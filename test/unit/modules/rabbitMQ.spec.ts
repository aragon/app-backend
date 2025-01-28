import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'
import amqp, { Connection, Channel } from 'amqplib'
import config from '@config'
import logger from '@logger'
import RabbitMQ from '@modules/rabbitMQ'
import Utils from '@helpers/utils'
import { EnumQueueName } from '@types'

describe('Modules: RabbitMQ', () => {
  let sandbox: SinonSandbox
  let mockConnection: sinon.SinonStubbedInstance<Connection>
  let mockChannel: sinon.SinonStubbedInstance<Channel>
  let mockAmqpConnect: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()

    mockConnection = {
      createChannel: sandbox.stub(),
      close: sandbox.stub().resolves(),
      on: sandbox.stub(),
    } as unknown as sinon.SinonStubbedInstance<Connection>

    mockChannel = {
      close: sandbox.stub().resolves(),
      on: sandbox.stub(),
      purgeQueue: sandbox.stub().resolves(),
      checkQueue: sandbox.stub(),
    } as unknown as sinon.SinonStubbedInstance<Channel>

    mockAmqpConnect = sandbox.stub(amqp, 'connect').resolves(mockConnection)
  })

  afterEach(() => {
    sandbox.restore()
    RabbitMQ.connection = null
    RabbitMQ.channel = null
    RabbitMQ.reconnectTimer = null
    RabbitMQ.isReconnecting = false
  })

  describe('connect method', () => {
    it('should establish a connection and create a channel when not already connected', async () => {
      const mockLoggerInfo = sandbox.stub(logger, 'info')
      mockConnection.createChannel.resolves(mockChannel)
      config.RABBITMQ.URI = 'amqp://localhost'
      config.RABBITMQ.CLEAN_QUEUE = false

      await RabbitMQ.connect()

      expect(mockAmqpConnect.calledOnceWithExactly('amqp://localhost')).to.be.true
      expect(mockConnection.createChannel.calledOnce).to.be.true
      expect(RabbitMQ.connection).to.equal(mockConnection)
      expect(RabbitMQ.channel).to.equal(mockChannel)
      expect(mockLoggerInfo.calledWith('RabbitMQ connected' as any)).to.be.true
    })

    it('should clean all queues if CLEAN_QUEUE is true', async () => {
      const mockLoggerInfo = sandbox.stub(logger, 'info')
      mockConnection.createChannel.resolves(mockChannel)
      config.RABBITMQ.URI = 'amqp://localhost'
      config.RABBITMQ.CLEAN_QUEUE = true

      // Stub purgeQueue for all queues
      mockChannel.purgeQueue.resolves()

      await RabbitMQ.connect()

      for (const queueName of Object.values(EnumQueueName)) {
        expect(mockChannel.purgeQueue.calledWithExactly(queueName)).to.be.true
      }
      expect(mockLoggerInfo.calledWith(('Queue "' + Object.values(EnumQueueName)[0] + '" has been purged') as any)).to
        .be.true
    })

    it('should not attempt to reconnect if already connected', async () => {
      RabbitMQ.connection = mockConnection
      RabbitMQ.channel = mockChannel
      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      await RabbitMQ.connect()

      expect(mockAmqpConnect.notCalled).to.be.true
      expect(mockConnection.createChannel.notCalled).to.be.true
      expect(mockLoggerVerbose.calledWith('RabbitMQ: Already connected' as any)).to.be.true
    })

    it('should not attempt to reconnect if already reconnecting', async () => {
      RabbitMQ.isReconnecting = true
      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      await RabbitMQ.connect()

      expect(mockAmqpConnect.notCalled).to.be.true
      expect(mockLoggerVerbose.calledWith('RabbitMQ: Reconnect attempt already in progress' as any)).to.be.true
    })

    it('should handle connection errors and schedule a reconnect', async () => {
      const connectionError = new Error('Connection failed')
      mockAmqpConnect.rejects(connectionError)
      const mockLoggerError = sandbox.stub(logger, 'error')
      const mockScheduleReconnect = sandbox.stub(RabbitMQ, 'scheduleReconnect')

      await RabbitMQ.connect()

      expect(mockAmqpConnect.calledOnce).to.be.true
      expect(mockLoggerError.calledWith('RabbitMQ connection error' as any)).to.be.true
      expect(mockScheduleReconnect.calledOnce).to.be.true
      expect(RabbitMQ.isReconnecting).to.be.false
    })

    it('should call handleCloseOrError when connection close event occurs', async () => {
      const mockHandleCloseOrError = sandbox.stub(RabbitMQ, 'handleCloseOrError').resolves()
      mockConnection.createChannel.resolves(mockChannel)

      await RabbitMQ.connect()

      const closeCallback = mockConnection.on.getCall(0).args[1]
      await closeCallback('Test close error')

      expect(mockHandleCloseOrError.calledOnceWith('Connection closed', 'Test close error')).to.be.true
    })

    it('should call handleCloseOrError when connection error event occurs', async () => {
      const mockHandleCloseOrError = sandbox.stub(RabbitMQ, 'handleCloseOrError').resolves()
      mockConnection.createChannel.resolves(mockChannel)

      await RabbitMQ.connect()

      const errorCallback = mockConnection.on.getCall(1).args[1]
      await errorCallback(new Error('Connection error test'))

      expect(mockHandleCloseOrError.calledOnceWith('Connection error', sinon.match.instanceOf(Error))).to.be.true
    })

    it('should call handleCloseOrError when channel close event occurs', async () => {
      const mockHandleCloseOrError = sandbox.stub(RabbitMQ, 'handleCloseOrError').resolves()
      mockConnection.createChannel.resolves(mockChannel)

      await RabbitMQ.connect()

      const closeCallback = mockChannel.on.getCall(0).args[1]
      await closeCallback('Test channel close error')

      expect(mockHandleCloseOrError.calledOnceWith('Channel closed', 'Test channel close error')).to.be.true
    })

    it('should call handleCloseOrError when channel error event occurs', async () => {
      const mockHandleCloseOrError = sandbox.stub(RabbitMQ, 'handleCloseOrError').resolves()
      mockConnection.createChannel.resolves(mockChannel)

      await RabbitMQ.connect()

      // Simulate the error event
      const errorCallback = mockChannel.on.getCall(1).args[1]
      await errorCallback(new Error('Channel error test'))

      expect(mockHandleCloseOrError.calledOnceWith('Channel error', sinon.match.instanceOf(Error))).to.be.true
    })

    it('should attach event listeners for connection and channel', async () => {
      mockConnection.createChannel.resolves(mockChannel)

      await RabbitMQ.connect()

      // Check connection listeners
      expect(mockConnection.on.calledWith('close')).to.be.true
      expect(mockConnection.on.calledWith('error')).to.be.true

      // Check channel listeners
      expect(mockChannel.on.calledWith('close')).to.be.true
      expect(mockChannel.on.calledWith('error')).to.be.true
    })
  })

  describe('getChannel method', () => {
    it('should return the current channel if connected', () => {
      RabbitMQ.channel = mockChannel
      const channel = RabbitMQ.getChannel()
      expect(channel).to.equal(mockChannel)
    })

    it('should return null if no channel is set', () => {
      RabbitMQ.channel = null
      const channel = RabbitMQ.getChannel()
      expect(channel).to.be.null
    })
  })

  describe('close method', () => {
    it('should close both channel and connection if they exist', async () => {
      RabbitMQ.connection = mockConnection
      RabbitMQ.channel = mockChannel
      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      await RabbitMQ.close()

      expect(mockChannel.close.calledOnce).to.be.true
      expect(mockConnection.close.calledOnce).to.be.true
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
      expect(mockLoggerVerbose.calledWith('RabbitMQ disconnected' as any)).to.be.true
    })

    it('should handle closing only the channel if connection does not exist', async () => {
      RabbitMQ.connection = null
      RabbitMQ.channel = mockChannel
      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      await RabbitMQ.close()

      expect(mockChannel.close.calledOnce).to.be.true
      expect(mockConnection.close.notCalled).to.be.true
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
      expect(mockLoggerVerbose.calledWith('RabbitMQ disconnected' as any)).to.be.true
    })

    it('should handle closing only the connection if channel does not exist', async () => {
      RabbitMQ.connection = mockConnection
      RabbitMQ.channel = null
      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      await RabbitMQ.close()

      expect(mockChannel.close.notCalled).to.be.true
      expect(mockConnection.close.calledOnce).to.be.true
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
      expect(mockLoggerVerbose.calledWith('RabbitMQ disconnected' as any)).to.be.true
    })

    it('should handle errors during closing gracefully', async () => {
      const closeError = new Error('Close failed')
      mockChannel.close.rejects(closeError)
      RabbitMQ.connection = mockConnection
      RabbitMQ.channel = mockChannel
      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      await RabbitMQ.close()

      expect(mockChannel.close.calledOnce).to.be.true
      expect(mockConnection.close.calledOnce).to.be.true
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
      expect(mockLoggerVerbose.calledWith('RabbitMQ disconnected' as any)).to.be.true
    })
  })

  describe('handleCloseOrError method', () => {
    it('should force close and schedule a reconnect on connection close', async () => {
      const mockLoggerError = sandbox.stub(logger, 'error')
      const forceCloseStub = sandbox.stub(RabbitMQ, 'forceClose').resolves()
      const scheduleReconnectStub = sandbox.stub(RabbitMQ, 'scheduleReconnect')

      await RabbitMQ.handleCloseOrError('Connection closed', new Error('test error'))

      expect(mockLoggerError.calledWith('[RabbitMQ] Connection closed' as any)).to.be.true
      expect(forceCloseStub.calledOnce).to.be.true
      expect(scheduleReconnectStub.calledOnce).to.be.true
    })

    it('should handle multiple close/error events gracefully', async () => {
      const mockLoggerError = sandbox.stub(logger, 'error')
      const forceCloseStub = sandbox.stub(RabbitMQ, 'forceClose').resolves()
      const scheduleReconnectStub = sandbox.stub(RabbitMQ, 'scheduleReconnect')

      await Promise.all([
        RabbitMQ.handleCloseOrError('Close event #1', new Error('error1')),
        RabbitMQ.handleCloseOrError('Close event #2', new Error('error2')),
      ])

      expect(mockLoggerError.calledTwice).to.be.true
      expect(forceCloseStub.calledTwice).to.be.true
      expect(scheduleReconnectStub.calledTwice).to.be.true
    })
  })

  describe('scheduleReconnect method', () => {
    beforeEach(() => {
      config.RABBITMQ.RECONNECT_TIME = 10 // Short delay for testing
    })

    afterEach(() => {
      if (RabbitMQ.reconnectTimer) {
        clearTimeout(RabbitMQ.reconnectTimer)
        RabbitMQ.reconnectTimer = null
      }
    })

    it('should schedule a reconnect if no timer is set', async () => {
      const connectStub = sandbox.stub(RabbitMQ, 'connect').resolves()
      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      RabbitMQ.scheduleReconnect()
      expect(RabbitMQ.reconnectTimer).to.not.be.null

      // Wait for the reconnect timer to trigger
      await Utils.wait(config.RABBITMQ.RECONNECT_TIME + 5)
      expect(connectStub.calledOnce).to.be.true
      expect(RabbitMQ.reconnectTimer).to.be.null
      expect(mockLoggerVerbose.calledWith('RabbitMQ connected' as any)).to.be.true
    })

    it('should not schedule another reconnect if a timer is already set', () => {
      const connectStub = sandbox.stub(RabbitMQ, 'connect').resolves()
      RabbitMQ.reconnectTimer = setTimeout(() => {}, 1000)

      RabbitMQ.scheduleReconnect()
      expect(connectStub.notCalled).to.be.true
    })

    it('should retry scheduling reconnect on connect failure', async () => {
      const connectStub = sandbox.stub(RabbitMQ, 'connect')
      const mockLoggerError = sandbox.stub(logger, 'error')

      connectStub.onFirstCall().rejects(new Error('Forced reconnect error'))
      connectStub.onSecondCall().resolves()

      RabbitMQ.scheduleReconnect()

      // Wait for first reconnect attempt
      await Utils.wait(config.RABBITMQ.RECONNECT_TIME + 5)
      expect(connectStub.calledOnce).to.be.true
      expect(mockLoggerError.calledWith('RabbitMQ reconnection attempt failed' as any)).to.be.true

      // Wait for second reconnect attempt
      await Utils.wait(config.RABBITMQ.RECONNECT_TIME + 5)
      expect(connectStub.calledTwice).to.be.true
    })
  })

  describe('forceClose method', () => {
    it('should clear the reconnect timer and close channel and connection', async () => {
      RabbitMQ.reconnectTimer = setTimeout(() => {}, 1000)
      RabbitMQ.channel = mockChannel
      RabbitMQ.connection = mockConnection

      await RabbitMQ.forceClose()

      expect(RabbitMQ.reconnectTimer).to.be.null
      expect(mockChannel.close.calledOnce).to.be.true
      expect(mockConnection.close.calledOnce).to.be.true
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
    })

    it('should handle errors during forceClose gracefully', async () => {
      const closeChannelError = new Error('Channel close error')
      const closeConnectionError = new Error('Connection close error')
      mockChannel.close.rejects(closeChannelError)
      mockConnection.close.rejects(closeConnectionError)

      RabbitMQ.reconnectTimer = setTimeout(() => {}, 1000)
      RabbitMQ.channel = mockChannel
      RabbitMQ.connection = mockConnection

      await RabbitMQ.forceClose()

      expect(RabbitMQ.reconnectTimer).to.be.null
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
    })
  })

  describe('isConnected method', () => {
    it('should return true if both connection and channel are established', () => {
      RabbitMQ.connection = mockConnection
      RabbitMQ.channel = mockChannel

      const result = RabbitMQ.isConnected()
      expect(result).to.be.true
    })

    it('should return false if connection is missing', () => {
      RabbitMQ.connection = null
      RabbitMQ.channel = mockChannel

      const result = RabbitMQ.isConnected()
      expect(result).to.be.false
    })

    it('should return false if channel is missing', () => {
      RabbitMQ.connection = mockConnection
      RabbitMQ.channel = null

      const result = RabbitMQ.isConnected()
      expect(result).to.be.false
    })

    it('should return false if both connection and channel are missing', () => {
      RabbitMQ.connection = null
      RabbitMQ.channel = null

      const result = RabbitMQ.isConnected()
      expect(result).to.be.false
    })
  })

  describe('getMessageCount method', () => {
    it('should return the message count for a valid queue', async () => {
      RabbitMQ.channel = mockChannel
      const queueName = EnumQueueName.plugins
      const mockMessageCount = 5
      const mockCheckQueueResponse = { messageCount: mockMessageCount, consumerCount: 0 } as any

      mockChannel.checkQueue.resolves(mockCheckQueueResponse)
      const mockLoggerInfo = sandbox.stub(logger, 'info')

      const messageCount = await RabbitMQ.getMessageCount(queueName)

      expect(mockChannel.checkQueue.calledOnceWithExactly(queueName)).to.be.true
      expect(messageCount).to.equal(mockMessageCount)
      expect(mockLoggerInfo.calledWith(`Queue "${queueName}" has ${mockMessageCount} messages` as any)).to.be.true
    })

    it('should return null and log a warning if channel is not available', async () => {
      RabbitMQ.channel = null
      const mockLoggerWarn = sandbox.stub(logger, 'warn')

      const messageCount = await RabbitMQ.getMessageCount('test_queue')

      expect(messageCount).to.be.null
      expect(mockLoggerWarn.calledWith('Cannot get message count: Channel is not available' as any)).to.be.true
    })

    it('should return null and log an error if checkQueue fails', async () => {
      RabbitMQ.channel = mockChannel
      const queueName = 'invalid_queue'
      const mockError = new Error('Queue does not exist')
      mockChannel.checkQueue.rejects(mockError)
      const mockLoggerError = sandbox.stub(logger, 'error')

      const messageCount = await RabbitMQ.getMessageCount(queueName)

      expect(mockChannel.checkQueue.calledOnceWithExactly(queueName)).to.be.true
      expect(messageCount).to.be.null
      expect(mockLoggerError.calledWith(`Failed to get message count for queue "${queueName}"` as any)).to.be.true
    })
  })

  describe('cleanAllQueues', () => {
    it('should log a warning if the channel is not available', async () => {
      RabbitMQ.channel = null
      const loggerWarnStub = sandbox.stub(logger, 'warn')

      await RabbitMQ.cleanAllQueues()

      expect(loggerWarnStub.calledOnceWith('Cannot clean queues: Channel is not available' as any)).to.be.true
    })

    it('should purge all queues successfully', async () => {
      RabbitMQ.channel = mockChannel
      const loggerInfoStub = sandbox.stub(logger, 'info')

      await RabbitMQ.cleanAllQueues()

      for (const queueName of Object.values(EnumQueueName)) {
        expect(mockChannel.purgeQueue.calledWithExactly(queueName)).to.be.true
      }
      expect(loggerInfoStub.callCount).to.equal(Object.values(EnumQueueName).length)
    })

    it('should log an error if purging queues fails', async () => {
      RabbitMQ.channel = mockChannel
      const loggerErrorStub = sandbox.stub(logger, 'error')
      const testError = new Error('Purge failed')

      mockChannel.purgeQueue.rejects(testError)

      await RabbitMQ.cleanAllQueues()

      expect(loggerErrorStub.calledOnceWith('Failed to clean RabbitMQ queues' as any)).to.be.true
    })

    it('should continue purging even if some queues fail', async () => {
      RabbitMQ.channel = mockChannel
      const loggerErrorStub = sandbox.stub(logger, 'error')
      const loggerInfoStub = sandbox.stub(logger, 'info')

      const queueNames = Object.values(EnumQueueName)
      mockChannel.purgeQueue.onFirstCall().resolves().onSecondCall().rejects(new Error('Purge failed'))

      await RabbitMQ.cleanAllQueues()

      expect(mockChannel.purgeQueue.firstCall.calledWithExactly(queueNames[0])).to.be.true
      expect(loggerInfoStub.calledWith(`Queue "${queueNames[0]}" has been purged` as any)).to.be.true

      expect(mockChannel.purgeQueue.secondCall.calledWithExactly(queueNames[1])).to.be.true
      expect(loggerErrorStub.calledWith('Failed to clean RabbitMQ queues' as any)).to.be.true
    })
  })
})
