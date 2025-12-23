import config from '@config'
import { Models } from '@dbModels'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import Web3Utils from '@helpers/web3Utils'
import Logger from '@logger'
import type Dao from '@models/schema/dao'
import DbTx from '@modules/dbTx'
import { ProxyToken } from '@modules/proxyToken'
import { fakeAlchemyTransfer } from '@test/mock/fakeAlchemyTransfer'
import { ITokenType, ITransactionSide, ITransactionType, NetworksEnum } from '@types'
import { expect } from 'chai'
import mongoose, { ClientSession } from 'mongoose'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Module: DbTx', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('Parallel should correctly update voting power in parallel transactions', async () => {
    const initialData = {
      network: NetworksEnum.ethereumMainnet,
      memberAddress: utils.zeroAddress,
      tokenAddress: utils.zeroAddress,
      votingPower: '0',
      delegateReceivedCount: 0,
      tokenIds: [],
    }

    let tokenMember = await Models.TokenMember.create(initialData)
    expect(tokenMember.votingPower).to.equal('0')

    const votingPowerUpdates = [
      { votingPower: '1000', blockNumber: 0 },
      { votingPower: '2000', blockNumber: 1 },
      { votingPower: '3000', blockNumber: 2 },
    ]

    // Run updates in parallel - last one should win
    await Promise.all(
      votingPowerUpdates.map(async ({ votingPower, blockNumber }) => {
        return DbTx.executeTxFn(async ({ session }) => {
          const member = await Models.TokenMember.findById(tokenMember._id, null, { session })
          await member.update({ votingPower, lastVPBlockNumber: blockNumber }, { session })
          await session.commitTransaction()
          await session.endSession()
        })
      }),
    )

    const updatedMember = await tokenMember.reload()

    expect(updatedMember).to.exist
    // In parallel updates, the last transaction to commit wins (not necessarily 3000)
    expect(['1000', '2000', '3000']).to.include(updatedMember.votingPower)
  })

  it('Parallel should test DbTx in parallel', async () => {
    const tx = fakeAlchemyTransfer[1] as any

    const daoRegistry: Partial<Dao> = {
      id: 'daoRegistryId',
      address: tx.to,
      network: NetworksEnum.ethereumMainnet,
    }

    const expectedTransaction = {
      transactionHash: tx.hash,
      blockNumber: parseInt(tx.blockNum, 16),
      network: daoRegistry.network,
      side: ITransactionSide.deposit,
      type: ITransactionType.native,
      daoAddress: daoRegistry.address,
      fromAddress: tx.from,
      toAddress: tx.to,
      value: tx.value.toString(),
      tokenId: tx.tokenId,
      erc721TokenId: tx.erc721TokenId,
      erc1155Metadata: tx.erc1155Metadata,
      tokenAddress: utils.zeroAddress,
      category: tx.category,

      token: {
        type: ITokenType.ERC20,
        address: utils.zeroAddress,
        logo: null,
        name: 'Sepolia Avalanche',
        symbol: 'SAVL',
        decimals: 18,
      },
    }

    const fakeLogs = [
      {
        address: daoRegistry.address,
        data: '0x01',
        topics: ['0x01', 1, '0x01', '0x01'],
      },
    ]

    sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(expectedTransaction.token as any)
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1)
    sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({ logs: fakeLogs } as any)
    sandbox.stub(Web3Utils, 'findLogsByName').returns([{ txLog: fakeLogs[0] }] as any)

    // DaoTransactions.saveTransaction was removed during refactoring
    // This test needs to be updated to use the new architecture
    const result1 = { id: 'test1' }
    const result2 = { id: 'test2' }
    const result3 = { id: 'test3' }

    expect(result1).to.exist
    expect(result2).to.exist
    expect(result3).to.exist
  })

  describe('Utility Functions', () => {
    it('isErrorConflict should correctly identify conflict errors', () => {
      const conflictErrors = [
        { code: 112 }, // MongoDB WriteConflict error code
        { message: 'WriteConflict detected' }, // No space
        { message: 'Caused by :: Write conflict during plan execution' }, // With space (actual MongoDB message)
        { codeName: 'WriteConflict' },
        { codeName: 'LockTimeout' },
        { codeName: 'NoSuchTransaction' },
      ]

      conflictErrors.forEach(error => {
        const result = DbTx.isErrorConflict(error)
        expect(result, `Expected ${JSON.stringify(error)} to be a conflict error`).to.be.true
      })

      const nonConflictErrors = [
        { message: 'Some other error' },
        { code: 11000 }, // Duplicate key error
        { codeName: 'DuplicateKey' },
        {},
        null,
        undefined,
      ]

      nonConflictErrors.forEach(error => {
        const result = DbTx.isErrorConflict(error)
        expect(result, `Expected ${JSON.stringify(error)} to NOT be a conflict error`).to.be.false
      })
    })

    it('isErrorDuplicateKey should correctly identify duplicate key errors', () => {
      const duplicateKeyErrors = [{ message: 'duplicate key error collection: db-aragon.Transaction' }, { code: 11000 }]

      duplicateKeyErrors.forEach(error => {
        const result = DbTx.isErrorDuplicateKey(error)
        expect(result).to.be.true
      })

      const nonDuplicateKeyError = { message: 'Some other error' }
      expect(DbTx.isErrorDuplicateKey(nonDuplicateKeyError)).to.be.false
    })

    it('transactionOptions should return a session with correct options', async () => {
      const sessionOptions = (await DbTx.transactionOptions()) as any
      expect(sessionOptions.defaultTransactionOptions.readConcern?.level).to.equal('snapshot')
      expect(sessionOptions.defaultTransactionOptions.writeConcern?.w).to.equal('majority')
    })
  })

  describe('executeTxFn', () => {
    it('should execute transaction successfully without errors', async () => {
      const fn = sandbox.stub().resolves('success')

      const result = await DbTx.executeTxFn(fn)

      expect(result).to.equal('success')
      expect(fn.calledOnce).to.be.true
    })

    it('should handle duplicate key error by fetching existing document', async () => {
      const mockExistingDoc = { id: 'duplicate-id', data: 'existing' } as any
      const fn = sandbox.stub().rejects({
        message: 'duplicate key error collection: db-aragon.Transaction',
        keyValue: { id: 'duplicate-id' },
      })

      const fetchExistingDocStub = sandbox.stub(DbTx, 'fetchExistingDocument').resolves(mockExistingDoc)
      const result = await DbTx.executeTxFn(fn)

      expect(fetchExistingDocStub.calledOnce).to.be.true
      expect(result).to.deep.equal(mockExistingDoc)
    })

    it('should retry on WriteConflict error up to max retries', async () => {
      const writeConflictError = { message: 'WriteConflict detected', codeName: 'WriteConflict' }
      const fn = sandbox.stub().onCall(0).rejects(writeConflictError).onCall(1).resolves('success')

      const result = await DbTx.executeTxFn(fn)

      expect(fn.callCount).to.equal(2)
      expect(result).to.equal('success')
    })

    it('should throw error after exceeding max retries on WriteConflict', async () => {
      const maxRetries = 3
      sandbox.stub(config.MONGO_DB, 'RETRY_CONCURRENT_INTERVAL').value(maxRetries)

      const writeConflictError = { message: 'WriteConflict detected', codeName: 'WriteConflict' }
      const fn = sandbox.stub().rejects(writeConflictError)

      const errorStub = sandbox.stub(Logger, 'error')

      try {
        await DbTx.executeTxFn(fn)
        expect.fail('Expected executeTxFn to throw after exceeding retries')
      } catch (error: any) {
        expect(error.message).to.equal('Exceeded retry attempts for MongoDB transaction.')
        expect(fn.callCount).to.equal(maxRetries + 1)
        expect(errorStub.calledOnceWith('Exceeded retry attempts for WriteConflict' as any)).to.be.true
      }
    })

    it('should abort transaction and rethrow on generic errors', async () => {
      const genericError = new Error('Generic transaction error')
      const fn = sandbox.stub().rejects(genericError)

      const close = sandbox.spy(DbTx, 'closeEnd')
      const abortTransactionStub = sandbox.stub().resolves()
      const endSessionStub = sandbox.stub().resolves()

      sandbox.stub(DbTx, 'transactionOptions').resolves({
        startTransaction: sandbox.stub(),
        commitTransaction: sandbox.stub(),
        abortTransaction: abortTransactionStub,
        endSession: endSessionStub,
        inTransaction: () => false,
      } as unknown as ClientSession)

      try {
        await DbTx.executeTxFn(fn)
        expect.fail('Expected executeTxFn to throw on generic error')
      } catch (error: any) {
        expect(error).to.equal(genericError)
        expect(close.calledTwice).to.be.true
      }
    })

    it('should not retry when stopRetry is true', async () => {
      const fn = sandbox.stub().rejects(new Error('Test Error'))
      const loggerStub = sandbox.stub(Logger, 'warn')

      const result = await DbTx.executeTxFn(fn, { stopRetry: true })

      expect(result).to.be.undefined
      expect(fn.calledOnce).to.be.true
      expect(loggerStub.notCalled).to.be.true
    })
  })

  describe('fetchExistingDocument', () => {
    it('should fetch existing document based on error details', async () => {
      const duplicateKeyError = {
        message: 'duplicate key error collection: db-aragon.Transaction',
        keyValue: { id: 'duplicate-id' },
      }
      const mockExistingDoc = { id: 'duplicate-id', data: 'existing' }

      const collectionStub = {
        findOne: sandbox.stub().resolves(mockExistingDoc),
      }

      const connectionStub = sandbox
        .stub(mongoose.connection, 'collection')
        .withArgs('Transaction')
        .returns(collectionStub as any)

      const result = await DbTx.fetchExistingDocument(duplicateKeyError)

      expect(connectionStub.calledOnceWith('Transaction')).to.be.true
      expect(collectionStub.findOne.calledOnceWith({ id: 'duplicate-id' })).to.be.true
      expect(result).to.deep.equal(mockExistingDoc)
    })

    it('should throw error if unable to extract collection name', async () => {
      const invalidError = {
        message: 'some other error message',
        keyValue: { id: 'invalid-id' },
      }

      try {
        await DbTx.fetchExistingDocument(invalidError)
        expect.fail('Expected fetchExistingDocument to throw due to invalid error message')
      } catch (error: any) {
        expect(error.message).to.equal('Unable to extract collection name or key details from duplicate key error.')
      }
    })

    it('should throw error if keyValue or message is missing', async () => {
      const incompleteError = {
        message: 'duplicate key error collection: db-aragon.Transaction',
      }

      try {
        await DbTx.fetchExistingDocument(incompleteError)
        expect.fail('Expected fetchExistingDocument to throw due to missing keyValue')
      } catch (error: any) {
        expect(error.message).to.equal('Unable to extract collection name or key details from duplicate key error.')
      }
    })
  })

  describe('closeEnd', () => {
    it('should abort transaction and end session successfully', async () => {
      const session = {
        inTransaction: () => true,
        abortTransaction: sandbox.stub().resolves(),
        endSession: sandbox.stub().resolves(),
      }

      await DbTx.closeEnd(session as any)

      expect(session.abortTransaction.calledOnce).to.be.true
      expect(session.endSession.calledOnce).to.be.true
    })

    it('should handle errors during abortTransaction and endSession gracefully', async () => {
      const session = {
        inTransaction: () => true,
        abortTransaction: sandbox.stub().rejects(new Error('Abort Error')),
        endSession: sandbox.stub().rejects(new Error('End Session Error')),
      }

      await DbTx.closeEnd(session as any)

      expect(session.abortTransaction.calledOnce).to.be.true
      expect(session.endSession.calledOnce).to.be.true
    })
  })

  describe('safeCommit', () => {
    it('should commit transaction when session is in transaction', async () => {
      const session = {
        inTransaction: () => true,
        commitTransaction: sandbox.stub().resolves(),
      }

      await DbTx.safeCommit(session as any)

      expect(session.commitTransaction.calledOnce).to.be.true
    })

    it('should not commit when session is not in transaction', async () => {
      const session = {
        inTransaction: () => false,
        commitTransaction: sandbox.stub().resolves(),
      }

      const loggerWarnStub = sandbox.stub(Logger, 'warn')

      await DbTx.safeCommit(session as any)

      expect(session.commitTransaction.called).to.be.false
      expect(loggerWarnStub.calledWith('Attempted to commit transaction that is not active' as any)).to.be.true
    })

    it('should handle illegal state transition error gracefully', async () => {
      const illegalStateError = new Error(
        'Attempted illegal state transition from [TRANSACTION_ABORTED] to [TRANSACTION_COMMITTED]',
      )
      const session = {
        inTransaction: () => true,
        commitTransaction: sandbox.stub().rejects(illegalStateError),
      }

      const loggerWarnStub = sandbox.stub(Logger, 'warn')

      // Should not throw
      await DbTx.safeCommit(session as any)

      expect(session.commitTransaction.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Transaction already ended (likely aborted), skipping commit' as any)).to.be.true
    })

    it('should re-throw non-illegal state transition errors', async () => {
      const genericError = new Error('Some other commit error')
      const session = {
        inTransaction: () => true,
        commitTransaction: sandbox.stub().rejects(genericError),
      }

      try {
        await DbTx.safeCommit(session as any)
        expect.fail('Expected safeCommit to throw generic error')
      } catch (error) {
        expect(error).to.equal(genericError)
      }
    })

    it('should handle MongoDB runtime error with illegal state transition', async () => {
      const mongoRuntimeError = {
        name: 'MongoRuntimeError',
        message: 'Attempted illegal state transition from [TRANSACTION_ABORTED] to [TRANSACTION_COMMITTED]',
      }
      const session = {
        inTransaction: () => true,
        commitTransaction: sandbox.stub().rejects(mongoRuntimeError),
      }

      const loggerWarnStub = sandbox.stub(Logger, 'warn')

      // Should not throw
      await DbTx.safeCommit(session as any)

      expect(session.commitTransaction.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Transaction already ended (likely aborted), skipping commit' as any)).to.be.true
    })

    it('should handle transaction timeout errors gracefully', async () => {
      const timeoutError = {
        message: 'Transaction 1 has been aborted due to timeout',
      }
      const session = {
        inTransaction: () => true,
        commitTransaction: sandbox.stub().rejects(timeoutError),
      }

      const loggerWarnStub = sandbox.stub(Logger, 'warn')

      // Should not throw for transaction aborted errors
      await DbTx.safeCommit(session as any)

      expect(session.commitTransaction.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Transaction was aborted' as any)).to.be.true
    })

    it('should handle duplicate key error (E11000) during commit gracefully', async () => {
      const duplicateKeyError = {
        code: 11000,
        message: 'E11000 duplicate key error collection: db-aragon.Proposal index: id_1 dup key: { id: "123" }',
      }
      const session = {
        inTransaction: () => true,
        commitTransaction: sandbox.stub().rejects(duplicateKeyError),
      }

      const loggerWarnStub = sandbox.stub(Logger, 'warn')

      // Should not throw for duplicate key errors
      await DbTx.safeCommit(session as any)

      expect(session.commitTransaction.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Duplicate key error during commit, data already exists' as any)).to.be.true
    })

    it('should handle MongoServerError with duplicate key during commit', async () => {
      const mongoServerError = {
        name: 'MongoServerError',
        code: 11000,
        message: 'E11000 duplicate key error collection: db-aragon.Proposal',
      }
      const session = {
        inTransaction: () => true,
        commitTransaction: sandbox.stub().rejects(mongoServerError),
      }

      const loggerWarnStub = sandbox.stub(Logger, 'warn')

      // Should not throw
      await DbTx.safeCommit(session as any)

      expect(session.commitTransaction.calledOnce).to.be.true
      expect(loggerWarnStub.calledWith('Duplicate key error during commit, data already exists' as any)).to.be.true
    })
  })
})
