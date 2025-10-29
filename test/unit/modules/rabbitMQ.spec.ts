import { expect } from 'chai'
import sinon, { SinonSandbox } from 'sinon'
import * as amqpConnectionManager from 'amqp-connection-manager'
import config from '@config'
import logger from '@logger'
import RabbitMQ from '@modules/rabbitMQ'
import { EnumQueueName } from '@types'
import { EventEmitter } from 'events'

describe('Modules: RabbitMQ', () => {
  let sandbox: SinonSandbox
  let mockConnection: any
  let mockChannel: any
  let connectStub: sinon.SinonStub

  beforeEach(() => {
    sandbox = sinon.createSandbox()

    // Reset RabbitMQ state
    RabbitMQ.connection = null
    RabbitMQ.channelsMap.clear()
    if (RabbitMQ.noopInterval) {
      clearInterval(RabbitMQ.noopInterval)
      RabbitMQ.noopInterval = null
    }

    // Create mock objects
    mockChannel = {
      on: sandbox.stub(),
      assertQueue: sandbox.stub().resolves(),
      checkQueue: sandbox.stub().resolves(),
      addSetup: sandbox.stub().resolves(),
    }

    // Mock connection extends EventEmitter for proper event handling
    class MockConnection extends EventEmitter {
      isConnected = sandbox.stub().returns(false)
      createChannel = sandbox.stub().returns(mockChannel)
      close = sandbox.stub().resolves()
    }

    mockConnection = new MockConnection()

    // Stub the connect method
    connectStub = sandbox.stub(amqpConnectionManager, 'connect').returns(mockConnection as any)
  })

  afterEach(() => {
    sandbox.restore()
    if (RabbitMQ.noopInterval) {
      clearInterval(RabbitMQ.noopInterval)
      RabbitMQ.noopInterval = null
    }
  })

  describe('connect', () => {
    it('should establish a connection and set up channels', async () => {
      const loggerInfoStub = sandbox.stub(logger, 'info')
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const startNoopIntervalStub = sandbox.stub(RabbitMQ, 'startNoopInterval')

      // Start connection
      const connectPromise = RabbitMQ.connect()

      // Simulate successful connection
      process.nextTick(() => {
        mockConnection.emit('connect')
      })

      const result = await connectPromise

      expect(result).to.be.true
      expect(connectStub.calledOnce).to.be.true
      expect(
        connectStub.calledWith([config.RABBITMQ.URI], {
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

      expect(RabbitMQ.channelsMap.size).to.equal(Object.values(EnumQueueName).length)
      expect(loggerInfoStub.calledWith('RabbitMQ connected' as any)).to.be.true
      expect(startNoopIntervalStub.calledOnce).to.be.true

      for (const queueName of Object.values(EnumQueueName)) {
        expect(RabbitMQ.channelsMap.has(queueName)).to.be.true
      }
    })

    it('should handle channel setup errors', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const startNoopIntervalStub = sandbox.stub(RabbitMQ, 'startNoopInterval')

      const setupError = new Error('Queue assertion failed')
      mockChannel.assertQueue.rejects(setupError)

      // Override createChannel to capture setup function
      let setupFunction: any
      mockConnection.createChannel = sandbox.stub().callsFake((options: any) => {
        if (options.setup) {
          setupFunction = options.setup
        }
        return mockChannel
      })

      // Start connection
      const connectPromise = RabbitMQ.connect()

      // Simulate successful connection
      process.nextTick(() => {
        mockConnection.emit('connect')
      })

      await connectPromise

      // Now test the setup function error handling
      try {
        await setupFunction(mockChannel)
        expect.fail('Should have thrown error')
      } catch (err) {
        expect(err).to.equal(setupError)
        expect(loggerErrorStub.calledWith('Failed to set up channel for queue' as any)).to.be.true
      }
    })

    it('should not reconnect if already connected', async () => {
      // Set up already connected state
      RabbitMQ.connection = mockConnection
      mockConnection.isConnected.returns(true)

      const result = await RabbitMQ.connect()

      expect(result).to.be.true
      expect(connectStub.called).to.be.false
    })

    it('should handle connection timeout', async () => {
      // Override timeout to be very short
      const originalTimeout = config.RABBITMQ.TIMEOUT
      config.RABBITMQ.TIMEOUT = 100

      const loggerErrorStub = sandbox.stub(logger, 'error')

      try {
        await RabbitMQ.connect()
        expect.fail('Should have thrown timeout error')
      } catch (err: any) {
        expect(err.message).to.equal('RabbitMQ connection timeout')
        expect(loggerErrorStub.calledWith('RabbitMQ connection timeout' as any)).to.be.true
      } finally {
        config.RABBITMQ.TIMEOUT = originalTimeout
      }
    })

    it('should handle disconnect event during connection', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      const disconnectError = new Error('Connection lost')

      // Start connection
      const connectPromise = RabbitMQ.connect()

      // Simulate disconnect before connect
      process.nextTick(() => {
        mockConnection.emit('disconnect', disconnectError)
      })

      try {
        await connectPromise
        expect.fail('Should have thrown error')
      } catch (err: any) {
        expect(err.message).to.include('RabbitMQ connection failed: Connection lost')
        expect(loggerErrorStub.calledWith('RabbitMQ disconnected' as any)).to.be.true
      }
    })

    it('should handle connectFailed event', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      const stopNoopIntervalStub = sandbox.stub(RabbitMQ, 'stopNoopInterval')
      const connectError = new Error('Failed to connect')

      // Start connection
      const connectPromise = RabbitMQ.connect()

      // Simulate connect failed
      process.nextTick(() => {
        mockConnection.emit('connectFailed', connectError)
      })

      // For connectFailed, it resolves to true but logs error
      const result = await connectPromise
      expect(result).to.be.true
      expect(loggerErrorStub.calledWith('RabbitMQ connect failed' as any)).to.be.true
      expect(loggerErrorStub.calledWith('RabbitMQ connection failed' as any)).to.be.true
      expect(stopNoopIntervalStub.calledOnce).to.be.true
    })

    it('should handle disconnect event when already connected', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      const stopNoopIntervalStub = sandbox.stub(RabbitMQ, 'stopNoopInterval')

      // Start connection
      const connectPromise = RabbitMQ.connect()

      // First emit connect to resolve promise
      process.nextTick(() => {
        mockConnection.emit('connect')
      })

      await connectPromise

      // Now emit disconnect after connection (covers lines 66-70 when promiseResolved is true)
      const disconnectError = new Error('Connection lost after connect')
      mockConnection.emit('disconnect', disconnectError)

      expect(loggerErrorStub.calledWith('RabbitMQ disconnected' as any)).to.be.true
      expect(stopNoopIntervalStub.called).to.be.true
    })

    it('should not resolve multiple times on multiple connect events', async () => {
      sandbox.stub(logger, 'info')
      const startNoopIntervalStub = sandbox.stub(RabbitMQ, 'startNoopInterval')

      // Start connection
      const connectPromise = RabbitMQ.connect()

      // Emit connect twice (covers lines 55-58)
      process.nextTick(() => {
        mockConnection.emit('connect')
        mockConnection.emit('connect') // Second connect should not resolve again
      })

      const result = await connectPromise
      expect(result).to.be.true

      // startNoopInterval should be called twice even though promise resolves once
      expect(startNoopIntervalStub.calledTwice).to.be.true
    })

    it('should handle disconnection and log an error', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      const stopNoopIntervalStub = sandbox.stub(RabbitMQ, 'stopNoopInterval')

      // Start connection
      const connectPromise = RabbitMQ.connect()

      // Simulate successful connection first
      process.nextTick(() => {
        mockConnection.emit('connect')
      })

      await connectPromise

      // Now simulate disconnect
      mockConnection.emit('disconnect', new Error('Lost connection'))

      expect(loggerErrorStub.calledWith('RabbitMQ disconnected' as any)).to.be.true
      expect(stopNoopIntervalStub.calledOnce).to.be.true
    })
  })

  describe('isConnected', () => {
    it('should return false when no connection', () => {
      expect(RabbitMQ.isConnected()).to.be.false
    })

    it('should return true when connected', () => {
      RabbitMQ.connection = mockConnection
      mockConnection.isConnected.returns(true)

      expect(RabbitMQ.isConnected()).to.be.true
    })
  })

  describe('getStatus', () => {
    it('should return correct status', () => {
      RabbitMQ.connection = mockConnection
      mockConnection.isConnected.returns(true)
      RabbitMQ.channelsMap.set(EnumQueueName.contractInfo, mockChannel)

      const status = RabbitMQ.getStatus()

      expect(status).to.deep.equal({
        connected: true,
        uri: config.RABBITMQ.URI,
        channels: 1,
      })
    })
  })

  describe('getChannel', () => {
    it('should return the correct channel for a queue', () => {
      const queueName = EnumQueueName.contractInfo
      RabbitMQ.connection = mockConnection
      RabbitMQ.channelsMap.set(queueName, mockChannel)

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
      RabbitMQ.connection = mockConnection

      expect(() => RabbitMQ.getChannel(queueName)).to.throw(`No channel found for queue "${queueName}"`)
    })
  })

  describe('close', () => {
    it('should close the connection and log the event', async () => {
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const stopNoopIntervalStub = sandbox.stub(RabbitMQ, 'stopNoopInterval')

      RabbitMQ.connection = mockConnection
      RabbitMQ.channelsMap.set(EnumQueueName.contractInfo, mockChannel)

      await RabbitMQ.close()

      expect(mockConnection.close.calledOnce).to.be.true
      expect(stopNoopIntervalStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('RabbitMQ connection closed' as any)).to.be.true
      expect(RabbitMQ.connection).to.be.null
      expect(RabbitMQ.channelsMap.size).to.equal(0)
    })

    it('should log a warning if an error occurs during closing', async () => {
      const loggerWarnStub = sandbox.stub(logger, 'warn')
      const closeError = new Error('Close failed')
      mockConnection.close.rejects(closeError)

      RabbitMQ.connection = mockConnection

      await RabbitMQ.close()

      expect(loggerWarnStub.calledWith('Error closing RabbitMQ connection' as any)).to.be.true
      expect(RabbitMQ.connection).to.be.null
    })

    it('should do nothing if connection is null', async () => {
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      RabbitMQ.connection = null

      await RabbitMQ.close()

      expect(mockConnection.close.called).to.be.false
      expect(loggerVerboseStub.called).to.be.false
    })
  })

  describe('startNoopInterval', () => {
    let clock: sinon.SinonFakeTimers

    beforeEach(() => {
      clock = sandbox.useFakeTimers()
    })

    afterEach(() => {
      clock.restore()
    })

    it('should create an interval and perform noop operations', async () => {
      const loggerInfoStub = sandbox.stub(logger, 'info')
      const addSetupStub = sandbox.stub().resolves()

      mockChannel.addSetup = addSetupStub
      RabbitMQ.channelsMap.set(EnumQueueName.contractInfo, mockChannel)

      RabbitMQ.startNoopInterval()

      expect(RabbitMQ.noopInterval).to.not.be.null
      expect(loggerInfoStub.calledWith('Starting noop interval' as any)).to.be.true

      // Advance time to trigger interval
      const intervalMs = (config.RABBITMQ.HEARTBEAT_INTERVAL_SECONDS * 1000) / 2
      await clock.tickAsync(intervalMs)

      expect(addSetupStub.calledOnce).to.be.true

      // Verify the setup function works correctly
      const setupFn = addSetupStub.getCall(0).args[0]
      const mockConfirmChannel = { checkQueue: sandbox.stub().resolves() }
      await setupFn(mockConfirmChannel)

      expect(mockConfirmChannel.checkQueue.calledWith(EnumQueueName.contractInfo)).to.be.true
    })

    it('should handle errors during noop operation', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      sandbox.stub(logger, 'info')

      const addSetupStub = sandbox.stub().rejects(new Error('Noop failed'))
      mockChannel.addSetup = addSetupStub
      RabbitMQ.channelsMap.set(EnumQueueName.contractInfo, mockChannel)

      RabbitMQ.startNoopInterval()

      // Advance time to trigger interval
      const intervalMs = (config.RABBITMQ.HEARTBEAT_INTERVAL_SECONDS * 1000) / 2
      await clock.tickAsync(intervalMs)

      expect(loggerErrorStub.calledWith('Noop operation failed' as any)).to.be.true
    })

    it('should clear existing interval before creating a new one', () => {
      sandbox.stub(logger, 'info')

      // Set up existing interval
      const existingInterval = setInterval(() => {}, 1000)
      RabbitMQ.noopInterval = existingInterval

      RabbitMQ.startNoopInterval()

      expect(RabbitMQ.noopInterval).to.not.equal(existingInterval)
    })
  })

  describe('stopNoopInterval', () => {
    it('should clear interval and log verbose message', () => {
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      RabbitMQ.noopInterval = setInterval(() => {}, 1000)

      RabbitMQ.stopNoopInterval()

      expect(RabbitMQ.noopInterval).to.be.null
      expect(loggerVerboseStub.calledWith('Stopped noop interval' as any)).to.be.true
    })
  })
})
