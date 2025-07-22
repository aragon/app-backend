import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'
import { expect } from 'chai'
import { TokenHolderSync } from '@plugins/tokenHolderSync'
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

  describe('syncAllTokenHolders', () => {
    it('should skip sync if it was already completed', async () => {
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

  describe('linkPluginToExistingTokenHolders', () => {
    beforeEach(() => {
      sandbox.restore()
    })
    it('should not process anything if no token holders exist', async () => {
      const spyDaoMemberMappingInsertMany = sandbox.spy(Models.DaoMemberMapping, 'insertMany')

      await TokenHolderSync.linkPluginToExistingTokenHolders(mockPlugin, mockToken, 1000)

      expect(spyDaoMemberMappingInsertMany.called).to.be.false
    })

    it('should link existing token holders to plugin and create config indexer entry', async () => {
      const mockHolders = ['0xHolder1', '0xHolder2']

      const memberFindStub = sandbox.stub(Models.Member, 'find')
      memberFindStub.returns({
        distinct: sandbox.stub().resolves(mockHolders),
      })
      const spyDaoMemberMappingInsertMany = sandbox.spy(Models.DaoMemberMapping, 'insertMany')
      const spyMemberMetricsInsertMany = sandbox.spy(Models.MemberMetrics, 'insertMany')
      const spyConfigIndexerCreate = sandbox.spy(Models.ConfigIndexer, 'create')

      const lastSyncBlock = 1500

      // Act
      await TokenHolderSync.linkPluginToExistingTokenHolders(mockPlugin, mockToken, lastSyncBlock)

      // Assert
      expect(
        memberFindStub.calledWith({
          tokenAddress: mockToken.address,
          network: mockToken.network,
        }),
      ).to.be.true

      const daoMemberMappings = await Models.DaoMemberMapping.find({
        pluginAddress: mockPlugin.address,
        tokenAddress: mockToken.address,
        network: mockPlugin.network,
      })

      expect(spyDaoMemberMappingInsertMany.calledOnce).to.be.true
      expect(spyMemberMetricsInsertMany.calledOnce).to.be.true

      expect(daoMemberMappings.length).to.equal(mockHolders.length)
      const memberMetrics = await Models.MemberMetrics.find({
        pluginAddress: mockPlugin.address,
        network: mockPlugin.network,
      })

      expect(memberMetrics.length).to.equal(mockHolders.length)

      expect(spyConfigIndexerCreate.calledOnce).to.be.true
      const configIndexer = await Models.ConfigIndexer.findOne({
        network: mockPlugin.network,
        logService: `${mockPlugin.interfaceType}-${mockPlugin.network}-${mockPlugin.address}-${mockPlugin?.tokenAddress}`,
      })
      expect(configIndexer).to.not.be.null
      expect(configIndexer.lastSync).to.equal(lastSyncBlock)
    })

    it('should handle errors during insertion and still create config indexer entry', async () => {
      // Setup - mock some token holders
      const mockHolders = ['0xHolder1', '0xHolder2']

      // Stub Member.find().distinct to return our mock holders
      const memberFindStub = sandbox.stub(Models.Member, 'find')
      memberFindStub.returns({
        distinct: sandbox.stub().resolves(mockHolders),
      })

      const insertManyStub = sandbox.stub(Models.DaoMemberMapping, 'insertMany')
      insertManyStub.throws(new Error('Database error'))

      // Spy on other methods
      const spyConfigIndexerCreate = sandbox.spy(Models.ConfigIndexer, 'create')
      const spyLoggerError = sandbox.stub(logger, 'error')

      // Act
      await TokenHolderSync.linkPluginToExistingTokenHolders(mockPlugin, mockToken, 1000)

      // Assert
      expect(spyLoggerError.calledOnce).to.be.true
      expect(spyConfigIndexerCreate.calledOnce).to.be.false
    })

    it('should return the last sync block if config exists', async () => {
      // Setup
      const mockLastSync = 5000

      const findOneStub = sandbox.stub(Models.ConfigIndexer, 'findOne')
      findOneStub.resolves({ lastSync: mockLastSync })

      // Act
      const result = await TokenHolderSync.getTokenLastSyncBlock(mockToken)

      // Assert
      expect(result).to.equal(mockLastSync)
      expect(findOneStub.calledOnce).to.be.true
      expect(findOneStub.firstCall.args[0]).to.deep.include({
        network: mockToken.network,
        regex: { $regex: `${mockToken.address}$` },
      })
    })

    it('should return 0 if no config exists', async () => {
      // Setup
      const findOneStub = sandbox.stub(Models.ConfigIndexer, 'findOne')
      findOneStub.resolves(null)

      // Act
      const result = await TokenHolderSync.getTokenLastSyncBlock(mockToken)

      // Assert
      expect(result).to.equal(0)
      expect(findOneStub.calledOnce).to.be.true
    })
  })
})
