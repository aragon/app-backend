import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DbTx from '@modules/dbTx'
import Logger from '@logger'
import config from '@config'
import mongoose, { ClientSession } from 'mongoose'
import { ITokenType, ITransactionType, NetworksEnum } from '@types'
import utils from '@helpers/utils'
import { Models } from '@dbModels'
import { fakeAlchemyTransfer } from '@test/mock/fakeAlchemyTransfer'
import type Dao from '@models/schema/dao'
import { ProxyToken } from '@modules/proxyToken'
import Web3Helper from '@helpers/web3'
import { RateModule } from '@modules/rates'
import { DaoTransactions } from '@services/aragon-dao/daoTransactions'
import Web3Utils from '@helpers/web3Utils'

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
      type: ITransactionType.deposit,
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
    sandbox.stub(RateModule, 'fetchRate').resolves({ priceUsd: '20' } as any)
    sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({ logs: fakeLogs } as any)
    sandbox.stub(Web3Utils, 'findLogsByName').returns([{ txLog: fakeLogs[0] }] as any)

    const [result1, result2, result3] = (await Promise.all([
      DaoTransactions.saveTransaction(tx, expectedTransaction.type, daoRegistry.address!, daoRegistry.network!),
      DaoTransactions.saveTransaction(tx, expectedTransaction.type, daoRegistry.address!, daoRegistry.network!),
      DaoTransactions.saveTransaction(tx, expectedTransaction.type, daoRegistry.address!, daoRegistry.network!),
    ])) as any

    expect(result1).to.exist
    expect(result2).to.exist
    expect(result3).to.exist
  })

  describe('Utility Functions', () => {
    it('isErrorConflict should correctly identify conflict errors', () => {
      const conflictErrors = [
        { message: 'WriteConflict detected' },
        { codeName: 'WriteConflict' },
        { codeName: 'LockTimeout' },
      ]

      conflictErrors.forEach(error => {
        const result = DbTx.isErrorConflict(error)
        expect(result).to.be.true
      })

      const nonConflictError = { message: 'Some other error' }
      expect(DbTx.isErrorConflict(nonConflictError)).to.be.false
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

      await DbTx.closeEnd(session as unknown as ClientSession)

      expect(session.abortTransaction.calledOnce).to.be.true
      expect(session.endSession.calledOnce).to.be.true
    })

    it('should handle errors during abortTransaction and endSession gracefully', async () => {
      const session = {
        inTransaction: () => true,
        abortTransaction: sandbox.stub().rejects(new Error('Abort Error')),
        endSession: sandbox.stub().rejects(new Error('End Session Error')),
      }

      await DbTx.closeEnd(session as unknown as ClientSession)

      expect(session.abortTransaction.calledOnce).to.be.true
      expect(session.endSession.calledOnce).to.be.true
    })
  })
})
