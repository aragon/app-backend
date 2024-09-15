import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'
import amqp, { Connection, Channel } from 'amqplib'
import config from '@config'
import logger from '@logger'
import RabbitMQ from '@modules/rabbitMQ'

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
    } as any

    mockChannel = {
      close: sandbox.stub().resolves(),
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
      expect(mockLoggerVerbose.calledWith('RabbitMQ already connected' as any)).to.be.true
    })

    it('should log and throw an error if connection fails', async () => {
      const connectionError = new Error('Connection failed')
      mockAmqpConnect.rejects(connectionError)
      const mockLoggerError = sandbox.stub(logger, 'error')

      try {
        await RabbitMQ.connect()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(connectionError)
        expect(mockLoggerError.calledWith('RabbitMQ connection error' as any)).to.be.true
      }
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

      try {
        await RabbitMQ.close()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(closeError)
        expect(mockLoggerError.calledWith('RabbitMQ disconnection error' as any)).to.be.true
      }
    })
  })
})
