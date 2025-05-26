import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'
import { connect, AmqpConnectionManager, ChannelWrapper } from 'amqp-connection-manager'
import config from '@config'
import logger from '@logger'
import RabbitMQ from '@modules/rabbitMQ'
import { EnumQueueName } from '@types'
import proxyquire from 'proxyquire'
import { ConfirmChannel } from 'amqplib'
import Utils from '@helpers/utils'

describe('Modules: RabbitMQ', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    RabbitMQ.connection = null
    RabbitMQ.channelsMap.clear()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('connect', () => {
    it('should establish a connection and set up channels', async () => {
      const connectionStub = {
        on: sandbox.stub(),
        createChannel: sandbox.stub().returns({
          on: sandbox.stub(),
          assertQueue: sandbox.stub().resolves(),
        }),
      }

      const connectStub = sandbox.stub().returns(connectionStub)

      const RabbitMQWrapper = proxyquire.noCallThru()('@modules/rabbitMQ', {
        'amqp-connection-manager': { connect: connectStub },
      }).default

      const startNoopIntervalStub = sandbox.stub(RabbitMQWrapper, 'startNoopInterval')
      // Simulate the 'connect' event being emitted
      setTimeout(() => {
        connectionStub.on.getCall(0).args[1]()
      }, 10)

      await RabbitMQWrapper.connect()

      expect(RabbitMQWrapper.channelsMap.size).to.eq(Object.values(EnumQueueName).length)
      expect(
        connectStub.calledOnceWith([config.RABBITMQ.URI], {
          heartbeatIntervalInSeconds: config.RABBITMQ.HEARTBEAT_INTERVAL_SECONDS,
          reconnectTimeInSeconds: config.RABBITMQ.RECONNECT_TIME_SECONDS,
          connectionOptions: {
            noDelay: true,
            keepAlive: true,
            keepAliveDelay: 60000,
            timeout: 10000,
          },
        }),
      ).to.be.true
      expect(startNoopIntervalStub.calledOnce).to.be.true
    })

    it('should handle disconnection and log an error', async () => {
      const loggerStub = sandbox.stub(logger, 'error')
      const disconnectError = new Error('Connection lost')
      const connectionStub = {
        on: sandbox.stub(),
        createChannel: sandbox.stub().returns({
          on: sandbox.stub(),
          assertQueue: sandbox.stub().resolves(),
        }),
      }

      const connectStub = sandbox.stub().returns(connectionStub)

      const RabbitMQWrapper = proxyquire.noCallThru()('@modules/rabbitMQ', {
        'amqp-connection-manager': { connect: connectStub },
      }).default

      // Simulate the 'disconnect' event being emitted
      setTimeout(() => {
        connectionStub.on.withArgs('disconnect').callArgWith(1, disconnectError)
      }, 10)

      await RabbitMQWrapper.connect()

      expect(loggerStub.calledWith('RabbitMQ disconnected' as any)).to.be.true
    })

    it('should not reconnect if already connected', async () => {
      const mockConnection = { on: sandbox.stub() } as unknown as AmqpConnectionManager
      RabbitMQ.connection = mockConnection

      const mockConnect = sandbox.stub().returns(mockConnection)
      sandbox.stub(connect as any, 'bind').returns(mockConnect as any)

      await RabbitMQ.connect()

      expect(mockConnect.notCalled).to.be.true
    })
  })

  describe('getChannel', () => {
    it('should return the correct channel for a queue', () => {
      const queueName = EnumQueueName.contractInfo
      const mockChannel = { sendToQueue: sandbox.stub() } as unknown as ChannelWrapper
      RabbitMQ.channelsMap.set(queueName, mockChannel)

      RabbitMQ.connection = true as any
      const channel = RabbitMQ.getChannel(queueName)
      expect(channel).to.equal(mockChannel)
    })

    it('should throw an error if RabbitMQ is not connected', () => {
      const queueName = EnumQueueName.contractInfo
      RabbitMQ.connection = null

      expect(() => RabbitMQ.getChannel(queueName)).to.throw('RabbitMQ is not connected. Call RabbitMQ.connect() first.')
    })

    it('should throw an error if no channel exists for a queue', () => {
      const queueName = EnumQueueName.contractInfo
      RabbitMQ.connection = {} as AmqpConnectionManager // Mock connected state

      expect(() => RabbitMQ.getChannel(queueName)).to.throw(`No channel found for queue "${queueName}"`)
    })
  })

  describe('close', () => {
    it('should close the connection and log the event', async () => {
      const mockLoggerVerbose = sandbox.stub(logger, 'verbose')
      const mockConnection = {
        close: sandbox.stub().resolves(),
      }

      RabbitMQ.connection = mockConnection as any

      await RabbitMQ.close()

      expect(mockConnection.close.calledOnce).to.be.true
      expect(mockLoggerVerbose.calledWith('RabbitMQ connection closed' as any)).to.be.true
    })

    it('should log a warning if an error occurs during closing', async () => {
      const mockLoggerWarn = sandbox.stub(logger, 'warn')
      const mockConnection = {
        close: sandbox.stub().rejects(new Error('Close error')),
      } as unknown as AmqpConnectionManager

      RabbitMQ.connection = mockConnection

      await RabbitMQ.close()

      expect(mockLoggerWarn.calledWith('Error closing RabbitMQ connection' as any)).to.be.true
      expect(RabbitMQ.connection).to.be.null
    })
  })

  describe('startNoopInterval', () => {
    it('should create an interval and perform noop operations', async () => {
      const oldConfig = config.RABBITMQ.HEARTBEAT_INTERVAL_SECONDS

      config.RABBITMQ.HEARTBEAT_INTERVAL_SECONDS = 1
      const intervalMs = (config.RABBITMQ.HEARTBEAT_INTERVAL_SECONDS * 1000) / 2
      const addSetupStub = sandbox.stub().resolves()
      const checkQueueStub = sandbox.stub().resolves()
      const mockChannel = {
        addSetup: addSetupStub,
      } as unknown as ChannelWrapper

      const mockConfirmChannel = {
        checkQueue: checkQueueStub,
      } as unknown as ConfirmChannel

      // Set up channelsMap with a test channel
      RabbitMQ.channelsMap.set(EnumQueueName.contractInfo, mockChannel)

      sandbox.stub(logger, 'info')

      RabbitMQ.startNoopInterval()
      await Utils.wait(intervalMs)

      expect(RabbitMQ.noopInterval).to.not.be.null
      // Verify that checkQueue is called via addSetup
      expect(addSetupStub.calledOnce).to.be.true
      const setupFn = addSetupStub.getCall(0).args[0]
      await setupFn(mockConfirmChannel, () => {})
      expect(checkQueueStub.calledOnceWith(EnumQueueName.contractInfo)).to.be.true
      config.RABBITMQ.HEARTBEAT_INTERVAL_SECONDS = oldConfig
    })

    it('should handle errors during noop operation', async () => {
      const oldConfig = config.RABBITMQ.HEARTBEAT_INTERVAL_SECONDS
      config.RABBITMQ.HEARTBEAT_INTERVAL_SECONDS = 1
      const intervalMs = (config.RABBITMQ.HEARTBEAT_INTERVAL_SECONDS * 1000) / 2
      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(logger, 'info')
      const mockChannel = {
        addSetup: sandbox.stub().rejects(new Error('Noop error')),
      } as unknown as ChannelWrapper

      RabbitMQ.channelsMap.set(EnumQueueName.contractInfo, mockChannel)

      RabbitMQ.startNoopInterval()

      await Utils.wait(intervalMs)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Noop operation failed' as any)).to.be.true
      config.RABBITMQ.HEARTBEAT_INTERVAL_SECONDS = oldConfig
    })

    it('should clear existing interval before creating a new one', () => {
      sandbox.stub(logger, 'info')

      RabbitMQ.noopInterval = setInterval(() => {}, 1000) as unknown as NodeJS.Timeout

      RabbitMQ.startNoopInterval()

      expect(RabbitMQ.noopInterval).to.be.not.eq(null)

      RabbitMQ.stopNoopInterval()
    })
  })

  describe('stopNoopInterval', () => {
    it('should clear interval and log verbose message', () => {
      RabbitMQ.noopInterval = setInterval(() => {}, 1000) as unknown as NodeJS.Timeout

      const verboseStub = sandbox.stub(logger, 'verbose')
      RabbitMQ.noopInterval = {} as NodeJS.Timeout

      RabbitMQ.stopNoopInterval()

      expect(RabbitMQ.noopInterval).to.be.null
      expect(verboseStub.calledWith('Stopped noop interval' as any)).to.be.true
    })
  })
})
