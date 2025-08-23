import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import Logger from '@logger'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import DbTx from '@modules/dbTx'

describe('AragonDao:DaoMetrics', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should start the DaoMetrics service and process a DAO', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const daoStub = sandbox.stub(Models.Dao, 'findByAddress').resolves({
        address: '0xDaoAddress',
        network: NetworksEnum.ethereumMainnet,
      } as any)
      const onDocumentStub = sandbox.stub(DaoMetrics, 'onDocument').resolves()

      await DaoMetrics.start({ daoAddress: '0xDaoAddress', network: NetworksEnum.ethereumMainnet })

      expect(stubLogger.calledWithMatch('Start DaoMetrics' as any)).to.be.true
      expect(daoStub.calledOnceWith('0xDaoAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(onDocumentStub.calledOnce).to.be.true
      expect(stubLogger.calledWithMatch('End DaoMetrics' as any)).to.be.true
    })

    it('should return if DAO is not found', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      sandbox.stub(Models.Dao, 'findByAddress').resolves(null)

      await DaoMetrics.start({ daoAddress: '0xInvalidDao', network: NetworksEnum.ethereumMainnet })

      expect(stubLogger.calledWithMatch('Start DaoMetrics' as any)).to.be.true
    })
  })

  describe('onDocument', () => {
    it('should process a DAO document and update metrics', async () => {
      const document = {
        address: '0xDaoAddress',
        network: NetworksEnum.ethereumMainnet,
        updateMetrics: sandbox.stub(),
      } as any
      const fakeMetrics = {
        tvlUSD: 1000,
        proposalsCreated: 10,
        proposalsExecuted: 5,
        members: 15,
        votes: 50,
        uniqueVoters: 10,
      }

      sandbox.stub(Models.Asset, 'getDaoTvl').resolves(fakeMetrics.tvlUSD)
      sandbox
        .stub(Models.Proposal, 'countDocuments')
        .onCall(0)
        .resolves(fakeMetrics.proposalsCreated)
        .onCall(1)
        .resolves(fakeMetrics.proposalsExecuted)
      sandbox.stub(Models.Dao, 'countUniqueMembers').resolves(fakeMetrics.members)
      sandbox.stub(Models.Vote, 'countDocuments').resolves(fakeMetrics.votes)
      sandbox.stub(Models.Vote, 'countUniqueMemberVotesByPlugin').resolves(fakeMetrics.uniqueVoters)
      const stubLogger = sandbox.stub(Logger, 'verbose')

      await DaoMetrics.onDocument(document)

      expect(document.updateMetrics.args[0][0]).to.be.deep.equal(fakeMetrics)
      expect(stubLogger.calledWithMatch('Update Dao metrics' as any)).to.be.true
    })

    it('should throw error', async () => {
      const document = {
        address: '0xDaoAddress',
        network: NetworksEnum.ethereumMainnet,
        updateMetrics: sandbox.stub(),
      } as any

      sandbox.stub(DbTx, 'executeTxFn').rejects(new Error('Test error'))
      const stubLogger = sandbox.stub(Logger, 'error')

      await DaoMetrics.onDocument(document)

      expect(stubLogger.calledWith('Error DaoMetrics' as any)).to.be.true
    })
  })
})
