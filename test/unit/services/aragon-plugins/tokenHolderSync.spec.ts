import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'
import { expect } from 'chai'
import { TokenHolderSync } from '@plugins/tokenHolderSync'
import { ProxyMember } from '@modules/proxyMember'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { IGovernanceErc20Logs, ITokenSyncTagName, NetworksEnum } from '@types'
import configIndexer from '@indexer/configIndexer'
import config from '@config'
import logger from '@logger'
import { Models } from '@dbModels'
import ProxyWeb3Provider from '@modules/proxyProvider'
import DbTx from '@modules/dbTx'
import ConfigIndexerHelper from '@helpers/configIndexer'

describe('AragonPlugins: TokenHolderSync', () => {
  let sandbox: SinonSandbox
  let blockScoutGetTokenCountersStub: SinonStub
  let proxyMemberCreateMemberStub: SinonStub
  let proxyMemberGetBalancesStub: SinonStub
  let proxyMemberAddPluginMemberStub: SinonStub
  let crawlerCrawlStub: SinonStub
  let loggerVerboseStub: SinonStub
  let loggerWarnStub: SinonStub
  let dbTxExecuteTxFnStub: SinonStub
  let configIndexerFindExistingLogStub: SinonStub

  const mockPlugin = {
    network: NetworksEnum.ethereumSepolia,
    address: '0xPlugin123',
    tokenAddress: '0xToken456',
    daoAddress: '0xDao789',
    blockNumber: 1000,
    interfaceType: 'tokenVoting',
  } as any

  const mockToken = {
    network: NetworksEnum.ethereumSepolia,
    address: '0xToken456',
    blockNumber: 500,
  } as any

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    // Stub BlockScout helper methods
    blockScoutGetTokenCountersStub = sandbox.stub(ProxyWeb3Provider, 'getTokenCounters')

    // Stub ProxyMember methods
    proxyMemberCreateMemberStub = sandbox.stub(ProxyMember, 'createMember')
    proxyMemberGetBalancesStub = sandbox.stub(ProxyMember, 'getBalances')
    proxyMemberAddPluginMemberStub = sandbox.stub(ProxyMember, 'addPluginMember')

    // Stub DbTx
    dbTxExecuteTxFnStub = sandbox.stub(DbTx, 'executeTxFn').callsFake(async callback => {
      await callback({ session: { commitTransaction: sandbox.stub(), endSession: sandbox.stub() } })
    })

    // Stub Model methods
    configIndexerFindExistingLogStub = sandbox.stub()
    sandbox.stub(Models, 'ConfigIndexer').value({
      findExistingLog: configIndexerFindExistingLogStub,
      findOne: sandbox.stub().resolves(null),
      find: sandbox.stub().resolves([]),
      create: sandbox.stub().resolves({}),
      deleteMany: sandbox.stub().resolves({}),
    })

    // Stub BlockchainLogCrawler
    crawlerCrawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')

    // Stub logger methods
    loggerVerboseStub = sandbox.stub(logger, 'verbose')
    loggerWarnStub = sandbox.stub(logger, 'warn')

    // Stub config
    sandbox.stub(config, 'CRAWLER_CONFIG').value({
      TOKEN_HOLDERS_THRESHOLD: 1000,
    })

    // Stub configIndexer
    sandbox.stub(configIndexer, 'filter').returns([
      {
        event: 'TestEvent',
        topic: '0xTopic',
        config: [],
      },
    ])
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('isTokenNotEligibleForSync', () => {
    it('should return false if token is not a custom token', async () => {
      const sameBlockNumberToken = { ...mockToken, blockNumber: mockPlugin.blockNumber }

      const result = await TokenHolderSync.isTokenNotEligibleForSync(sameBlockNumberToken, mockPlugin)

      expect(result).to.be.false
      expect(blockScoutGetTokenCountersStub.called).to.be.false
    })

    it('should return false if default tag already exists', async () => {
      const findOneStub = Models.ConfigIndexer.findOne as SinonStub
      findOneStub.resolves({ service: 'default-tag' })

      const result = await TokenHolderSync.isTokenNotEligibleForSync(mockToken, mockPlugin)

      expect(result).to.be.false
      expect(blockScoutGetTokenCountersStub.called).to.be.false
      expect(findOneStub.calledOnce).to.be.true
    })

    it('should return false if token holder count is below threshold', async () => {
      blockScoutGetTokenCountersStub.resolves({ holders: 50, transfers: 100 })

      const findOneStub = Models.ConfigIndexer.findOne as SinonStub
      findOneStub.resolves(null)

      const result = await TokenHolderSync.isTokenNotEligibleForSync(mockToken, mockPlugin)

      expect(result).to.be.false
      expect(blockScoutGetTokenCountersStub.calledOnce).to.be.true
      expect(findOneStub.calledOnce).to.be.true
    })

    it('should return true if token is ignoreTransfer', async () => {
      const sameBlockNumberToken = { ...mockToken, blockNumber: mockPlugin.blockNumber, ignoreTransfer: true }

      const result = await TokenHolderSync.isTokenNotEligibleForSync(sameBlockNumberToken, mockPlugin)

      expect(result).to.be.true
    })

    it('should return true if token holder count is above threshold', async () => {
      blockScoutGetTokenCountersStub.resolves({ holders: 400000, transfers: 4000 })

      const findOneStub = Models.ConfigIndexer.findOne as SinonStub
      findOneStub.resolves(null)

      const result = await TokenHolderSync.isTokenNotEligibleForSync(mockToken, mockPlugin)

      expect(loggerWarnStub.calledOnceWith('Token exceeds holder threshold for full sync' as any)).to.be.true
      expect(result).to.be.true
      expect(blockScoutGetTokenCountersStub.calledOnce).to.be.true
    })
  })

  describe('syncDelegationEvents', () => {
    it('should create and call crawler for delegation events with correct parameters', async () => {
      // Act
      await TokenHolderSync.syncDelegationEvents(mockPlugin, mockToken)

      // Assert
      expect(crawlerCrawlStub.calledOnce).to.be.true

      const crawler = crawlerCrawlStub.getCall(0).thisValue
      expect(crawler.crawlParams.onlyHistorical).to.be.true
      expect(crawler.crawlParams.network).to.equal(mockToken.network)
      expect(crawler.crawlParams.address).to.deep.equal([mockToken.address])
      expect(crawler.crawlParams.fromBlock).to.equal(mockToken.blockNumber)

      const expectedTagName = ConfigIndexerHelper.builders.token(
        mockToken.type,
        mockToken.network,
        mockToken.address,
        ITokenSyncTagName.delegates,
      )
      expect(crawler.crawlParams.logService).to.equal(expectedTagName)
    })
  })

  describe('syncTransfersEvents', () => {
    it('should create and call crawler for transfer events with correct parameters', async () => {
      // Act
      await TokenHolderSync.syncTransfersEvents(mockPlugin, mockToken)

      // Assert
      expect(crawlerCrawlStub.calledOnce).to.be.true

      const crawler = crawlerCrawlStub.getCall(0).thisValue
      expect(crawler.crawlParams.onlyHistorical).to.be.true
      expect(crawler.crawlParams.network).to.equal(mockPlugin.network)
      expect(crawler.crawlParams.address).to.deep.equal([mockPlugin.tokenAddress])
      expect(crawler.crawlParams.fromBlock).to.equal(mockPlugin.blockNumber)

      const expectedTagName = ConfigIndexerHelper.builders.token(
        mockToken.type,
        mockToken.network,
        mockToken.address,
        ITokenSyncTagName.transfers,
      )
      expect(crawler.crawlParams.logService).to.equal(expectedTagName)
    })
  })

  describe('convertToStandardSync', () => {
    it('should convert optimized sync tags to standard sync', async () => {
      // Setup
      const findStub = Models.ConfigIndexer.find as SinonStub
      const deleteManyStub = Models.ConfigIndexer.deleteMany as SinonStub
      const createStub = Models.ConfigIndexer.create as SinonStub

      const mockSyncTags = [
        { service: 'delegation-tag', lastSync: 1200 },
        { service: 'transfer-tag', lastSync: 1500 },
      ]
      findStub.resolves(mockSyncTags)

      // Act
      await TokenHolderSync.convertToStandardSync(mockPlugin, mockToken)

      // Assert
      expect(findStub.calledOnce).to.be.true
      expect(deleteManyStub.calledOnce).to.be.true
      expect(createStub.calledOnce).to.be.true

      const defaultTagName = ConfigIndexerHelper.builders.token(mockToken.type, mockToken.network, mockToken.address)
      expect(createStub.firstCall.args[0]).to.deep.include({
        network: mockPlugin.network,
        service: defaultTagName,
        lastSync: 1500, // Max of sync blocks
      })
    })

    it('should use plugin block number when no sync tags exist', async () => {
      // Setup
      const findStub = Models.ConfigIndexer.find as SinonStub
      const createStub = Models.ConfigIndexer.create as SinonStub

      findStub.resolves([])

      // Act
      await TokenHolderSync.convertToStandardSync(mockPlugin, mockToken)

      // Assert
      expect(createStub.calledOnce).to.be.true

      const defaultTagName = ConfigIndexerHelper.builders.token(mockToken.type, mockToken.network, mockToken.address)
      expect(createStub.firstCall.args[0]).to.deep.include({
        network: mockPlugin.network,
        service: defaultTagName,
        lastSync: mockPlugin.blockNumber,
      })
    })
  })

  describe('_getGovernanceLogConfigsByName', () => {
    it('should filter config logs by event name', () => {
      // Act
      const result = TokenHolderSync._getGovernanceLogConfigsByName(IGovernanceErc20Logs.DelegateVotesChanged)

      // Assert
      expect(Array.isArray(result)).to.be.true
    })
  })
})
