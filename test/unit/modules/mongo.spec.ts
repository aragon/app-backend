import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import mongoose from 'mongoose'
import Mongo from '@modules/mongo'
import config from '@config'
import { ModelProxy } from '@dbModels'

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

    await Mongo.connect()

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
