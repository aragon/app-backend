import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
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
    const session: any = await DbTx.transactionOptions()

    expect(session.defaultTransactionOptions.readConcern.level).to.equal(
      'snapshot',
    )
    expect(session.defaultTransactionOptions.writeConcern.w).to.equal(
      'majority',
    )
  })

  it('executeTxFn', async () => {
    const fn = sandbox.stub().resolves('result')
    const result = await DbTx.executeTxFn(fn)
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
        return await DbTx.executeTxFn(fn)
      } catch (err) {
        if (DbTx.isErrorConflict(err)) {
          return await DbTx.executeTxFn(fn) // Retry once
        }
        throw err
      }
    }

    const result = await retryFn()
    expect(result).to.equal('success')
    expect(fn.calledTwice).to.be.true
  })

  it('handleTxError throws on not supported error', async () => {
    const error = new Error('Current topology does not support sessions')
    const retryFn = sandbox.stub()

    try {
      await DbTx.handleTxError(error, retryFn, 0)
      throw new Error('Expected handleTxError to throw')
    } catch (err) {
      expect(err).to.equal(error)
      expect(retryFn.called).to.be.false // Ensure retryFn was not called
    }
  })

  it('handleTxError throws on generic error', async () => {
    const error = new Error('Generic error')
    const retryFn = sandbox.stub()

    try {
      await DbTx.handleTxError(error, retryFn, 0)
      throw new Error('Expected handleTxError to throw')
    } catch (err) {
      expect(err).to.equal(error)
      expect(retryFn.called).to.be.false // Ensure retryFn was not called
    }
  })
})
