import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import mongoose from 'mongoose'
import Mongo from '@modules/mongo'
import config from '@config'
import { ModelProxy } from '@dbModels'
import Logger from '@logger'

describe('Module: mongo', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('connects to MongoDB and syncs indexes', async () => {
    const stubSetModels = sandbox.stub(ModelProxy, 'setMongoModels').resolves()
    const stubConnect = sandbox.stub(mongoose, 'connect').resolves()
    const loggerInfoStub = sandbox.stub(Logger, 'info')
    const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

    Object.values(mongoose.models).forEach(model => {
      sandbox.stub(model, 'syncIndexes').resolves()
    })

    sandbox.stub(mongoose.connection, 'on').callsFake((event, callback) => {
      if (event === 'connected') {
        process.nextTick(callback)
      }
      return mongoose.connection
    })

    await Mongo.connect()

    expect(loggerInfoStub.calledOnce).to.be.true
    expect(loggerVerboseStub.calledOnce).to.be.true
    expect(stubSetModels.calledOnce).to.be.true
    expect(stubConnect.calledOnce).to.be.true
    expect(stubConnect.calledWith(config.MONGO_DB.URI, sandbox.match.object)).to.be.true
  })

  it('handles connection error to MongoDB', async () => {
    const stubSetModels = sandbox.stub(ModelProxy, 'setMongoModels').resolves()
    const stubConnect = sandbox.stub(mongoose, 'connect').resolves()
    const loggerVerboseStub = sandbox.stub(Logger, 'warn')

    Object.values(mongoose.models).map(model => {
      sandbox.stub(model, 'syncIndexes').resolves()
    })

    sandbox.stub(mongoose.connection, 'on').callsFake((event, callback) => {
      if (event === 'error') {
        process.nextTick(() => callback(new Error('Connection error')))
      }
      return mongoose.connection
    })

    try {
      await Mongo.connect()
    } catch (err) {}

    expect(loggerVerboseStub.calledWith('MongoDB connection error' as any)).to.be.true
    expect(stubSetModels.calledOnce).to.be.true
    expect(stubConnect.calledOnce).to.be.false
  })

  it('disconnects from MongoDB', async () => {
    const stubDisconnect = sandbox.stub(mongoose, 'disconnect').resolves()

    await Mongo.disconnect()
    expect(stubDisconnect.calledOnce).to.be.true
  })

  it('drops collections', async () => {
    const deleteMany = sandbox.stub().resolves()

    sandbox.stub(mongoose, 'models').value({
      ModelName: { deleteMany },
    })

    await Mongo.drop()
    expect(deleteMany.calledOnce).to.be.true
  })

  it('handles syncIndexes error during connection', async () => {
    const connectionRetry = config.MONGO_DB.CONNECTION_RETRY
    const connectionTimeout = config.MONGO_DB.CONNECTION_TIMEOUT
    const connectionDelay = config.MONGO_DB.CONNECTION_DELAY
    config.MONGO_DB.CONNECTION_RETRY = 1
    config.MONGO_DB.CONNECTION_TIMEOUT = 10
    config.MONGO_DB.CONNECTION_DELAY = 5

    const stubSetModels = sandbox.stub(ModelProxy, 'setMongoModels').resolves()
    sandbox.stub(mongoose, 'connect').resolves()
    const loggerWarnStub = sandbox.stub(Logger, 'warn')
    const loggerInfoStub = sandbox.stub(Logger, 'info')

    Object.values(mongoose.models).forEach(model => {
      sandbox.stub(model, 'syncIndexes').rejects(new Error('Sync indexes error'))
    })

    sandbox.stub(mongoose.connection, 'on').callsFake((event, callback) => {
      if (event === 'connected') {
        process.nextTick(callback)
      }
      return mongoose.connection
    })

    try {
      await Mongo.connect()
    } catch (err: any) {
      expect(err.message).to.equal('Timeout after 5000ms')
    }

    expect(loggerWarnStub.notCalled).to.be.true
    expect(loggerInfoStub.notCalled).to.be.true
    expect(stubSetModels.calledOnce).to.be.true

    config.MONGO_DB.CONNECTION_RETRY = connectionRetry
    config.MONGO_DB.CONNECTION_TIMEOUT = connectionTimeout
    config.MONGO_DB.CONNECTION_DELAY = connectionDelay
  })
})
