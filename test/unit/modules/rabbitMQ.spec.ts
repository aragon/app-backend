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

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    RabbitMQ.connection = null
    RabbitMQ.channel = null
    RabbitMQ.reconnectTimer = null
    RabbitMQ.isReconnecting = false
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('connect', () => {
    it('should establish a connection and create a channel when not already connected', async () => {
      const createChannel = sandbox.stub().resolves({ on: sandbox.stub() })
      const mockConnection = {
        createChannel,
        close: sandbox.stub().resolves(),
        on: sandbox.stub(),
      } as unknown as Connection

      const mockAmqpConnect = sandbox.stub(amqp, 'connect').resolves(mockConnection)
      const mockLoggerInfo = sandbox.stub(logger, 'info')

      await RabbitMQ.connect()

      expect(mockAmqpConnect.calledOnceWithExactly(config.RABBITMQ.URI)).to.be.true
      expect(createChannel.calledOnce).to.be.true
      expect(RabbitMQ.connection).to.equal(mockConnection)
      expect(RabbitMQ.channel).to.not.be.null
      expect(mockLoggerInfo.calledWith('RabbitMQ connected' as any)).to.be.true
    })

    it('should not attempt to reconnect if already connected', async () => {
      const createChannel = sandbox.stub().resolves({ on: sandbox.stub() })
      const mockConnection: any = {
        createChannel,
        close: sandbox.stub().resolves(),
        on: sandbox.stub(),
      }

      RabbitMQ.connection = mockConnection
      RabbitMQ.channel = { on: sandbox.stub() } as unknown as Channel

      const mockAmqpConnect = sandbox.stub(amqp, 'connect').resolves(mockConnection)
      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      await RabbitMQ.connect()

      expect(mockAmqpConnect.notCalled).to.be.true
      expect(createChannel.called).to.be.false // Ensure it wasn't triggered
      expect(mockLoggerVerbose.calledWith('RabbitMQ: Already connected' as any)).to.be.true
    })

    it('should handle connection errors and schedule a reconnect', async () => {
      const mockAmqpConnect = sandbox.stub(amqp, 'connect').rejects(new Error('Connection failed'))
      const mockLoggerError = sandbox.stub(logger, 'error')
      const mockScheduleReconnect = sandbox.stub(RabbitMQ, 'scheduleReconnect')

      await RabbitMQ.connect()

      expect(mockAmqpConnect.calledWith(config.RABBITMQ.URI)).to.be.true
      expect(mockLoggerError.calledWith('RabbitMQ connection error' as any)).to.be.true
      expect(mockScheduleReconnect.calledOnce).to.be.true
      expect(RabbitMQ.isReconnecting).to.be.false
    })

    it('should attach event listeners for connection and channel', async () => {
      const createChannel = sandbox.stub().resolves({ on: sandbox.stub() })
      const mockConnection: any = {
        createChannel,
        close: sandbox.stub().resolves(),
        on: sandbox.stub(),
      }

      const mockAmqpConnect = sandbox.stub(amqp, 'connect').resolves(mockConnection)
      const mockHandleReconnect = sandbox.stub(RabbitMQ, 'handleReconnect')

      await RabbitMQ.connect()

      // Ensure connection event listeners are set
      expect(mockConnection.on.calledWith('close')).to.be.true
      expect(mockConnection.on.calledWith('error')).to.be.true

      // Simulate connection close and error events
      const closeCallback = mockConnection.on.getCall(0).args[1]
      const errorCallback = mockConnection.on.getCall(1).args[1]

      await closeCallback(new Error('Connection closed'))
      await errorCallback(new Error('Connection error'))

      // Ensure full reconnection is triggered
      expect(mockHandleReconnect.calledTwice).to.be.true
      expect(mockHandleReconnect.calledWithExactly(true)).to.be.true
    })
  })

  describe('createChannel', () => {
    it('should create a channel when a connection exists', async () => {
      const mockChannel = { on: sandbox.stub() }
      const mockCreateChannel = sandbox.stub().resolves(mockChannel)
      const mockConnection = {
        createChannel: mockCreateChannel,
      } as unknown as Connection

      RabbitMQ.connection = mockConnection
      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      await RabbitMQ.createChannel()

      expect(mockCreateChannel.calledOnce).to.be.true
      expect(RabbitMQ.channel).to.equal(mockChannel)
      expect(mockLoggerVerbose.calledWith('RabbitMQ channel created' as any)).to.be.true
    })

    it('should attach event listeners for channel close and error', async () => {
      const mockChannel: any = { on: sandbox.stub() }
      const mockCreateChannel = sandbox.stub().resolves(mockChannel)
      const mockConnection: any = {
        createChannel: mockCreateChannel,
      }

      RabbitMQ.connection = mockConnection
      const mockHandleReconnect = sandbox.stub(RabbitMQ, 'handleReconnect')

      await RabbitMQ.createChannel()

      expect(mockChannel.on.calledWith('close', sinon.match.func)).to.be.true
      expect(mockChannel.on.calledWith('error', sinon.match.func)).to.be.true

      const closeCallback = mockChannel.on.getCall(0).args[1]
      await closeCallback()

      expect(mockHandleReconnect.calledOnceWithExactly(false)).to.be.true

      const errorCallback = mockChannel.on.getCall(1).args[1]
      await errorCallback(new Error('Channel error'))

      expect(mockHandleReconnect.calledTwice).to.be.true
    })

    it('should handle channel creation failure and trigger a full reconnect', async () => {
      const mockCreateChannel = sandbox.stub().rejects(new Error('Failed to create channel'))
      const mockConnection = { createChannel: mockCreateChannel } as any
      RabbitMQ.connection = mockConnection

      const mockLoggerError = sandbox.stub(logger, 'error')
      const mockHandleReconnect = sandbox.stub(RabbitMQ, 'handleReconnect')

      await RabbitMQ.createChannel()

      expect(mockCreateChannel.calledOnce).to.be.true
      expect(mockLoggerError.calledWith('Failed to create RabbitMQ channel' as any)).to.be.true
      expect(mockHandleReconnect.calledOnceWithExactly(true)).to.be.true
    })
  })

  describe('handleReconnect', () => {
    it('should call forceClose and scheduleReconnect when fullReconnect is true', async () => {
      const mockForceClose = sandbox.stub(RabbitMQ, 'forceClose').resolves()
      const mockScheduleReconnect = sandbox.stub(RabbitMQ, 'scheduleReconnect')

      await RabbitMQ.handleReconnect(true)

      expect(mockForceClose.calledOnce).to.be.true
      expect(mockScheduleReconnect.calledOnce).to.be.true
    })

    it('should call createChannel when fullReconnect is false', async () => {
      const mockCreateChannel = sandbox.stub(RabbitMQ, 'createChannel').resolves()

      await RabbitMQ.handleReconnect(false)

      expect(mockCreateChannel.calledOnce).to.be.true
    })
  })

  describe('scheduleReconnect', () => {
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
      const mockConnect = sandbox.stub(RabbitMQ, '_connect').resolves()
      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      RabbitMQ.scheduleReconnect()
      expect(RabbitMQ.reconnectTimer).to.not.be.null

      // Wait for the reconnect timer to trigger
      await Utils.wait(config.RABBITMQ.RECONNECT_TIME + 5)

      expect(mockConnect.calledOnce).to.be.true
      expect(RabbitMQ.reconnectTimer).to.be.null
      expect(mockLoggerVerbose.calledWith('RabbitMQ successfully reconnected' as any)).to.be.true
    })

    it('should not schedule another reconnect if a timer is already set', () => {
      const mockConnect = sandbox.stub(RabbitMQ, '_connect').resolves()
      RabbitMQ.reconnectTimer = setTimeout(() => {}, 1000) // Mock an existing timer

      RabbitMQ.scheduleReconnect()

      expect(mockConnect.notCalled).to.be.true
    })

    it('should retry scheduling reconnect on connect failure', async () => {
      const mockConnect = sandbox.stub(RabbitMQ, '_connect')
      const mockLoggerError = sandbox.stub(logger, 'error')

      mockConnect.onFirstCall().rejects(new Error('Forced reconnect error'))
      mockConnect.onSecondCall().resolves()

      RabbitMQ.scheduleReconnect()

      // Wait for first reconnect attempt
      await Utils.wait(config.RABBITMQ.RECONNECT_TIME + 5)

      expect(mockConnect.calledOnce).to.be.true
      expect(mockLoggerError.calledWith('RabbitMQ reconnection attempt failed' as any)).to.be.true

      // Wait for second reconnect attempt
      await Utils.wait(config.RABBITMQ.RECONNECT_TIME + 5)
      expect(mockConnect.calledTwice).to.be.true
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
      const purgeQueueStub = sandbox.stub().resolves()
      RabbitMQ.channel = { purgeQueue: purgeQueueStub } as any
      const loggerInfoStub = sandbox.stub(logger, 'info')

      await RabbitMQ.cleanAllQueues()

      for (const queueName of Object.values(EnumQueueName)) {
        expect(purgeQueueStub.calledWithExactly(queueName)).to.be.true
      }
      expect(loggerInfoStub.callCount).to.equal(Object.values(EnumQueueName).length)
    })

    it('should log an error if purging queues fails', async () => {
      const purgeQueueStub = sandbox.stub().rejects(new Error('Purge failed'))
      RabbitMQ.channel = { purgeQueue: purgeQueueStub } as any
      const loggerErrorStub = sandbox.stub(logger, 'error')

      await RabbitMQ.cleanAllQueues()

      expect(loggerErrorStub.calledOnceWith('Failed to clean RabbitMQ queues' as any)).to.be.true
    })

    it('should continue purging even if some queues fail', async () => {
      const purgeQueueStub = sandbox.stub()
      const queueNames = Object.values(EnumQueueName)

      // First queue succeeds, second queue fails
      purgeQueueStub.onFirstCall().resolves()
      purgeQueueStub.onSecondCall().rejects(new Error('Purge failed'))

      RabbitMQ.channel = { purgeQueue: purgeQueueStub } as any

      const loggerErrorStub = sandbox.stub(logger, 'error')
      const loggerInfoStub = sandbox.stub(logger, 'info')

      await RabbitMQ.cleanAllQueues()

      expect(purgeQueueStub.firstCall.calledWithExactly(queueNames[0])).to.be.true
      expect(loggerInfoStub.calledWith(`Queue "${queueNames[0]}" purged` as any)).to.be.true

      expect(purgeQueueStub.secondCall.calledWithExactly(queueNames[1])).to.be.true
      expect(loggerErrorStub.calledWith('Failed to clean RabbitMQ queues' as any)).to.be.true
    })
  })

  describe('forceClose', () => {
    it('should clear the reconnect timer and close channel and connection', async () => {
      RabbitMQ.reconnectTimer = setTimeout(() => {}, 1000)
      const closeChannel = sandbox.stub().resolves()
      const closeConnection = sandbox.stub().resolves()

      RabbitMQ.channel = { close: closeChannel } as any
      RabbitMQ.connection = { close: closeConnection } as any

      await RabbitMQ.forceClose()

      expect(RabbitMQ.reconnectTimer).to.be.null
      expect(closeChannel.calledOnce).to.be.true
      expect(closeConnection.calledOnce).to.be.true
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
    })

    it('should handle errors during forceClose gracefully', async () => {
      RabbitMQ.reconnectTimer = setTimeout(() => {}, 1000)

      const closeChannel = sandbox.stub().rejects(new Error('Channel close error'))
      const closeConnection = sandbox.stub().rejects(new Error('Connection close error'))

      RabbitMQ.channel = { close: closeChannel } as any
      RabbitMQ.connection = { close: closeConnection } as any

      await RabbitMQ.forceClose()

      expect(RabbitMQ.reconnectTimer).to.be.null
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
    })
  })

  describe('close', () => {
    it('should close both the channel and the connection if they exist', async () => {
      const closeChannelStub = sandbox.stub().resolves()
      const closeConnectionStub = sandbox.stub().resolves()

      RabbitMQ.channel = { close: closeChannelStub } as any
      RabbitMQ.connection = { close: closeConnectionStub } as any

      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      await RabbitMQ.close()

      expect(closeChannelStub.calledOnce).to.be.true
      expect(closeConnectionStub.calledOnce).to.be.true
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
      expect(mockLoggerVerbose.calledWith('RabbitMQ disconnected' as any)).to.be.true
    })

    it('should handle closing only the channel if the connection does not exist', async () => {
      const closeChannelStub = sandbox.stub().resolves()

      RabbitMQ.channel = { close: closeChannelStub } as any
      RabbitMQ.connection = null

      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      await RabbitMQ.close()

      expect(closeChannelStub.calledOnce).to.be.true
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
      expect(mockLoggerVerbose.calledWith('RabbitMQ disconnected' as any)).to.be.true
    })

    it('should handle closing only the connection if the channel does not exist', async () => {
      const closeConnectionStub = sandbox.stub().resolves()

      RabbitMQ.channel = null
      RabbitMQ.connection = { close: closeConnectionStub } as any

      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      await RabbitMQ.close()

      expect(closeConnectionStub.calledOnce).to.be.true
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
      expect(mockLoggerVerbose.calledWith('RabbitMQ disconnected' as any)).to.be.true
    })

    it('should handle errors gracefully when closing the channel or connection', async () => {
      const closeChannelStub = sandbox.stub().rejects(new Error('Channel close error'))
      const closeConnectionStub = sandbox.stub().rejects(new Error('Connection close error'))

      RabbitMQ.channel = { close: closeChannelStub } as any
      RabbitMQ.connection = { close: closeConnectionStub } as any

      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      await RabbitMQ.close()

      expect(closeChannelStub.calledOnce).to.be.true
      expect(closeConnectionStub.calledOnce).to.be.true
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
      expect(mockLoggerVerbose.calledWith('RabbitMQ disconnected' as any)).to.be.true
    })
  })

  describe('isConnected', () => {
    it('should return true if both connection and channel are established', () => {
      RabbitMQ.connection = { on: sandbox.stub() } as unknown as Connection
      RabbitMQ.channel = { on: sandbox.stub() } as any

      expect(RabbitMQ.isConnected()).to.be.true
    })

    it('should return false if connection is missing', () => {
      RabbitMQ.connection = null
      RabbitMQ.channel = { on: sandbox.stub() } as any

      expect(RabbitMQ.isConnected()).to.be.false
    })

    it('should return false if channel is missing', () => {
      RabbitMQ.connection = { on: sandbox.stub() } as any
      RabbitMQ.channel = null

      expect(RabbitMQ.isConnected()).to.be.false
    })

    it('should return false if both connection and channel are missing', () => {
      RabbitMQ.connection = null
      RabbitMQ.channel = null

      expect(RabbitMQ.isConnected()).to.be.false
    })
  })

  describe('getChannel', () => {
    it('should return the current channel if connected', () => {
      const mockChannel = { on: sandbox.stub() } as any
      RabbitMQ.channel = mockChannel

      expect(RabbitMQ.getChannel()).to.equal(mockChannel)
    })

    it('should return null if no channel is set', () => {
      RabbitMQ.channel = null

      expect(RabbitMQ.getChannel()).to.be.null
    })
  })

  describe('getMessageCount method', () => {
    it('should return the message count for a valid queue', async () => {
      const mockChannel = {
        checkQueue: sandbox.stub().resolves({ messageCount: 5 }),
      } as any

      RabbitMQ.channel = mockChannel
      const mockLoggerInfo = sandbox.stub(logger, 'info')

      const messageCount = await RabbitMQ.getMessageCount(EnumQueueName.plugins)

      expect(mockChannel.checkQueue.calledOnceWithExactly(EnumQueueName.plugins)).to.be.true
      expect(messageCount).to.equal(5)
      expect(mockLoggerInfo.calledOnce).to.be.true
    })

    it('should return null and log a warning if channel is not available', async () => {
      RabbitMQ.channel = null
      const mockLoggerWarn = sandbox.stub(logger, 'warn')

      const messageCount = await RabbitMQ.getMessageCount(EnumQueueName.plugins)

      expect(messageCount).to.be.null
      expect(mockLoggerWarn.calledWith('Cannot get message count: Channel is not available' as any)).to.be.true
    })

    it('should return null and log an error if checkQueue fails', async () => {
      const mockChannel = {
        checkQueue: sandbox.stub().rejects(new Error('Queue does not exist')),
      } as any

      RabbitMQ.channel = mockChannel
      const mockLoggerError = sandbox.stub(logger, 'error')

      const messageCount = await RabbitMQ.getMessageCount(EnumQueueName.plugins)

      expect(mockChannel.checkQueue.calledOnceWithExactly(EnumQueueName.plugins)).to.be.true
      expect(messageCount).to.be.null
      expect(mockLoggerError.calledOnce).to.be.true
    })
  })
})
