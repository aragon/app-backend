import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import mongoose from 'mongoose'
import Mongo from '@modules/mongo'
import config from '@config'
import { ModelProxy } from '@dbModels'
import Logger from '@logger'
import Utils from '@helpers/utils'

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

    Object.values(mongoose.models).map(model => {
      sandbox.stub(model, 'syncIndexes').resolves()
    })

    await Mongo.connect()
    mongoose.connection.emit('connected')
    await Utils.wait(10)

    expect(loggerInfoStub.calledOnce).to.be.true
    expect(stubSetModels.calledOnce).to.be.true
    expect(stubConnect.calledOnce).to.be.true
    expect(stubConnect.calledWith(config.MONGO_DB.URI, sandbox.match.object)).to.be.true
  })

  it('error connects to MongoDB and syncs indexes', async () => {
    const stubSetModels = sandbox.stub(ModelProxy, 'setMongoModels').resolves()
    const stubConnect = sandbox.stub(mongoose, 'connect').resolves()
    const loggerVerboseStub = sandbox.stub(Logger, 'verbose')

    Object.values(mongoose.models).map(model => {
      sandbox.stub(model, 'syncIndexes').resolves()
    })

    await Mongo.connect()
    mongoose.connection.emit('error')
    await Utils.wait(10)

    expect(loggerVerboseStub.calledThrice).to.be.true
    expect(stubSetModels.calledOnce).to.be.true
    expect(stubConnect.calledOnce).to.be.true
    expect(stubConnect.calledWith(config.MONGO_DB.URI, sandbox.match.object)).to.be.true
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
})
