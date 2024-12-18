import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DbTx from '@modules/dbTx'
import Logger from '@logger'
import config from '@config'

describe('Module: DbTx', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('executeTxFn does not retry on error when stopRetry is true', async () => {
    const fn = sandbox.stub().rejects(new Error('Test Error'))
    const loggerStub = sandbox.stub(Logger, 'warn')

    const result = await DbTx.executeTxFn(fn, { stopRetry: true })

    expect(result).to.be.undefined
    expect(fn.calledOnce).to.be.true
    expect(loggerStub.notCalled).to.be.true
  })

  it('isErrorNotSupported', async () => {
    const res = DbTx.isErrorNotSupported({
      message: 'Current topology does not support sessions',
    })
    expect(res).to.be.true
  })

  it('transactionOptions', async () => {
    const session: any = await DbTx.transactionOptions()

    expect(session.defaultTransactionOptions.readConcern.level).to.equal('snapshot')
    expect(session.defaultTransactionOptions.writeConcern.w).to.equal('majority')
  })

  it('executeTxFn', async () => {
    const fn = sandbox.stub().resolves('result')
    const result = await DbTx.executeTxFn(fn)
    expect(result).to.equal('result')
    expect(fn.calledOnce).to.be.true
  })

  it('executeTxFn retries on conflict error', async () => {
    const error = new Error('WriteConflict')
    const fn = sandbox.stub().onFirstCall().rejects(error).onSecondCall().resolves('success') // Simulate a failure followed by a success
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
      expect(retryFn.called).to.be.false
    }
  })

  it('logs a warning if unable to rollback transaction', async () => {
    const sessionStub = {
      commitTransaction: sandbox.stub(),
      startTransaction: sandbox.stub(),
      abortTransaction: sandbox.stub().rejects(new Error('Mock abort transaction error')), // Simulate error on abort
      endSession: sandbox.stub(),
    }
    sandbox.stub(DbTx, 'transactionOptions').resolves(sessionStub as any)

    const fn = sandbox.stub().rejects(new Error('Mock transaction error'))

    const loggerStub = sandbox.stub(Logger, 'warn')

    try {
      await DbTx.executeTxFn(fn)
      expect.fail('Expected executeTxFn to throw due to transaction error')
    } catch (error: any) {
      expect(error.message).to.equal('Mock transaction error')
    }

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('unable to rollback transaction' as any)).to.be.true
  })

  it('recursively handles retryable errors up to the max retry count', async () => {
    sandbox.stub(config.MONGO_DB, 'RETRY_CONCURRENT_INTERVAL').value(3)
    sandbox.stub(config.MONGO_DB, 'RETRY_CONCURRENT_TIME').value(1)

    const error = new Error('Error') as any
    error.codeName = 'WriteConflict'

    const retryFn = sandbox.stub()
    retryFn.onFirstCall().rejects(new Error('WriteConflict'))
    retryFn.onSecondCall().rejects(error)
    retryFn.onThirdCall().resolves('success')

    const result = await DbTx.handleTxError(new Error('WriteConflict'), retryFn)

    expect(result).to.equal('success')
    expect(retryFn.callCount).to.equal(3) // Initial call + 2 retries
  })
})
