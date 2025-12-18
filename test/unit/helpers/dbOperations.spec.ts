import { Models } from '@dbModels'
import Logger from '@logger'
import DbOperation from '@models/utils/dbOperations'
import DbTx from '@modules/dbTx'
import { FakeMember } from '@test/mock/fakeMember'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

const llo = (obj: any) => obj

describe('Model:Utils: dbOperations', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('create document', () => {
    it('should create a new database document', async () => {
      const loggerStub = sandbox.stub(Logger, 'verbose')
      const result = await DbOperation.createDocument(
        Models.Member,
        FakeMember,
        {
          id: FakeMember.id,
        },
        'DbOperations',
        llo,
      )

      expect(result).to.be.an('object')
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Created new document - DbOperations' as any)).to.be.true
    })

    it('should fail to create a new database document', async () => {
      const loggerStub = sandbox.stub(Logger, 'error')
      sandbox.stub(DbTx, 'executeTxFn').throws(new Error('Failed to create document'))

      const result = await DbOperation.createDocument(Models.Member, FakeMember, {}, 'DbOperations', llo)

      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Error creating document - DbOperations' as any)).to.be.true
    })
  })

  describe('update document', () => {
    it('should update a database document', async () => {
      const document = await Models.Member.create(FakeMember)
      const loggerStub = sandbox.stub(Logger, 'verbose')
      const result = await DbOperation.updateDocument(
        document,
        FakeMember,
        {
          id: FakeMember.id,
        },
        'DbOperations',
        llo,
      )

      expect(result).to.be.an('object')
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Updated document - DbOperations' as any)).to.be.true
    })

    it('should fail to update a database document', async () => {
      const document = await Models.Member.create(FakeMember)
      const loggerStub = sandbox.stub(Logger, 'error')
      sandbox.stub(DbTx, 'executeTxFn').throws(new Error('Failed to update document'))

      const result = await DbOperation.updateDocument(document, FakeMember, {}, 'DbOperations', llo)

      expect(result).to.be.null
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Error updating document - DbOperations' as any)).to.be.true
    })
  })
})
