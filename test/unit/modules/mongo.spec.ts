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
    const stubSetModels = sandbox.stub(ModelProxy, 'setMongoModels').resolves();
    const stubConnect = sandbox.stub(mongoose, 'connect').resolves();
    const loggerVerboseStub = sandbox.stub(Logger, 'warn');

    Object.values(mongoose.models).map(model => {
      sandbox.stub(model, 'syncIndexes').resolves();
    });

    sandbox.stub(mongoose.connection, 'on').callsFake((event, callback) => {
      if (event === 'error') {
        process.nextTick(() => callback(new Error('Connection error')));
      }
      return mongoose.connection;
    });

    try {
      await Mongo.connect();
    } catch (err) {
    }

    expect(loggerVerboseStub.calledWith(sinon.match('MongoDB connection error'))).to.be.true;
    expect(stubSetModels.calledOnce).to.be.true;
    expect(stubConnect.calledOnce).to.be.false;
  });

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
})
