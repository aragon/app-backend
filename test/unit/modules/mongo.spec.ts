import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import mongoose from 'mongoose'
import Mongo from '@modules/mongo'
import config from '@config'
import { ModelProxy } from '@dbModels'
import Logger from '@logger'
import * as tsRetry from 'ts-retry-promise'

describe('Module: mongo', () => {
  let sandbox: SinonSandbox
  let originalRetryOptions: any
  let originalReadyState: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()

    // Save original values
    originalReadyState = Object.getOwnPropertyDescriptor(mongoose.connection, 'readyState')
    originalRetryOptions = {
      CONNECTION_RETRY: config.MONGO_DB.CONNECTION_RETRY,
      CONNECTION_TIMEOUT: config.MONGO_DB.CONNECTION_TIMEOUT,
      CONNECTION_DELAY: config.MONGO_DB.CONNECTION_DELAY,
    }

    // Ensure mongoose is in a clean state
    mongoose.connection.removeAllListeners()
  })

  afterEach(() => {
    sandbox?.restore()

    // Restore original retry options
    config.MONGO_DB.CONNECTION_RETRY = originalRetryOptions.CONNECTION_RETRY
    config.MONGO_DB.CONNECTION_TIMEOUT = originalRetryOptions.CONNECTION_TIMEOUT
    config.MONGO_DB.CONNECTION_DELAY = originalRetryOptions.CONNECTION_DELAY

    // Restore original readyState descriptor if it was modified
    if (originalReadyState) {
      Object.defineProperty(mongoose.connection, 'readyState', originalReadyState)
    }

    // Clean up mongoose
    mongoose.connection.removeAllListeners()
  })

  // Helper function to mock readyState
  function mockReadyState(value: number) {
    Object.defineProperty(mongoose.connection, 'readyState', {
      get: () => value,
      configurable: true,
    })
  }

  describe('connect', () => {
    it('returns immediately if already connected', async () => {
      const stubSetModels = sandbox.stub(ModelProxy, 'setMongoModels').resolves()
      const stubConnect = sandbox.stub(mongoose, 'connect').resolves()
      const syncIndexesStub = sandbox.stub(Mongo, 'syncIndexes').resolves()
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      // Mock already connected state
      mockReadyState(1)
      sandbox.stub(mongoose.connection, 'host').value('localhost')
      sandbox.stub(mongoose.connection, 'name').value('test-db')

      const result = await Mongo.connect()

      expect(result).to.equal(mongoose)
      expect(stubSetModels.calledOnce).to.be.true
      expect(stubConnect.called).to.be.false // Should not try to connect again
      expect(syncIndexesStub.called).to.be.false
      expect(loggerVerboseStub.calledWith('MongoDB already connected' as any)).to.be.true
    })

    it('syncs indexes if already connected and mongoSync is true', async () => {
      const stubSetModels = sandbox.stub(ModelProxy, 'setMongoModels').resolves()
      const stubConnect = sandbox.stub(mongoose, 'connect').resolves()
      const syncIndexesStub = sandbox.stub(Mongo, 'syncIndexes').resolves()

      // Mock already connected state
      mockReadyState(1)

      await Mongo.connect({ mongoSync: true })

      expect(stubSetModels.calledOnce).to.be.true
      expect(stubConnect.called).to.be.false
      expect(syncIndexesStub.calledOnce).to.be.true
    })

    it('waits for existing connection in progress', async () => {
      const stubSetModels = sandbox.stub(ModelProxy, 'setMongoModels').resolves()
      const stubConnect = sandbox.stub(mongoose, 'connect').resolves()
      const syncIndexesStub = sandbox.stub(Mongo, 'syncIndexes').resolves()
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      // Mock connecting state
      mockReadyState(2)

      const onceStub = sandbox.stub(mongoose.connection, 'once').callsFake((event, callback) => {
        if (event === 'connected') {
          // Simulate connection completing
          process.nextTick(() => {
            mockReadyState(1)
            callback()
          })
        }
        return mongoose.connection
      })

      await Mongo.connect({ mongoSync: true })

      expect(stubSetModels.calledOnce).to.be.true
      expect(stubConnect.called).to.be.false
      expect(onceStub.calledWith('connected')).to.be.true
      expect(syncIndexesStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('MongoDB connection already in progress' as any)).to.be.true
    })

    it('connects to MongoDB without syncing indexes by default', async () => {
      const stubSetModels = sandbox.stub(ModelProxy, 'setMongoModels').resolves()
      const stubConnect = sandbox.stub(mongoose, 'connect').resolves()
      const loggerInfoStub = sandbox.stub(Logger, 'info')
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')
      const syncIndexesStub = sandbox.stub(Mongo, 'syncIndexes').resolves()
      const removeAllListenersStub = sandbox.stub(mongoose.connection, 'removeAllListeners')

      // Mock disconnected state
      mockReadyState(0)

      const connectionEventStub = sandbox.stub(mongoose.connection, 'on').callsFake((event, callback) => {
        if (event === 'connected') {
          // Simulate connected event
          process.nextTick(() => callback())
        }
        return mongoose.connection
      })

      await Mongo.connect()

      expect(stubSetModels.calledOnce).to.be.true
      expect(stubConnect.calledOnce).to.be.true
      expect(
        stubConnect.calledWith(config.MONGO_DB.URI, {
          dbName: config.MONGO_DB.NAME,
          autoIndex: false,
          maxPoolSize: 50,
        }),
      ).to.be.true
      expect(syncIndexesStub.called).to.be.false // Should not sync by default
      expect(removeAllListenersStub.called).to.be.true // Should remove listeners first
      expect(loggerInfoStub.calledWith('MongoDB connected' as any)).to.be.true
      expect(loggerVerboseStub.calledWith('MongoDB try connecting' as any)).to.be.true
    })

    it('connects to MongoDB and syncs indexes when mongoSync is true', async () => {
      const stubSetModels = sandbox.stub(ModelProxy, 'setMongoModels').resolves()
      const stubConnect = sandbox.stub(mongoose, 'connect').resolves()
      const loggerInfoStub = sandbox.stub(Logger, 'info')
      const syncIndexesStub = sandbox.stub(Mongo, 'syncIndexes').resolves()

      mockReadyState(0) // Start disconnected
      sandbox.stub(mongoose.connection, 'removeAllListeners')
      sandbox.stub(mongoose.connection, 'on').callsFake((event, callback) => {
        if (event === 'connected') {
          process.nextTick(() => callback())
        }
        return mongoose.connection
      })

      await Mongo.connect({ mongoSync: true })

      expect(stubSetModels.calledOnce).to.be.true
      expect(stubConnect.calledOnce).to.be.true
      expect(syncIndexesStub.calledOnce).to.be.true
      expect(loggerInfoStub.calledWith('MongoDB connected' as any)).to.be.true
    })

    it('handles connection error', async () => {
      // Stub ts-retry to throw error immediately
      sandbox.stub(tsRetry, 'retry').callsFake(async (fn: any) => {
        try {
          return await fn({ current: 1 })
        } catch (error) {
          throw error
        }
      })

      const error = new Error('Connection failed')
      const stubSetModels = sandbox.stub(ModelProxy, 'setMongoModels').resolves()
      const stubConnect = sandbox.stub(mongoose, 'connect').rejects(error)
      const loggerWarnStub = sandbox.stub(Logger, 'warn')
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      mockReadyState(0) // Start disconnected
      sandbox.stub(mongoose.connection, 'removeAllListeners')

      // Mock the connection events to immediately trigger error after connect is called
      const onStub = sandbox.stub(mongoose.connection, 'on')
      onStub.callsFake((event, callback) => {
        if (event === 'error') {
          // Trigger error immediately
          process.nextTick(() => callback(error))
        }
        return mongoose.connection
      })

      try {
        await Mongo.connect()
        expect.fail('Should have thrown error')
      } catch (err: any) {
        expect(err.message).to.equal('Connection failed')
      }

      expect(stubSetModels.calledOnce).to.be.true
      expect(stubConnect.called).to.be.true
      // The logger.warn is called inside the error handler which may not be reached
      // due to the immediate rejection from retry stub
      expect(loggerVerboseStub.calledWith('MongoDB try connecting' as any)).to.be.true
    })

    it('handles syncIndexes error during connection', async () => {
      // Stub ts-retry to execute immediately
      sandbox.stub(tsRetry, 'retry').callsFake(async (fn: any) => {
        return await fn({ current: 1 })
      })

      const syncError = new Error('Sync indexes failed')
      const stubSetModels = sandbox.stub(ModelProxy, 'setMongoModels').resolves()
      const stubConnect = sandbox.stub(mongoose, 'connect').resolves()
      const syncIndexesStub = sandbox.stub(Mongo, 'syncIndexes').rejects(syncError)
      const loggerErrorStub = sandbox.stub(Logger, 'error')
      const loggerInfoStub = sandbox.stub(Logger, 'info')

      mockReadyState(0) // Start disconnected
      sandbox.stub(mongoose.connection, 'removeAllListeners')

      // Mock immediate connection success
      sandbox.stub(mongoose.connection, 'on').callsFake((event, callback) => {
        if (event === 'connected') {
          process.nextTick(() => callback())
        }
        return mongoose.connection
      })

      try {
        await Mongo.connect({ mongoSync: true })
        expect.fail('Should have thrown error')
      } catch (err: any) {
        expect(err.message).to.equal('Sync indexes failed')
      }

      expect(stubSetModels.calledOnce).to.be.true
      expect(stubConnect.called).to.be.true
      expect(syncIndexesStub.called).to.be.true
      // The error log happens inside syncIndexes which is stubbed,
      // so we just check that syncIndexes was called
    })

    it('handles retry mechanism properly', async () => {
      // Stub ts-retry for this test only to avoid actual retries
      sandbox.stub(tsRetry, 'retry').callsFake(async (fn: any, options?: any) => {
        let lastError: any
        for (let i = 0; i < 2; i++) {
          try {
            return await fn({ current: i + 1 })
          } catch (error) {
            lastError = error
          }
        }
        throw lastError
      })

      const stubSetModels = sandbox.stub(ModelProxy, 'setMongoModels').resolves()
      const stubConnect = sandbox
        .stub(mongoose, 'connect')
        .onFirstCall()
        .rejects(new Error('First attempt failed'))
        .onSecondCall()
        .resolves()

      mockReadyState(0) // Start disconnected
      sandbox.stub(mongoose.connection, 'removeAllListeners')

      // Set retry options with minimal delays
      config.MONGO_DB.CONNECTION_RETRY = 2
      config.MONGO_DB.CONNECTION_TIMEOUT = 10
      config.MONGO_DB.CONNECTION_DELAY = 0 // Remove delay between retries

      sandbox.stub(mongoose.connection, 'on').callsFake((event, callback) => {
        if (event === 'connected') {
          process.nextTick(() => callback())
        }
        return mongoose.connection
      })

      await Mongo.connect()

      expect(stubSetModels.calledOnce).to.be.true
      expect(stubConnect.calledTwice).to.be.true
    })

    it('waits if disconnecting before connecting', async () => {
      const stubSetModels = sandbox.stub(ModelProxy, 'setMongoModels').resolves()
      const stubConnect = sandbox.stub(mongoose, 'connect').resolves()

      // Start with disconnecting state
      mockReadyState(3)
      sandbox.stub(mongoose.connection, 'removeAllListeners')

      sandbox.stub(mongoose.connection, 'on').callsFake((event, callback) => {
        if (event === 'connected') {
          process.nextTick(() => callback())
        }
        return mongoose.connection
      })

      // Start connection
      const connectPromise = Mongo.connect()

      // Simulate disconnect completing
      setTimeout(() => {
        mockReadyState(0)
      }, 50)

      await connectPromise

      expect(stubSetModels.calledOnce).to.be.true
      expect(stubConnect.calledOnce).to.be.true
    })
  })

  describe('disconnect', () => {
    it('disconnects from MongoDB', async () => {
      const stubDisconnect = sandbox.stub(mongoose, 'disconnect').resolves()
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')
      mockReadyState(1) // Connected

      await Mongo.disconnect()

      expect(stubDisconnect.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('MongoDB disconnect' as any)).to.be.true
    })

    it('does nothing if already disconnected', async () => {
      const stubDisconnect = sandbox.stub(mongoose, 'disconnect').resolves()
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')
      mockReadyState(0) // Already disconnected

      await Mongo.disconnect()

      expect(stubDisconnect.called).to.be.false
      expect(loggerVerboseStub.calledWith('MongoDB already disconnected' as any)).to.be.true
    })
  })

  describe('syncIndexes', () => {
    it('syncs indexes successfully for all models', async () => {
      const syncIndexesStub1 = sandbox.stub().resolves()
      const syncIndexesStub2 = sandbox.stub().resolves()
      const loggerInfoStub = sandbox.stub(Logger, 'info')

      sandbox.stub(mongoose, 'models').value({
        Model1: { syncIndexes: syncIndexesStub1 },
        Model2: { syncIndexes: syncIndexesStub2 },
      })

      await Mongo.syncIndexes()

      expect(syncIndexesStub1.calledOnce).to.be.true
      expect(syncIndexesStub2.calledOnce).to.be.true
      expect(loggerInfoStub.calledWith('Starting index synchronization' as any)).to.be.true
      expect(loggerInfoStub.calledWith('MongoDB index synchronization completed' as any)).to.be.true
    })

    it('handles partial sync failure', async () => {
      const syncError = new Error('Sync failed')
      const syncIndexesStub1 = sandbox.stub().resolves()
      const syncIndexesStub2 = sandbox.stub().rejects(syncError)
      const loggerErrorStub = sandbox.stub(Logger, 'error')

      sandbox.stub(mongoose, 'models').value({
        Model1: { syncIndexes: syncIndexesStub1 },
        Model2: { syncIndexes: syncIndexesStub2 },
      })

      try {
        await Mongo.syncIndexes()
        expect.fail('Should have thrown error')
      } catch (err: any) {
        expect(err.message).to.equal('Index sync failed for models: Model2')
      }

      expect(syncIndexesStub1.calledOnce).to.be.true
      expect(syncIndexesStub2.calledOnce).to.be.true
      expect(loggerErrorStub.calledWith('Failed to sync indexes for model' as any)).to.be.true
    })
  })

  describe('drop', () => {
    it('drops all collections with documents', async () => {
      const countDocuments1 = sandbox.stub().resolves(10)
      const countDocuments2 = sandbox.stub().resolves(5)
      const deleteMany1 = sandbox.stub().resolves()
      const deleteMany2 = sandbox.stub().resolves()
      const loggerInfoStub = sandbox.stub(Logger, 'info')
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

      sandbox.stub(mongoose, 'models').value({
        Model1: { countDocuments: countDocuments1, deleteMany: deleteMany1 },
        Model2: { countDocuments: countDocuments2, deleteMany: deleteMany2 },
      })

      const result = await Mongo.drop()

      expect(result).to.be.true
      expect(countDocuments1.calledOnce).to.be.true
      expect(countDocuments2.calledOnce).to.be.true
      expect(deleteMany1.calledOnce).to.be.true
      expect(deleteMany2.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Dropped collection' as any)).to.be.true
      expect(loggerVerboseStub.calledWith('Dropped collection' as any)).to.be.true
      expect(loggerInfoStub.calledWith('MongoDB collections dropped' as any)).to.be.true
    })

    it('skips collections with no documents', async () => {
      const countDocuments1 = sandbox.stub().resolves(0)
      const countDocuments2 = sandbox.stub().resolves(5)
      const deleteMany1 = sandbox.stub().resolves()
      const deleteMany2 = sandbox.stub().resolves()
      const loggerVerboseStub = sandbox.stub(Logger, 'verbose')
      const loggerInfoStub = sandbox.stub(Logger, 'info')

      sandbox.stub(mongoose, 'models').value({
        Model1: { countDocuments: countDocuments1, deleteMany: deleteMany1 },
        Model2: { countDocuments: countDocuments2, deleteMany: deleteMany2 },
      })

      await Mongo.drop()

      expect(countDocuments1.calledOnce).to.be.true
      expect(countDocuments2.calledOnce).to.be.true
      expect(deleteMany1.called).to.be.false // Should not delete if count is 0
      expect(deleteMany2.calledOnce).to.be.true

      // Check that verbose was called only once (for Model2)
      expect(loggerVerboseStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Dropped collection' as any)).to.be.true

      // Check the info log
      expect(loggerInfoStub.calledWith('MongoDB collections dropped' as any)).to.be.true
    })
  })

  describe('isConnected', () => {
    it('returns true when connected', () => {
      mockReadyState(1)
      expect(Mongo.isConnected()).to.be.true
    })

    it('returns false when disconnected', () => {
      mockReadyState(0)
      expect(Mongo.isConnected()).to.be.false
    })

    it('returns false when connecting', () => {
      mockReadyState(2)
      expect(Mongo.isConnected()).to.be.false
    })
  })

  describe('getConnectionState', () => {
    it('returns correct state names', () => {
      const states = [
        { readyState: 0, expected: 'disconnected' },
        { readyState: 1, expected: 'connected' },
        { readyState: 2, expected: 'connecting' },
        { readyState: 3, expected: 'disconnecting' },
        { readyState: 99, expected: 'unknown' },
      ]

      states.forEach(({ readyState, expected }) => {
        mockReadyState(readyState)
        expect(Mongo.getConnectionState()).to.equal(expected)
      })
    })
  })

  describe('getConnectionStats', () => {
    it('returns connection statistics', () => {
      mockReadyState(1)
      sandbox.stub(mongoose.connection, 'host').value('localhost')
      sandbox.stub(mongoose.connection, 'port').value(27017)
      sandbox.stub(mongoose.connection, 'name').value('test-db')
      sandbox.stub(mongoose, 'models').value({
        Model1: {},
        Model2: {},
      })

      const stats = Mongo.getConnectionStats()

      expect(stats).to.deep.equal({
        state: 'connected',
        readyState: 1,
        host: 'localhost',
        port: 27017,
        database: 'test-db',
        models: 2,
      })
    })
  })

  describe('waitForConnection', () => {
    it('resolves immediately if already connected', async () => {
      mockReadyState(1)

      await expect(Mongo.waitForConnection(100)).to.be.fulfilled
    })

    it('waits for connection to be established', async () => {
      let currentState = 2

      // Use Object.defineProperty with a getter that returns the current value
      Object.defineProperty(mongoose.connection, 'readyState', {
        get: () => currentState,
        configurable: true,
      })

      const waitPromise = Mongo.waitForConnection(1000)

      // Simulate connection after 50ms
      setTimeout(() => {
        currentState = 1
      }, 50)

      await expect(waitPromise).to.be.fulfilled
    })

    it('times out if connection not established', async () => {
      mockReadyState(0)

      try {
        await Mongo.waitForConnection(100)
        expect.fail('Should have thrown timeout error')
      } catch (err: any) {
        expect(err.message).to.include('MongoDB connection timeout after 100ms')
      }
    })
  })
})
