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
    expect(stubConnect.calledWith(config.MONGO_DB.URI, sandbox.match.object)).to
      .be.true
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

  it('isErrorConflict', async () => {
    const res = Mongo.isErrorConflict({ message: 'WriteConflict' })
    expect(res).to.be.true
  })

  it('isErrorNotSupported', async () => {
    const res = Mongo.isErrorNotSupported({
      message: 'Current topology does not support sessions',
    })
    expect(res).to.be.true
  })

  it('transactionOptions', async () => {
    const stubStart = sandbox
      .stub(mongoose.connection, 'startSession')
      .returns({
        startTransaction: sandbox.stub().resolves(),
        commitTransaction: sandbox.stub().resolves(),
        abortTransaction: sandbox.stub().resolves(),
        endSession: sandbox.stub().resolves(),
      } as any)

    await Mongo.transactionOptions()

    expect(stubStart.calledOnce).to.be.true
    expect(
      stubStart.calledWith({
        readConcern: { level: 'snapshot' },
        writeConcern: { w: 'majority' },
      } as any),
    ).to.be.true
  })

  it('executeTxFn', async () => {
    const fn = sandbox.stub().resolves('result')
    const result = await Mongo.executeTxFn(fn)
    expect(result).to.equal('result')
    expect(fn.called).to.be.true
  })

  it('executeTxFn retries on conflict error', async () => {
    const error = new Error('WriteConflict')
    const fn = sandbox.stub().rejects(error)
    const stubError = sandbox
      .stub(Mongo, 'handleTxError')
      .callsFake(async () => {
        throw error
      })

    try {
      await Mongo.executeTxFn(fn)
      throw new Error('Expected to throw')
    } catch (caughtError) {
      expect(caughtError).to.equal(error)
      expect(fn.called).to.be.true
      expect(stubError.calledWith(error, sandbox.match.func)).to.be.true
    }
  })
})
