import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { AggregatorMembers } from '@services/aragon-indexer/aggregator/member'
import { Models } from '@dbModels'
import DBCrawler from '@models/utils/crawler'
import { NetworksEnum } from '@types'
import Logger from '@logger'
import Web3Helper from '@helpers/web3'
import EnsHelper from '@helpers/ens'

describe('Indexer:Aggregator:Member', () => {
  let sandbox: SinonSandbox

  const rawDaoDoc = {
    network: NetworksEnum.ethereumMainnet,
    pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
    pluginSubdomain: 'token-voting',
    fromBlockNumber: 1,
    toBlockNumber: 2,
    daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
    fromTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
    toTxHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
    delegateFromAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
    delegateToAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
    votingPower: '100',
    tokenBalance: '100',
    tokenAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
  }

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the AggregatorMembers', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')

      await AggregatorMembers.start()

      expect(stubLogger.calledWith('End AggregatorMembers' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the AggregatorMembers', async () => {
      const stubLoggerError = sandbox.stub(Logger, 'error')
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await AggregatorMembers.start()

      expect(stubLogger.calledWith('End AggregatorMembers' as any)).to.be.true
      expect(stubLoggerError.calledOnce).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  describe('onDocument', async () => {
    it('should call onDocument', async () => {
      const ens = 'leuts.eth'
      const document = {
        address: '0x123',
        history: [rawDaoDoc],
      }

      const stubLogger = sandbox.stub(Logger, 'verbose')
      const stubEns = sandbox.stub(EnsHelper, 'getEnsWithUniversalResolver').resolves(ens)
      const getMemberDataStub = sandbox.stub(AggregatorMembers, '_getMemberData').resolves(document as any)
      await AggregatorMembers.onDocument(document as any)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubEns.calledOnceWith(document.address)).to.be.true
      expect(getMemberDataStub.calledOnce).to.be.true
      const member = await Models.Member.findExistingLog({ address: document.address })
      expect(member.address).to.equal(document.address)
      expect(member.ens).to.eq(ens)
      expect(member.history.length).to.eq(1)
      expect(member.history[0].network).to.eq(NetworksEnum.ethereumMainnet)
      expect(member.history[0].pluginAddress).to.eq(document.history[0].pluginAddress)
      expect(member.history[0].pluginSubdomain).to.eq(document.history[0].pluginSubdomain)
      expect(member.history[0].fromBlockNumber).to.eq(document.history[0].fromBlockNumber)
      expect(member.history[0].toBlockNumber).to.eq(document.history[0].toBlockNumber)
      expect(member.history[0].fromTxHash).to.eq(document.history[0].fromTxHash)
      expect(member.history[0].toTxHash).to.eq(document.history[0].toTxHash)
      expect(member.history[0].delegateFromAddress).to.eq(document.history[0].delegateFromAddress)
      expect(member.history[0].delegateToAddress).to.eq(document.history[0].delegateToAddress)
      expect(member.history[0].votingPower).to.eq(document.history[0].votingPower)
    })

    it('should update an existing aggregate member log', async () => {
      const rawDoc = {
        address: '0x12345',
        ens: 'test',
        history: [rawDaoDoc],
      }
      const dbDoc = await Models.Member.create(rawDoc)
      const loggerSpy = sandbox.stub(Logger, 'verbose')
      sandbox.stub(AggregatorMembers, '_getMemberData').resolves(rawDoc as any)

      rawDoc.history[0].delegateFromAddress = '0x011'
      rawDoc.history[0].tokenBalance = '200'
      await AggregatorMembers.onDocument(rawDoc as any)

      const updatedDoc = await dbDoc.reload()

      expect(updatedDoc.ens).to.equal('test')
      expect(updatedDoc.history[0].delegateFromAddress).to.equal('0x011')
      expect(updatedDoc.history[0].tokenBalance).to.equal('200')
      expect(loggerSpy.calledOnceWith('Update Aggregate Member' as any)).to.be.true
    })
  })

  it('should use query', () => {
    const pipeline = AggregatorMembers.query([], [])
    expect(pipeline.length).to.eq(6)

    const pipeline2 = AggregatorMembers.queryVotingPowerMembers([])
    expect(pipeline2.length).to.eq(9)

    const pipeline3 = AggregatorMembers.queryMultisigMembers([])
    expect(pipeline3.length).to.eq(13)
  })

  describe('_getMemberData', () => {
    it('should get member related data', async () => {
      const rawMember = {
        address: '0x123',
        ens: undefined,
        history: [
          {
            ...rawDaoDoc,
            toBlockNumber: null,
          },
        ],
      }

      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123123)
      const getERC20BalanceStub = sandbox.stub(Web3Helper, 'getERC20Balance').resolves('100')
      const delegateCountStub = sandbox.stub(Models.Delegate, 'countDocuments').resolves(1)
      const activityDateStub = sandbox.stub(AggregatorMembers, '_getMemberActivityDates').resolves({
        firstActivity: 12313,
        lastActivity: 123123,
      })

      const member = await AggregatorMembers._getMemberData(rawMember as any)

      expect(getERC20BalanceStub.calledOnce).to.be.true
      expect(getERC20BalanceStub.calledWith(rawMember.address, rawDaoDoc.tokenAddress, rawDaoDoc.network)).to.be.true

      expect(delegateCountStub.calledTwice).to.be.true
      expect(
        delegateCountStub.calledWith({
          toDelegate: rawMember.address,
          tokenAddress: rawDaoDoc.tokenAddress,
        }),
      ).to.be.true

      expect(activityDateStub.calledOnce).to.be.true
      expect(activityDateStub.calledWith(rawMember.address)).to.be.true

      expect(getBlockTimestampStub.calledOnce).to.be.true
    })

    it('should get the member activity dates', async () => {
      const memberAddress = '0x123'
      const expectedFirstActivity = {
        blockNumber: 123123,
        network: NetworksEnum.ethereumSepolia,
      }
      const expectedLastActivity = {
        blockNumber: 12313,
        network: NetworksEnum.ethereumSepolia,
      }

      const voteAggregationStub = sandbox.stub(Models.LogProposal, 'getMemberActivity').resolves({
        firstActivity: expectedFirstActivity,
        lastActivity: expectedLastActivity,
      })

      const currentTime = Date.now()

      const getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(currentTime)

      const { firstActivity, lastActivity } = await AggregatorMembers._getMemberActivityDates(memberAddress)

      expect(getBlockTimestampStub.calledTwice).to.be.true

      expect(getBlockTimestampStub.calledWith(expectedFirstActivity.blockNumber, expectedFirstActivity.network)).to.be
        .true
      expect(getBlockTimestampStub.calledWith(expectedLastActivity.blockNumber, expectedFirstActivity.network)).to.be
        .true

      expect(voteAggregationStub.calledOnce).to.be.true
      expect(firstActivity).to.eq(currentTime)
      expect(lastActivity).to.eq(currentTime)
    })
  })
})
