import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import DbOperations from '@models/utils/dbOperations'
import logger from '@logger'
import DbTx from '@modules/dbTx'

describe('Model/Utils: dbOperations', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('createDocument', () => {
    it('should create a document and log the action', async () => {
      const mockSession = {
        commitTransaction: sandbox.stub().resolves(),
        endSession: sandbox.stub().resolves(),
      }
      const mockModel = {
        create: sandbox.stub().resolves({ id: 'document-id' }),
      }
      const mockInfo = { userId: '123' }
      const logStub = sandbox.stub(logger, 'verbose')
      const executeTxFnStub = sandbox
        .stub(DbTx, 'executeTxFn')
        .callsFake(async fn => await fn({ session: mockSession }))

      const result = await DbOperations.createDocument(
        mockModel,
        { data: 'test' },
        mockInfo,
        'Test log message',
        (info: any) => info,
      )

      expect(executeTxFnStub.calledOnce).to.be.true
      expect(mockModel.create.calledOnceWith({ data: 'test' }, { session: mockSession })).to.be.true
      expect(mockSession.commitTransaction.calledOnce).to.be.true
      expect(mockSession.endSession.calledOnce).to.be.true
      expect(logStub.calledOnceWith('Created new document - Test log message' as any)).to.be.true
      expect(result.id).to.equal('document-id')
    })
  })

  describe('updateDocument', () => {
    it('should update a document and log the action', async () => {
      const mockSession = {
        commitTransaction: sandbox.stub().resolves(),
        endSession: sandbox.stub().resolves(),
      }

      const mockDocument = {
        _id: 'document-id',
        update: sandbox.stub().resolves(),
        constructor: {
          findById: sandbox.stub(),
        },
      }

      // Mock the findById with session chaining
      const findByIdWithSession: any = {
        update: sandbox.stub().resolves(),
        id: 'document-id',
      }
      findByIdWithSession.session = sandbox.stub().returns(findByIdWithSession)
      mockDocument.constructor.findById.returns(findByIdWithSession)

      const mockInfo = { userId: '123' }
      const logStub = sandbox.stub(logger, 'verbose')
      const executeTxFnStub = sandbox
        .stub(DbTx, 'executeTxFn')
        .callsFake(async fn => await fn({ session: mockSession }))

      const result = await DbOperations.updateDocument(
        mockDocument,
        { data: 'updated-data' },
        mockInfo,
        'Test update message',
        (info: any) => info,
      )

      expect(executeTxFnStub.calledOnce).to.be.true
      expect(mockDocument.constructor.findById.calledOnceWith('document-id')).to.be.true
      expect(findByIdWithSession.update.calledOnceWith({ data: 'updated-data' }, { session: mockSession })).to.be.true
      expect(mockSession.commitTransaction.calledOnce).to.be.true
      expect(mockSession.endSession.calledOnce).to.be.true
      expect(logStub.calledOnceWith('Updated document - Test update message' as any)).to.be.true
      expect(result.id).to.equal('document-id')
    })
  })
})
