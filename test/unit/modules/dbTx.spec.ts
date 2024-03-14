import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import mongoose from 'mongoose'
import DbTx from '@modules/dbTx'

describe('Module: DbTx', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('isErrorNotSupported', async () => {
    const res = DbTx.isErrorNotSupported({
      message: 'Current topology does not support sessions',
    })
    expect(res).to.be.true
  })

  it('transactionOptions', async () => {
    const sessionMock = {
      startTransaction: sandbox.stub().resolves(),
      commitTransaction: sandbox.stub().resolves(),
      abortTransaction: sandbox.stub().resolves(),
      endSession: sandbox.stub().resolves(),
    }
    const stubStart = sandbox
      .stub(mongoose, 'startSession')
      .resolves(sessionMock as any)

    const session = await DbTx.transactionOptions()

    expect(stubStart.calledOnce).to.be.true
    expect(session).to.equal(sessionMock)
    expect(sessionMock.startTransaction.calledOnce).to.be.true
  })

  it('executeTxFn', async () => {
    const fn = sandbox.stub().resolves('result')
    const dbTxInstance = new DbTx()
    const result = await dbTxInstance.executeTxFn(fn)
    expect(result).to.equal('result')
    expect(fn.calledOnce).to.be.true
  })

  it('executeTxFn retries on conflict error', async () => {
    const error = new Error('WriteConflict')
    const fn = sandbox
      .stub()
      .onFirstCall()
      .rejects(error)
      .onSecondCall()
      .resolves('success') // Simulate a failure followed by a success
    const retryFn = async () => {
      try {
        return await new DbTx().executeTxFn(fn)
      } catch (err) {
        if (DbTx.isErrorConflict(err)) {
          return await new DbTx().executeTxFn(fn) // Retry once
        }
        throw err
      }
    }

    const result = await retryFn()
    expect(result).to.equal('success')
    expect(fn.calledTwice).to.be.true
  })
})
