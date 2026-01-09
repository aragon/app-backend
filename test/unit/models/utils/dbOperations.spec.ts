import logger from '@logger'
import DbOperations from '@models/utils/dbOperations'
import DbTx from '@modules/dbTx'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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
      expect(logStub.calledOnceWith('Created new document - Test log message' as any)).to.be.true
      expect(result.id).to.equal('document-id')
    })

    it('should log an error and rethrow when creating a document fails', async () => {
      const mockSession = {
        commitTransaction: sandbox.stub().resolves(),
        endSession: sandbox.stub().resolves(),
      }
      const mockModel = {
        create: sandbox.stub().rejects(new Error('Create failed')),
      }
      const mockInfo = { userId: '123' }
      const logStub = sandbox.stub(logger, 'error')
      const executeTxFnStub = sandbox
        .stub(DbTx, 'executeTxFn')
        .callsFake(async fn => await fn({ session: mockSession }))

      try {
        await DbOperations.createDocument(
          mockModel,
          { data: 'test' },
          mockInfo,
          'Test create error',
          (info: any) => info,
        )
      } catch (error: any) {
        expect(logStub.calledOnceWith('Error creating document - Test create error' as any)).to.be.true
        const logArgs: any = logStub.args[0]
        expect(logArgs[1]).to.have.property('model', mockModel)
        expect(logArgs[1]).to.have.property('data').that.deep.equals({ data: 'test' })
        expect(logArgs[1]).to.have.property('error')
        expect(logArgs[1].error.message).to.equal('Create failed')
        expect(error.message).to.equal('Create failed')
      }

      expect(executeTxFnStub.calledOnce).to.be.true
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
      expect(logStub.calledOnceWith('Updated document - Test update message' as any)).to.be.true
      expect(result.id).to.equal('document-id')
    })

    it('should log an error and rethrow when updating a document fails', async () => {
      const mockSession = {
        commitTransaction: sandbox.stub().resolves(),
        endSession: sandbox.stub().resolves(),
      }

      const mockDocument = {
        _id: 'document-id',
        update: sandbox.stub().rejects(new Error('Update failed')), // Simulate an update failure
        constructor: {
          findById: sandbox.stub(),
        },
      }

      const findByIdWithSession: any = {
        update: sandbox.stub().rejects(new Error('Update failed')),
        id: 'document-id',
      }
      findByIdWithSession.session = sandbox.stub().returns(findByIdWithSession)
      mockDocument.constructor.findById.returns(findByIdWithSession)

      const mockInfo = { userId: '123' }
      const logStub = sandbox.stub(logger, 'error')
      const executeTxFnStub = sandbox
        .stub(DbTx, 'executeTxFn')
        .callsFake(async fn => await fn({ session: mockSession }))

      try {
        await DbOperations.updateDocument(
          mockDocument,
          { data: 'updated-data' },
          mockInfo,
          'Test update error',
          (info: any) => info,
        )
      } catch (error: any) {
        expect(logStub.calledOnceWith('Error updating document - Test update error' as any)).to.be.true
        const logArgs: any = logStub.args[0]
        expect(logArgs[1]).to.have.property('document', mockDocument)
        expect(logArgs[1]).to.have.property('data').that.deep.equals({ data: 'updated-data' })
        expect(logArgs[1]).to.have.property('error')
        expect(logArgs[1].error.message).to.equal('Update failed')
        expect(error.message).to.equal('Update failed')
      }

      expect(executeTxFnStub.calledOnce).to.be.true
    })
  })
})
