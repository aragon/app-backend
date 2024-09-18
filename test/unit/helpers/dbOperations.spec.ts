import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import DbOperation from '@models/utils/dbOperations'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { FakeMember } from '@test/mock/fakeMember'
import Logger from '@logger'
import chaiAsPromised from 'chai-as-promised'
import chai from 'chai'

chai.use(chaiAsPromised)
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
      sandbox.stub(Models.Member, 'create').throws(new Error('Failed to create document'))

      await expect(DbOperation.createDocument(Models.Member, FakeMember, {}, 'DbOperations', llo)).to.be.rejectedWith(
        Error,
        'Failed to create document',
      )

      expect(loggerStub.calledTwice).to.be.true
      expect(loggerStub.calledWith('Failed to create document - DbOperations' as any)).to.be.true
      expect(loggerStub.calledWith('error after all retry' as any)).to.be.true
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
      sandbox.stub(document, 'update').throws(new Error('Failed to update document'))

      await expect(DbOperation.updateDocument(document, FakeMember, {}, 'DbOperations', llo)).to.be.rejectedWith(
        Error,
        'Failed to update document',
      )

      expect(loggerStub.calledTwice).to.be.true
      expect(loggerStub.calledWith('Failed to update document - DbOperations' as any)).to.be.true
      expect(loggerStub.calledWith('error after all retry' as any)).to.be.true
    })
  })
})
