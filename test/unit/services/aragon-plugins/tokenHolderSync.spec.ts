import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'
import { expect } from 'chai'
import { TokenHolderSync } from '@plugins/tokenHolderSync'
import BlockScoutHelper from '@helpers/blockScout'
import { ProxyMember } from '@modules/proxyMember'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { IGovernanceErc20Logs, NetworksEnum, TokenSyncTagName } from '@types'
import configIndexer from '@indexer/configIndexer'
import config from '@config'
import logger from '@logger'
import { Models } from '@dbModels'
import ProxyWeb3Provider from '@modules/proxyProvider'
import DbTx from '@modules/dbTx'

describe('AragonPlugins: TokenHolderSync', () => {
  let sandbox: SinonSandbox
  let blockScoutGetTokenCountersStub: SinonStub
  let proxyWeb3ProviderGetAllTokenHoldersStub: SinonStub
  let proxyMemberCreateMemberStub: SinonStub
  let proxyMemberGetBalancesStub: SinonStub
  let proxyMemberAddToDaoStub: SinonStub
  let crawlerCrawlStub: SinonStub
  let loggerVerboseStub: SinonStub
  let loggerErrorStub: SinonStub
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
    blockScoutGetTokenCountersStub = sandbox.stub(BlockScoutHelper, 'getTokenCounters')

    // Stub ProxyWeb3Provider methods
    proxyWeb3ProviderGetAllTokenHoldersStub = sandbox.stub(ProxyWeb3Provider, 'getAllTokenHolders')

    // Stub ProxyMember methods
    proxyMemberCreateMemberStub = sandbox.stub(ProxyMember, 'createMember')
    proxyMemberGetBalancesStub = sandbox.stub(ProxyMember, 'getBalances')
    proxyMemberAddToDaoStub = sandbox.stub(ProxyMember, 'addToDao')

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
    loggerErrorStub = sandbox.stub(logger, 'error')

    // Stub config
    sandbox.stub(config, 'CRAWLER_CONFIG').value({
      TOKEN_HOLDERS_THRESHOLD: 100,
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

  describe('getTagName', () => {
    it('should return correct tag name for default type', () => {
      const result = TokenHolderSync.getTagName(mockPlugin, mockToken, TokenSyncTagName.Default)
      expect(result).to.equal('tokenVoting-ethereum-sepolia-0xPlugin123-0xToken456')
    })

    it('should return correct tag name with suffix for non-default types', () => {
      const result = TokenHolderSync.getTagName(mockPlugin, mockToken, TokenSyncTagName.TokenHolders)
      expect(result).to.equal('tokenVoting-ethereum-sepolia-0xPlugin123-0xToken456-token-holders')
    })
  })

  describe('isOptimizedFlowNeeded', () => {
    it('should return false if token is not a custom token', async () => {
      const sameBlockNumberToken = { ...mockToken, blockNumber: mockPlugin.blockNumber }

      const result = await TokenHolderSync.isOptimizedFlowNeeded(sameBlockNumberToken, mockPlugin)

      expect(result).to.be.false
      expect(blockScoutGetTokenCountersStub.called).to.be.false
    })

    it('should return false if default tag already exists', async () => {
      const findOneStub = Models.ConfigIndexer.findOne as SinonStub
      findOneStub.resolves({ service: 'default-tag' })

      const result = await TokenHolderSync.isOptimizedFlowNeeded(mockToken, mockPlugin)

      expect(result).to.be.false
      expect(blockScoutGetTokenCountersStub.called).to.be.false
      expect(findOneStub.calledOnce).to.be.true
    })

    it('should return false if token holder count is below threshold', async () => {
      blockScoutGetTokenCountersStub.resolves({ holders: '50', transfers: 100 })

      const findOneStub = Models.ConfigIndexer.findOne as SinonStub
      findOneStub.resolves(null)

      const result = await TokenHolderSync.isOptimizedFlowNeeded(mockToken, mockPlugin)

      expect(result).to.be.false
      expect(blockScoutGetTokenCountersStub.calledOnce).to.be.true
      expect(findOneStub.calledOnce).to.be.true
    })

    it('should return true if token holder count is above threshold', async () => {
      blockScoutGetTokenCountersStub.resolves({ holders: '150', transfers: 100 })

      const findOneStub = Models.ConfigIndexer.findOne as SinonStub
      findOneStub.resolves(null)

      const result = await TokenHolderSync.isOptimizedFlowNeeded(mockToken, mockPlugin)

      expect(result).to.be.true
      expect(blockScoutGetTokenCountersStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledOnce).to.be.true
    })

    it('should handle BlockScout API errors gracefully', async () => {
      blockScoutGetTokenCountersStub.rejects(new Error('BlockScout API error'))

      const findOneStub = Models.ConfigIndexer.findOne as SinonStub
      findOneStub.resolves(null)

      const result = await TokenHolderSync.isOptimizedFlowNeeded(mockToken, mockPlugin)

      expect(result).to.be.false
      expect(loggerErrorStub.calledOnce).to.be.true
    })
  })

  describe('syncAllTokenHolders', () => {
    it('should skip sync if it was already completed', async () => {
      // Setup for completed sync
      configIndexerFindExistingLogStub.resolves({ end: true })

      // Act
      await TokenHolderSync.syncAllTokenHolders(mockPlugin, mockToken)

      // Assert
      expect(
        loggerVerboseStub.calledWith('TokenHolderSync - BlockScout sync already completed, skipping', sinon.match.any),
      ).to.be.true
      expect(proxyWeb3ProviderGetAllTokenHoldersStub.called).to.be.false
    })

    it('should call getAllTokenHolders with correct parameters', async () => {
      // Setup
      configIndexerFindExistingLogStub.resolves(null)
      proxyWeb3ProviderGetAllTokenHoldersStub.resolves({
        holders: [],
        total: 0,
        hasMore: false,
        lastPage: 0,
      })

      // Act
      await TokenHolderSync.syncAllTokenHolders(mockPlugin, mockToken)

      // Assert
      expect(proxyWeb3ProviderGetAllTokenHoldersStub.calledOnce).to.be.true

      const callArgs = proxyWeb3ProviderGetAllTokenHoldersStub.firstCall.args[0]
      expect(callArgs.address).to.equal(mockToken.address)
      expect(callArgs.network).to.equal(mockToken.network)
      expect(typeof callArgs.callback).to.equal('function')

      const expectedSyncKey = TokenHolderSync.getTagName(mockPlugin, mockToken, TokenSyncTagName.TokenHolders)
      expect(callArgs.syncKey).to.equal(expectedSyncKey)
    })

    it('should process holder with non-zero balance correctly', async () => {
      // Setup
      const mockHolder = { address: '0xHolder1', value: '100' }
      const mockMember = { id: 'member-1' }
      const mockBalance = {
        id: 'balance-1',
        increaseBalance: sandbox.stub().resolves({ id: 'updated-balance-1' }),
      }

      configIndexerFindExistingLogStub.resolves(null)
      proxyMemberCreateMemberStub.resolves(mockMember)
      proxyMemberGetBalancesStub.resolves(mockBalance)

      proxyWeb3ProviderGetAllTokenHoldersStub.callsFake(async ({ callback }) => {
        if (callback) {
          await callback(mockHolder)
        }
        return { holders: [mockHolder], total: 1, hasMore: false, lastPage: 0 }
      })

      // Act
      await TokenHolderSync.syncAllTokenHolders(mockPlugin, mockToken)

      // Assert
      expect(proxyMemberCreateMemberStub.calledWith(mockHolder.address)).to.be.true
      expect(
        proxyMemberGetBalancesStub.calledWith({
          address: mockHolder.address,
          tokenAddress: mockToken.address,
          network: mockToken.network,
        }),
      ).to.be.true

      expect(dbTxExecuteTxFnStub.calledOnce).to.be.true
      expect(mockBalance.increaseBalance.calledOnce).to.be.true
      expect(mockBalance.increaseBalance.firstCall.args[0]).to.deep.equal({
        amount: mockHolder.value,
        blockNumber: mockPlugin.blockNumber,
      })

      expect(
        proxyMemberAddToDaoStub.calledWith({
          memberAddress: mockHolder.address,
          daoAddress: mockPlugin.daoAddress,
          pluginAddress: mockPlugin.address,
          tokenAddress: mockPlugin.tokenAddress,
          network: mockPlugin.network,
        }),
      ).to.be.true
    })

    it('should skip holder with zero balance', async () => {
      // Setup
      const mockHolder = { address: '0xHolder1', value: '0' }

      configIndexerFindExistingLogStub.resolves(null)

      proxyWeb3ProviderGetAllTokenHoldersStub.callsFake(async ({ callback }) => {
        if (callback) {
          await callback(mockHolder)
        }
        return { holders: [mockHolder], total: 1, hasMore: false, lastPage: 0 }
      })

      // Act
      await TokenHolderSync.syncAllTokenHolders(mockPlugin, mockToken)

      // Assert
      expect(proxyMemberCreateMemberStub.called).to.be.false
      expect(proxyMemberGetBalancesStub.called).to.be.false
      expect(dbTxExecuteTxFnStub.called).to.be.false
      expect(proxyMemberAddToDaoStub.called).to.be.false
    })

    it('should handle missing member or balance gracefully', async () => {
      // Setup
      const mockHolder = { address: '0xHolder1', value: '100' }

      configIndexerFindExistingLogStub.resolves(null)
      proxyMemberCreateMemberStub.resolves(null) // Member creation fails

      proxyWeb3ProviderGetAllTokenHoldersStub.callsFake(async ({ callback }) => {
        if (callback) {
          await callback(mockHolder)
        }
        return { holders: [mockHolder], total: 1, hasMore: false, lastPage: 0 }
      })

      // Act
      await TokenHolderSync.syncAllTokenHolders(mockPlugin, mockToken)

      // Assert
      expect(proxyMemberCreateMemberStub.calledOnce).to.be.true
      expect(proxyMemberGetBalancesStub.calledOnce).to.be.true
      expect(dbTxExecuteTxFnStub.called).to.be.false
      expect(proxyMemberAddToDaoStub.called).to.be.false
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

      const expectedTagName = TokenHolderSync.getTagName(mockPlugin, mockToken, TokenSyncTagName.Delegation)
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

      const expectedTagName = TokenHolderSync.getTagName(mockPlugin, mockToken, TokenSyncTagName.Transfer)
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

      const defaultTagName = TokenHolderSync.getTagName(mockPlugin, mockToken, TokenSyncTagName.Default)
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

      const defaultTagName = TokenHolderSync.getTagName(mockPlugin, mockToken, TokenSyncTagName.Default)
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
