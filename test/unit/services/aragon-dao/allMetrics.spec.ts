import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import Logger from '@logger'
import { AllMetrics } from '@services/aragon-dao/allMetrics'
import logger from '@logger'
import DBCrawler from '@models/utils/crawler'
import { DaoMetrics } from '@services/aragon-dao/daoMetrics'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import Web3Helper from '@helpers/web3'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import * as retryRequestModule from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'

describe('AragonDao:AllMetrics', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
    // Stub retryRequest to execute immediately without retries
    sandbox.stub(retryRequestModule, 'retryRequest').callsFake(async fn => {
      try {
        return await fn()
      } catch (error) {
        throw error
      }
    })
    // Stub BottleneckModule rate limiters to execute immediately without delays
    sandbox.stub(BottleneckModule, 'getNodeLimiter').returns({
      schedule: sandbox.stub().callsFake(async fn => fn()),
    } as any)
    sandbox.stub(BottleneckModule, 'getAlchemyBalanceLimiter').returns({
      schedule: sandbox.stub().callsFake(async fn => fn()),
    } as any)
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should start the AllMetrics', async () => {
      const stubLogger = sandbox.stub(Logger, 'verbose')
      const stubAllDaoMetrics = sandbox.stub(AllMetrics, 'allDaoMetrics').resolves()
      const stubAllProposalMetrics = sandbox.stub(AllMetrics, 'allProposalMetrics').resolves()
      const stubRebaseTokens = sandbox.stub(AllMetrics, 'rebaseTokens').resolves()

      const network = NetworksEnum.ethereumMainnet
      await AllMetrics.start({ network })

      expect(stubLogger.calledTwice).to.be.true
      expect(stubLogger.calledWithMatch('Start AllMetrics' as any)).to.be.true
      expect(stubLogger.calledWithMatch('End AllMetrics' as any)).to.be.true

      expect(stubAllDaoMetrics.calledOnceWith(network)).to.be.true
      expect(stubAllProposalMetrics.calledOnceWith(network)).to.be.true
      expect(stubRebaseTokens.calledOnceWith(network)).to.be.true
    })
  })

  describe('allDaoMetrics', () => {
    it('should process allDaoMetrics', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubDaoMetrics = sandbox.stub(DaoMetrics, 'onDocument').resolves()

      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onDocument({ id: 'testDao' } as any)
      })

      const network = NetworksEnum.ethereumMainnet
      await AllMetrics.allDaoMetrics(network)

      expect(stubLogger.calledWith('End allDaoMetrics' as any)).to.be.true
      expect(stubDaoMetrics.calledOnceWith({ id: 'testDao' } as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should error the allDaoMetrics', async () => {
      const stubLoggerError = sandbox.stub(logger, 'error')
      const stubLogger = sandbox.stub(logger, 'verbose')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })
      const stubDaoMetrics = sandbox.stub(DaoMetrics, 'onDocument')

      const network = NetworksEnum.ethereumMainnet
      await AllMetrics.allDaoMetrics(network)

      expect(stubLogger.calledWith('End allDaoMetrics' as any)).to.be.true
      expect(stubLoggerError.calledOnceWith('Error Dao Metrics' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
      expect(stubDaoMetrics.notCalled).to.be.true
    })
  })

  describe('allProposalMetrics', () => {
    it('should process tokenVoting proposal metrics', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubProposalMetrics = sandbox.stub(ProposalMetrics, 'proposalTokenVotingMetrics').resolves()
      const stubFindPlugin = sandbox
        .stub(Models.Plugin, 'findByAddress')
        .resolves({ interfaceType: IPluginInterfaceType.tokenVoting, isSupported: true } as any)

      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onDocument({ pluginAddress: '0x123', proposalIndex: '1', network: NetworksEnum.ethereumMainnet })
      })

      const network = NetworksEnum.ethereumMainnet
      await AllMetrics.allProposalMetrics(network)

      expect(stubFindPlugin.calledOnce).to.be.true
      expect(
        stubProposalMetrics.calledOnceWith({
          pluginAddress: '0x123',
          proposalIndex: '1',
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
      expect(stubLogger.calledWith('End allProposalMetrics' as any)).to.be.true
    })

    it('should process multisig proposal metrics', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubProposalMetrics = sandbox.stub(ProposalMetrics, 'proposalMultisigMetrics').resolves()
      const stubFindPlugin = sandbox
        .stub(Models.Plugin, 'findByAddress')
        .resolves({ interfaceType: IPluginInterfaceType.multisig, isSupported: true } as any)

      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onDocument({ pluginAddress: '0x456', proposalIndex: '2', network: NetworksEnum.ethereumMainnet })
      })

      await AllMetrics.allProposalMetrics(NetworksEnum.ethereumMainnet)

      expect(stubFindPlugin.calledOnce).to.be.true
      expect(
        stubProposalMetrics.calledOnceWith({
          pluginAddress: '0x456',
          proposalIndex: '2',
          network: NetworksEnum.ethereumMainnet,
        }),
      ).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
      expect(stubLogger.calledWith('End allProposalMetrics' as any)).to.be.true
    })

    it('should log error when processing proposal metrics fails', async () => {
      const stubLoggerError = sandbox.stub(logger, 'error')
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubFindPlugin = sandbox
        .stub(Models.Plugin, 'findByAddress')
        .resolves({ interfaceType: IPluginInterfaceType.multisig } as any)
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await AllMetrics.allProposalMetrics(NetworksEnum.ethereumMainnet)

      expect(stubLogger.calledWith('End allProposalMetrics' as any)).to.be.true
      expect(stubLoggerError.calledOnceWith('Error RefetchProposalsMetrics' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
      expect(stubFindPlugin.notCalled).to.be.true
    })

    it('should skip unsupported plugin proposals', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubProposalTokenMetrics = sandbox.stub(ProposalMetrics, 'proposalTokenVotingMetrics').resolves()
      const stubProposalMultisigMetrics = sandbox.stub(ProposalMetrics, 'proposalMultisigMetrics').resolves()
      const stubFindPlugin = sandbox
        .stub(Models.Plugin, 'findByAddress')
        .resolves({ interfaceType: IPluginInterfaceType.tokenVoting, isSupported: false } as any)

      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onDocument({ pluginAddress: '0x789', proposalIndex: '3', network: NetworksEnum.ethereumMainnet })
      })

      await AllMetrics.allProposalMetrics(NetworksEnum.ethereumMainnet)

      expect(stubFindPlugin.calledOnce).to.be.true
      expect(stubProposalTokenMetrics.called).to.be.false
      expect(stubProposalMultisigMetrics.called).to.be.false
      expect(crawlerStub.calledOnce).to.be.true
      expect(stubLogger.calledWith('End allProposalMetrics' as any)).to.be.true
    })
  })

  describe('rebaseTokens', () => {
    it('should skip execution if network is not ethereumSepolia', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const dbCrawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl')

      await AllMetrics.rebaseTokens(NetworksEnum.ethereumMainnet)

      expect(dbCrawlerStub.notCalled).to.be.true
      expect(stubLogger.notCalled).to.be.true
    })

    it('should process member balance updates correctly', async () => {
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubGetBlockTimestamp = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123456)
      const stubGetPastVotes = sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('500')

      // Import and stub ProxyToken
      const { ProxyToken } = require('@modules/proxyToken')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ clockMode: 'BlockNumber' })

      const docStub = {
        update: sandbox.stub().resolves(),
        memberAddress: '0x123',
        tokenAddress: '0x01403157c847B2c0291c05DF5055876eB4e039bc',
        lastVPBlockNumber: 100,
        votingPower: '300',
        network: NetworksEnum.ethereumSepolia,
      }

      // Mock DBCrawler constructor to avoid instance creation delays
      const originalConstructor = DBCrawler
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        // Immediately call onDocument without any queue processing
        await this.onDocument(docStub)
        return { nbSuccess: 1, nbError: 0, nbTotal: 1 }
      })

      await AllMetrics.rebaseTokens(NetworksEnum.ethereumSepolia)

      expect(stubGetBlockTimestamp.calledOnce).to.be.true
      expect(stubGetPastVotes.calledOnce).to.be.true
      expect(docStub.update.calledOnceWith({ votingPower: '500', lastVPBlockNumber: 100 })).to.be.true
      expect(stubLogger.calledWith('End rebaseTokens' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should log error if processing fails', async () => {
      const stubLoggerError = sandbox.stub(logger, 'error')
      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(new Error('Test error'), { address: '0x123' })
      })

      await AllMetrics.rebaseTokens(NetworksEnum.ethereumSepolia)

      expect(stubLoggerError.calledOnceWith('Error SyncMemberVP' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })
})
