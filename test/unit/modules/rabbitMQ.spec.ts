import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'
import amqp, { Connection, Channel } from 'amqplib'
import config from '@config'
import logger from '@logger'
import RabbitMQ from '@modules/rabbitMQ'
import Utils from '@helpers/utils'

describe('Modules:RabbitMQ', () => {
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
    } as any

    mockChannel = {
      close: sandbox.stub().resolves(),
      on: sandbox.stub(),
    } as any

    mockAmqpConnect = sandbox.stub(amqp, 'connect').resolves(mockConnection)
  })

  afterEach(() => {
    sandbox?.restore()
    RabbitMQ.connection = null
    RabbitMQ.channel = null
  })

  describe('connect method', () => {
    it('should connect and create a channel when not already connected', async () => {
      const mockLoggerInfo = sandbox.stub(logger, 'info')
      mockConnection.createChannel.resolves(mockChannel)
      config.RABBITMQ.URI = 'amqp://localhost'

      await RabbitMQ.connect()

      expect(mockAmqpConnect.calledOnce).to.be.true
      expect(mockAmqpConnect.calledWith('amqp://localhost')).to.be.true
      expect(mockConnection.createChannel.calledOnce).to.be.true
      expect(RabbitMQ.connection).to.equal(mockConnection)
      expect(RabbitMQ.channel).to.equal(mockChannel)
      expect(mockLoggerInfo.calledWith('RabbitMQ connected' as any)).to.be.true

      config.RABBITMQ.URI = ''
    })

    it('should not reconnect if already connected', async () => {
      RabbitMQ.connection = mockConnection
      RabbitMQ.channel = mockChannel
      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      await RabbitMQ.connect()

      expect(mockAmqpConnect.notCalled).to.be.true
      expect(mockConnection.createChannel.notCalled).to.be.true
      expect(mockLoggerVerbose.calledWith('RabbitMQ: Already connected' as any)).to.be.true
    })

    it('should log and throw an error if connection fails', async () => {
      const connectionError = new Error('Connection failed')
      mockAmqpConnect.rejects(connectionError)
      const mockLoggerError = sandbox.stub(logger, 'error')

      const reconnetingCall = sandbox.stub(RabbitMQ, 'scheduleReconnect')

      await RabbitMQ.connect()
      expect(mockLoggerError.calledWith('RabbitMQ connection error' as any)).to.be.true
      expect(reconnetingCall.calledOnce).to.be.true
    })
  })

  describe('getChannel method', () => {
    it('should return the current channel', () => {
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
    it('should close the channel and connection if they exist', async () => {
      RabbitMQ.connection = mockConnection
      RabbitMQ.channel = mockChannel

      let mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      await RabbitMQ.close()

      expect(mockChannel.close.calledOnce).to.be.true
      expect(mockConnection.close.calledOnce).to.be.true
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
      expect(mockLoggerVerbose.calledWith('RabbitMQ disconnected' as any)).to.be.true
    })

    it('should handle when only the channel exists', async () => {
      RabbitMQ.connection = null
      RabbitMQ.channel = mockChannel
      let mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      await RabbitMQ.close()

      expect(mockChannel.close.calledOnce).to.be.true
      expect(mockConnection.close.notCalled).to.be.true
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
      expect(mockLoggerVerbose.calledWith('RabbitMQ disconnected' as any)).to.be.true
    })

    it('should handle when only the connection exists', async () => {
      RabbitMQ.connection = mockConnection
      RabbitMQ.channel = null

      let mockLoggerVerbose = sandbox.stub(logger, 'verbose')
      await RabbitMQ.close()

      expect(mockChannel.close.notCalled).to.be.true
      expect(mockConnection.close.calledOnce).to.be.true
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
      expect(mockLoggerVerbose.calledOnceWith('RabbitMQ disconnected' as any)).to.be.true
    })

    it('should log and throw an error if closing fails', async () => {
      const closeError = new Error('Close failed')
      mockChannel.close.rejects(closeError)
      RabbitMQ.connection = mockConnection
      RabbitMQ.channel = mockChannel
      const mockLoggerError = sandbox.stub(logger, 'error')
      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')

      await RabbitMQ.close()
      expect(mockLoggerVerbose.calledOnceWith('RabbitMQ disconnected' as any)).to.be.true
      expect(mockLoggerError.calledWith('Error closing channel' as any)).to.be.true
    })
  })

  describe('handleCloseOrError', () => {
    it('should force close and schedule a reconnect', async () => {
      const mockLoggerError = sandbox.stub(logger, 'error')
      const forceCloseStub = sandbox.stub(RabbitMQ, 'forceClose').resolves()
      const scheduleReconnectStub = sandbox.stub(RabbitMQ, 'scheduleReconnect')

      await RabbitMQ.handleCloseOrError('Connection closed', new Error('test'))

      expect(mockLoggerError.calledOnce).to.be.true
      expect(forceCloseStub.calledOnce).to.be.true
      expect(scheduleReconnectStub.calledOnce).to.be.true
    })

    it('should handle multiple calls but only schedule reconnect once', async () => {
      const mockLoggerError = sandbox.stub(logger, 'error')
      const forceCloseStub = sandbox.stub(RabbitMQ, 'forceClose').resolves()
      const scheduleReconnectStub = sandbox.stub(RabbitMQ, 'scheduleReconnect')

      await Promise.all([
        RabbitMQ.handleCloseOrError('Close event #1', new Error('test1')),
        RabbitMQ.handleCloseOrError('Close event #2', new Error('test2')),
      ])
      expect(forceCloseStub.callCount).to.equal(2)
      expect(scheduleReconnectStub.callCount).to.equal(2)
      expect(mockLoggerError.callCount).to.equal(2)
    })
  })

  describe('scheduleReconnect', () => {
    beforeEach(() => {
      config.RABBITMQ.RECONNECT_TIME = 10
    })
    afterEach(() => {
      if (RabbitMQ.reconnectTimer) {
        clearTimeout(RabbitMQ.reconnectTimer)
        RabbitMQ.reconnectTimer = null
      }
    })
    it('should create a reconnect timer if none exists', async () => {
      const connectStub = sandbox.stub(RabbitMQ, 'connect').resolves()
      expect(RabbitMQ.reconnectTimer).to.be.null

      RabbitMQ.scheduleReconnect()
      expect(RabbitMQ.reconnectTimer).to.not.be.null

      await Utils.wait(config.RABBITMQ.RECONNECT_TIME + 5)
      expect(connectStub.calledOnce).to.be.true
    })

    it('should not schedule another reconnect if timer is already set', async () => {
      const connectStub = sandbox.stub(RabbitMQ, 'connect').resolves()

      RabbitMQ.reconnectTimer = setTimeout(() => {}, 1000)

      RabbitMQ.scheduleReconnect()
      expect(connectStub.called).to.be.false

      clearTimeout(RabbitMQ.reconnectTimer!)
      RabbitMQ.reconnectTimer = null
    })

    it('should retry scheduleReconnect on connect error', async () => {
      const connectStub = sandbox.stub(RabbitMQ, 'connect')
      const mockLoggerError = sandbox.stub(logger, 'error')

      connectStub.onFirstCall().rejects(new Error('Forced reconnect error'))
      connectStub.onSecondCall().resolves()

      RabbitMQ.scheduleReconnect()
      await Utils.wait(config.RABBITMQ.RECONNECT_TIME + 5)
      expect(mockLoggerError.calledWithMatch('RabbitMQ reconnection attempt failed' as any)).to.be.true
      expect(connectStub.callCount).to.equal(1)

      await Utils.wait(config.RABBITMQ.RECONNECT_TIME + 5)
      expect(connectStub.callCount).to.equal(2)
    })
  })

  describe('forceClose', () => {
    it('should clear reconnect timer and nullify channel/connection', async () => {
      RabbitMQ.reconnectTimer = setTimeout(() => {}, 1000)
      RabbitMQ.channel = { close: sandbox.stub() } as any
      RabbitMQ.connection = { close: sandbox.stub() } as any

      await RabbitMQ.forceClose()

      expect(RabbitMQ.reconnectTimer).to.be.null
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
    })

    it('should log errors if channel/connection closing throws', async () => {
      RabbitMQ.reconnectTimer = setTimeout(() => {}, 1000)
      const mockLoggerError = sandbox.stub(logger, 'error')

      const closeChannelStub = sandbox.stub().rejects(new Error('Channel error'))
      const closeConnectionStub = sandbox.stub().rejects(new Error('Connection error'))

      RabbitMQ.channel = { close: closeChannelStub } as any
      RabbitMQ.connection = { close: closeConnectionStub } as any

      await RabbitMQ.forceClose()
      expect(mockLoggerError.callCount).to.equal(2)
      expect(RabbitMQ.channel).to.be.null
      expect(RabbitMQ.connection).to.be.null
    })
  })

  describe('isConnected', () => {
    it('should return true if both connection and channel are set', () => {
      RabbitMQ.connection = mockConnection
      RabbitMQ.channel = mockChannel

      expect(RabbitMQ.isConnected()).to.be.true
    })
  })
})
