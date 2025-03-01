import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { NetworksEnum } from '@types'
import Logger from '@logger'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import DbTx from "@modules/dbTx";

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

      sandbox.stub(DaoMetrics, 'getDaoTvl').resolves(fakeMetrics.tvlUSD)
      sandbox
        .stub(Models.Proposal, 'countDocuments')
        .onCall(0)
        .resolves(fakeMetrics.proposalsCreated)
        .onCall(1)
        .resolves(fakeMetrics.proposalsExecuted)
      sandbox.stub(Models.DaoMemberMapping, 'countUniqueMembers').resolves(fakeMetrics.members)
      sandbox.stub(Models.Vote, 'countDocuments').resolves(fakeMetrics.votes)
      sandbox.stub(DaoMetrics, 'countUniqueMemberVotesByPlugin').resolves(fakeMetrics.uniqueVoters)
      const stubLogger = sandbox.stub(Logger, 'verbose')

      await DaoMetrics.onDocument(document)

      expect(document.updateMetrics.calledOnceWith(fakeMetrics)).to.be.true
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

  describe('countUniqueMemberVotesByPlugin', () => {
    it('should return the count of unique member votes by plugin', async () => {
      const aggregateStub = sandbox.stub(Models.Vote, 'aggregate').resolves([{ uniqueVotes: 5 }])

      const result = await DaoMetrics.countUniqueMemberVotesByPlugin('0xDaoAddress')

      expect(aggregateStub.calledOnce).to.be.true
      expect(result).to.equal(5)
    })

    it('should return 0 if there are no unique votes', async () => {
      const aggregateStub = sandbox.stub(Models.Vote, 'aggregate').resolves([])

      const result = await DaoMetrics.countUniqueMemberVotesByPlugin('0xDaoAddress')

      expect(aggregateStub.calledOnce).to.be.true
      expect(result).to.equal(0)
    })
  })

  describe('getDaoTvl', () => {
    it('should return the TVL for a DAO', async () => {
      const getDaoTvlStub = sandbox.stub(Models.Asset, 'getDaoTvl').resolves({ tvlUsd: 1000 })

      const result = await DaoMetrics.getDaoTvl({
        address: '0xDaoAddress',
        network: NetworksEnum.ethereumMainnet,
      } as any)

      expect(getDaoTvlStub.calledOnceWith('0xDaoAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(result).to.equal(1000)
    })

    it('should return 0 if no TVL is found', async () => {
      const getDaoTvlStub = sandbox.stub(Models.Asset, 'getDaoTvl').resolves(null)

      const result = await DaoMetrics.getDaoTvl({
        address: '0xDaoAddress',
        network: NetworksEnum.ethereumMainnet,
      } as any)

      expect(getDaoTvlStub.calledOnceWith('0xDaoAddress', NetworksEnum.ethereumMainnet)).to.be.true
      expect(result).to.equal(0)
    })
  })
})
