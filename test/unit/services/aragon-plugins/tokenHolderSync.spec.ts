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
import PoolingCrawler from '@modules/poolingCrawler'
import TransferCrawler from '@services/aragon-transfers/transferCrawler'

describe('AragonPlugins: TokenHolderSync', () => {
  let sandbox: SinonSandbox
  let blockScoutGetTokenCountersStub: SinonStub
  let proxyWeb3ProviderGetAllTokenHoldersStub: SinonStub
  let proxyMemberOptimizedDaoMembershipManagementStub: SinonStub
  let crawlerCrawlStub: SinonStub
  let loggerVerboseStub: SinonStub
  let loggerErrorStub: SinonStub
  let dbTxExecuteTxFnStub: SinonStub
  let configIndexerFindExistingLogStub: SinonStub
  let poolingCrawlerFilterLogsStub: SinonStub
  let transferCrawlerParseAndProcessTransferLogsStub: SinonStub

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
    proxyMemberOptimizedDaoMembershipManagementStub = sandbox.stub(ProxyMember, 'optimizedDaoMembershipManagement')

    // Stub PoolingCrawler and TransferCrawler
    poolingCrawlerFilterLogsStub = sandbox.stub(PoolingCrawler, 'filterLogs')
    transferCrawlerParseAndProcessTransferLogsStub = sandbox.stub(TransferCrawler, 'parseAndProcessTransferLogs')

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

    it('should return correct tag name for delegation type', () => {
      const result = TokenHolderSync.getTagName(mockPlugin, mockToken, TokenSyncTagName.Delegation)
      expect(result).to.equal('tokenVoting-ethereum-sepolia-0xPlugin123-0xToken456-delegation-event')
    })

    it('should return correct tag name for transfer type', () => {
      const result = TokenHolderSync.getTagName(mockPlugin, mockToken, TokenSyncTagName.Transfer)
      expect(result).to.equal('tokenVoting-ethereum-sepolia-0xPlugin123-0xToken456-transfer-event')
    })
  })

  describe('isOptimizedFlowNeeded', () => {
    it('should return false if token blockNumber is 0', async () => {
      const zeroBlockNumberToken = { ...mockToken, blockNumber: 0 }

      const result = await TokenHolderSync.isOptimizedFlowNeeded(zeroBlockNumberToken, mockPlugin)

      expect(result).to.be.false
      expect(blockScoutGetTokenCountersStub.called).to.be.false
    })

    it('should return false if token blockNumber is greater than or equal to plugin blockNumber', async () => {
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
      expect(findOneStub.firstCall.args[0]).to.deep.equal({
        network: mockPlugin.network,
        service: TokenHolderSync.getTagName(mockPlugin, mockToken, TokenSyncTagName.Default),
      })
    })

    it('should return false if token holder count is below threshold', async () => {
      blockScoutGetTokenCountersStub.resolves({ holders: '50', transfers: 100 })

      const findOneStub = Models.ConfigIndexer.findOne as SinonStub
      findOneStub.resolves(null)

      const result = await TokenHolderSync.isOptimizedFlowNeeded(mockToken, mockPlugin)

      expect(result).to.be.false
      expect(blockScoutGetTokenCountersStub.calledOnce).to.be.true
      expect(blockScoutGetTokenCountersStub.calledWith(mockPlugin.tokenAddress, mockPlugin.network)).to.be.true
      expect(findOneStub.calledOnce).to.be.true
    })

    it('should return true if token holder count is above threshold', async () => {
      blockScoutGetTokenCountersStub.resolves({ holders: '150', transfers: 100 })

      const findOneStub = Models.ConfigIndexer.findOne as SinonStub
      findOneStub.resolves(null)

      const result = await TokenHolderSync.isOptimizedFlowNeeded(mockToken, mockPlugin)

      expect(result).to.be.true
      expect(blockScoutGetTokenCountersStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('TokenHolderSync - Optimized flow needed', sinon.match.any)).to.be.true
    })

    it('should handle BlockScout API errors gracefully', async () => {
      blockScoutGetTokenCountersStub.rejects(new Error('BlockScout API error'))

      const findOneStub = Models.ConfigIndexer.findOne as SinonStub
      findOneStub.resolves(null)

      const result = await TokenHolderSync.isOptimizedFlowNeeded(mockToken, mockPlugin)

      expect(result).to.be.false
      expect(loggerErrorStub.calledWith('TokenHolderSync - Error checking optimized flow', sinon.match.any)).to.be.true
    })

    it('should handle invalid holder count gracefully', async () => {
      blockScoutGetTokenCountersStub.resolves({ holders: 'invalid', transfers: 100 })

      const findOneStub = Models.ConfigIndexer.findOne as SinonStub
      findOneStub.resolves(null)

      const result = await TokenHolderSync.isOptimizedFlowNeeded(mockToken, mockPlugin)

      expect(result).to.be.false
    })

    it('should handle missing holders property gracefully', async () => {
      blockScoutGetTokenCountersStub.resolves({ transfers: 100 })

      const findOneStub = Models.ConfigIndexer.findOne as SinonStub
      findOneStub.resolves(null)

      const result = await TokenHolderSync.isOptimizedFlowNeeded(mockToken, mockPlugin)

      expect(result).to.be.false
    })
  })

  describe('syncAllTokenHolders', () => {
    it('should skip sync if it was already completed', async () => {
      configIndexerFindExistingLogStub.resolves({ end: true })

      await TokenHolderSync.syncAllTokenHolders(mockPlugin, mockToken)

      expect(
        loggerVerboseStub.calledWith('TokenHolderSync - BlockScout sync already completed, skipping', sinon.match.any),
      ).to.be.true
      expect(proxyWeb3ProviderGetAllTokenHoldersStub.called).to.be.false
    })

    it('should start sync when no existing sync found', async () => {
      configIndexerFindExistingLogStub.resolves(null)
      proxyWeb3ProviderGetAllTokenHoldersStub.resolves({
        holders: [],
        total: 0,
        hasMore: false,
        lastPage: 0,
      })

      await TokenHolderSync.syncAllTokenHolders(mockPlugin, mockToken)

      expect(loggerVerboseStub.calledWith('TokenHolderSync - Starting/Resuming BlockScout sync', sinon.match.any)).to.be
        .true
      expect(proxyWeb3ProviderGetAllTokenHoldersStub.calledOnce).to.be.true
    })

    it('should resume sync when existing sync found', async () => {
      const existingSync = { lastSync: 500 }
      configIndexerFindExistingLogStub.resolves(existingSync)
      proxyWeb3ProviderGetAllTokenHoldersStub.resolves({
        holders: [],
        total: 0,
        hasMore: false,
        lastPage: 0,
      })

      await TokenHolderSync.syncAllTokenHolders(mockPlugin, mockToken)

      const verboseCall = loggerVerboseStub
        .getCalls()
        .find(call => call.args[0] === 'TokenHolderSync - Starting/Resuming BlockScout sync')
      expect(verboseCall!.args[1]).to.include({ lastSync: 500 })
    })

    it('should call getAllTokenHolders with correct parameters', async () => {
      configIndexerFindExistingLogStub.resolves(null)
      proxyWeb3ProviderGetAllTokenHoldersStub.resolves({
        holders: [],
        total: 0,
        hasMore: false,
        lastPage: 0,
      })

      await TokenHolderSync.syncAllTokenHolders(mockPlugin, mockToken)

      expect(proxyWeb3ProviderGetAllTokenHoldersStub.calledOnce).to.be.true

      const callArgs = proxyWeb3ProviderGetAllTokenHoldersStub.firstCall.args[0]
      expect(callArgs.address).to.equal(mockToken.address)
      expect(callArgs.network).to.equal(mockToken.network)
      expect(typeof callArgs.callback).to.equal('function')

      const expectedSyncKey = TokenHolderSync.getTagName(mockPlugin, mockToken, TokenSyncTagName.TokenHolders)
      expect(callArgs.syncKey).to.equal(expectedSyncKey)
    })

    it('should process holders batch with optimizedDaoMembershipManagement', async () => {
      const mockHolders = [
        { address: '0xHolder1', value: '100' },
        { address: '0xHolder2', value: '200' },
      ]

      configIndexerFindExistingLogStub.resolves(null)
      proxyMemberOptimizedDaoMembershipManagementStub.resolves()

      proxyWeb3ProviderGetAllTokenHoldersStub.callsFake(async ({ callback }) => {
        if (callback) {
          await callback(mockHolders)
        }
        return { holders: mockHolders, total: 2, hasMore: false, lastPage: 0 }
      })

      await TokenHolderSync.syncAllTokenHolders(mockPlugin, mockToken)

      expect(proxyMemberOptimizedDaoMembershipManagementStub.calledOnce).to.be.true
      expect(
        proxyMemberOptimizedDaoMembershipManagementStub.calledWith(
          mockHolders,
          mockPlugin.daoAddress,
          mockPlugin.address,
          mockToken.address,
          mockPlugin.network,
          mockPlugin.blockNumber,
        ),
      ).to.be.true
    })

    it('should skip processing when holders array is empty', async () => {
      configIndexerFindExistingLogStub.resolves(null)

      proxyWeb3ProviderGetAllTokenHoldersStub.callsFake(async ({ callback }) => {
        if (callback) {
          await callback([])
        }
        return { holders: [], total: 0, hasMore: false, lastPage: 0 }
      })

      await TokenHolderSync.syncAllTokenHolders(mockPlugin, mockToken)

      expect(proxyMemberOptimizedDaoMembershipManagementStub.called).to.be.false
    })

    it('should handle errors during batch processing', async () => {
      const mockHolders = [{ address: '0xHolder1', value: '100' }]
      const error = new Error('Batch processing failed')

      configIndexerFindExistingLogStub.resolves(null)
      proxyMemberOptimizedDaoMembershipManagementStub.rejects(error)

      proxyWeb3ProviderGetAllTokenHoldersStub.callsFake(async ({ callback }) => {
        if (callback) {
          try {
            await callback(mockHolders)
          } catch (e) {
            // Expected to throw
          }
        }
        return { holders: mockHolders, total: 1, hasMore: false, lastPage: 0 }
      })

      try {
        await TokenHolderSync.syncAllTokenHolders(mockPlugin, mockToken)
      } catch (e) {
        // Expected
      }

      expect(loggerErrorStub.calledWith('TokenHolderSync - Error processing batch', sinon.match.any)).to.be.true
    })

    it('should log completion status correctly', async () => {
      configIndexerFindExistingLogStub.resolves(null)
      const result = {
        holders: [],
        total: 0,
        hasMore: true,
        lastPage: 5,
      }
      proxyWeb3ProviderGetAllTokenHoldersStub.resolves(result)

      await TokenHolderSync.syncAllTokenHolders(mockPlugin, mockToken)

      expect(
        loggerVerboseStub.calledWith(
          'TokenHolderSync - Sync completed or suspended',
          sinon.match({
            hasMore: true,
            lastPage: 5,
          }),
        ),
      ).to.be.true
    })
  })

  describe('syncDelegationEvents', () => {
    beforeEach(() => {
      poolingCrawlerFilterLogsStub.resolves([])
      transferCrawlerParseAndProcessTransferLogsStub.resolves()
    })

    it('should create and call crawler for delegation events with correct parameters', async () => {
      await TokenHolderSync.syncDelegationEvents(mockPlugin, mockToken)

      expect(crawlerCrawlStub.calledOnce).to.be.true

      const crawler = crawlerCrawlStub.getCall(0).thisValue
      expect(crawler.crawlParams.network).to.equal(mockToken.network)
      expect(crawler.crawlParams.fromBlock).to.equal(mockToken.blockNumber)
      expect(crawler.crawlParams.batchSize).to.equal(1)
      expect(crawler.crawlParams.skipLogProcessing).to.be.true
      expect(crawler.crawlParams.stopOnError).to.be.false

      const expectedTagName = TokenHolderSync.getTagName(mockPlugin, mockToken, TokenSyncTagName.Delegation)
      expect(crawler.crawlParams.logService).to.equal(expectedTagName)
    })

    it('should use plugin blockNumber when token blockNumber is not available', async () => {
      const tokenWithoutBlockNumber = { ...mockToken, blockNumber: undefined }

      await TokenHolderSync.syncDelegationEvents(mockPlugin, tokenWithoutBlockNumber)

      expect(crawlerCrawlStub.calledOnce).to.be.true
      const crawler = crawlerCrawlStub.getCall(0).thisValue
      expect(crawler.crawlParams.fromBlock).to.equal(mockPlugin.blockNumber)
    })

    it('should handle errors during crawling', async () => {
      const error = new Error('Crawling failed')
      crawlerCrawlStub.callsFake(async function (this: BlockchainLogCrawler): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error)
        }
      })

      await TokenHolderSync.syncDelegationEvents(mockPlugin, mockToken)

      expect(loggerErrorStub.calledWith('Error Transfer Crawler', sinon.match.any)).to.be.true
    })

    it('should process logs through filterLogs when available', async () => {
      const mockLogs = [{ address: '0xTest', topics: ['0xTopic1'] }]
      const filteredLogs = [{ address: '0xTest', topics: ['0xTopic1'] }]

      poolingCrawlerFilterLogsStub.resolves(filteredLogs)
      transferCrawlerParseAndProcessTransferLogsStub.resolves()

      crawlerCrawlStub.callsFake(async function (this: BlockchainLogCrawler): Promise<any> {
        if ((this as any).crawlParams.filterLogs) {
          await (this as any).crawlParams.filterLogs(mockLogs)
        }
      })

      await TokenHolderSync.syncDelegationEvents(mockPlugin, mockToken)

      expect(poolingCrawlerFilterLogsStub.calledWith(mockLogs, mockToken.network)).to.be.true
      expect(transferCrawlerParseAndProcessTransferLogsStub.calledWith(filteredLogs, mockToken.network)).to.be.true
    })

    it('should skip processing when filterLogs returns empty array', async () => {
      const mockLogs = [{ address: '0xTest', topics: ['0xTopic1'] }]

      poolingCrawlerFilterLogsStub.resolves([])

      crawlerCrawlStub.callsFake(async function (this: BlockchainLogCrawler): Promise<any> {
        if ((this as any).crawlParams.filterLogs) {
          const result = await (this as any).crawlParams.filterLogs(mockLogs)
          expect(result).to.deep.equal([])
        }
      })

      await TokenHolderSync.syncDelegationEvents(mockPlugin, mockToken)

      expect(poolingCrawlerFilterLogsStub.calledWith(mockLogs, mockToken.network)).to.be.true
      expect(transferCrawlerParseAndProcessTransferLogsStub.called).to.be.false
    })
  })

  describe('syncTransfersEvents', () => {
    it('should create and call crawler for transfer events with correct parameters', async () => {
      await TokenHolderSync.syncTransfersEvents(mockPlugin, mockToken)

      expect(crawlerCrawlStub.calledOnce).to.be.true

      const crawler = crawlerCrawlStub.getCall(0).thisValue
      expect(crawler.crawlParams.onlyHistorical).to.be.true
      expect(crawler.crawlParams.network).to.equal(mockPlugin.network)
      expect(crawler.crawlParams.address).to.deep.equal([mockPlugin.tokenAddress])
      expect(crawler.crawlParams.fromBlock).to.equal(mockPlugin.blockNumber)
      expect(crawler.crawlParams.stopOnError).to.be.true

      const expectedTagName = TokenHolderSync.getTagName(mockPlugin, mockToken, TokenSyncTagName.Transfer)
      expect(crawler.crawlParams.logService).to.equal(expectedTagName)
    })

    it('should handle errors during transfer crawling', async () => {
      const error = new Error('Transfer crawling failed')
      const mockLog = { transactionHash: '0xHash123', logIndex: 1 }

      crawlerCrawlStub.callsFake(async function (this: BlockchainLogCrawler): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, mockLog)
        }
      })

      await TokenHolderSync.syncTransfersEvents(mockPlugin, mockToken)

      expect(loggerErrorStub.calledWith('Error TokenHolderSync - Transfers', sinon.match.any)).to.be.true
    })
  })

  describe('convertToStandardSync', () => {
    it('should convert optimized sync tags to standard sync', async () => {
      const findStub = Models.ConfigIndexer.find as SinonStub
      const deleteManyStub = Models.ConfigIndexer.deleteMany as SinonStub
      const createStub = Models.ConfigIndexer.create as SinonStub

      const mockSyncTags = [
        { service: 'delegation-tag', lastSync: 1200 },
        { service: 'transfer-tag', lastSync: 1500 },
      ]
      findStub.resolves(mockSyncTags)

      await TokenHolderSync.convertToStandardSync(mockPlugin, mockToken)

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
      const findStub = Models.ConfigIndexer.find as SinonStub
      const createStub = Models.ConfigIndexer.create as SinonStub

      findStub.resolves([])

      await TokenHolderSync.convertToStandardSync(mockPlugin, mockToken)

      expect(createStub.calledOnce).to.be.true

      const defaultTagName = TokenHolderSync.getTagName(mockPlugin, mockToken, TokenSyncTagName.Default)
      expect(createStub.firstCall.args[0]).to.deep.include({
        network: mockPlugin.network,
        service: defaultTagName,
        lastSync: mockPlugin.blockNumber,
      })
    })

    it('should delete the correct sync tags', async () => {
      const findStub = Models.ConfigIndexer.find as SinonStub
      const deleteManyStub = Models.ConfigIndexer.deleteMany as SinonStub

      findStub.resolves([])

      await TokenHolderSync.convertToStandardSync(mockPlugin, mockToken)

      const delegationTagName = TokenHolderSync.getTagName(mockPlugin, mockToken, TokenSyncTagName.Delegation)
      const transferTagName = TokenHolderSync.getTagName(mockPlugin, mockToken, TokenSyncTagName.Transfer)

      expect(
        deleteManyStub.calledWith(
          {
            network: mockPlugin.network,
            service: {
              $in: [delegationTagName, transferTagName],
            },
          },
          { session: sinon.match.any },
        ),
      ).to.be.true
    })

    it('should handle multiple sync tags and use the maximum lastSync value', async () => {
      const findStub = Models.ConfigIndexer.find as SinonStub
      const createStub = Models.ConfigIndexer.create as SinonStub

      const mockSyncTags = [
        { service: 'delegation-tag', lastSync: 800 },
        { service: 'transfer-tag', lastSync: 1200 },
        { service: 'other-tag', lastSync: 900 },
      ]
      findStub.resolves(mockSyncTags)

      await TokenHolderSync.convertToStandardSync(mockPlugin, mockToken)

      expect(createStub.firstCall.args[0]).to.deep.include({
        lastSync: 1200, // Max value
      })
    })

    it('should handle single sync tag', async () => {
      const findStub = Models.ConfigIndexer.find as SinonStub
      const createStub = Models.ConfigIndexer.create as SinonStub

      const mockSyncTags = [{ service: 'delegation-tag', lastSync: 1500 }]
      findStub.resolves(mockSyncTags)

      await TokenHolderSync.convertToStandardSync(mockPlugin, mockToken)

      expect(createStub.firstCall.args[0]).to.deep.include({
        lastSync: 1500,
      })
    })
  })

  describe('_getGovernanceLogConfigsByName', () => {
    it('should filter config logs by event name for DelegateVotesChanged', () => {
      // Since configIndexer is an array, we need to stub it directly
      const mockConfigs = [
        { event: IGovernanceErc20Logs.DelegateVotesChanged, topic: '0xTopic1', config: [] },
        { event: IGovernanceErc20Logs.Transfer, topic: '0xTopic2', config: [] },
        { event: 'OtherEvent', topic: '0xTopic3', config: [] },
        { event: IGovernanceErc20Logs.DelegateVotesChanged, topic: '0xTopic4', config: [] },
      ]

      // Replace the actual configIndexer with our mock - only one call is made
      const configIndexerStub = sandbox
        .stub(configIndexer, 'filter')
        .returns(mockConfigs.filter(c => c.event === IGovernanceErc20Logs.DelegateVotesChanged))

      const result = TokenHolderSync._getGovernanceLogConfigsByName(IGovernanceErc20Logs.DelegateVotesChanged)

      expect(Array.isArray(result)).to.be.true
      expect(result).to.have.length(2)
      expect(result.every(item => item.event === IGovernanceErc20Logs.DelegateVotesChanged)).to.be.true
      expect(configIndexerStub.callCount).to.equal(1)
    })

    it('should filter config logs by event name for Transfer', () => {
      const mockConfigs = [
        { event: IGovernanceErc20Logs.DelegateVotesChanged, topic: '0xTopic1', config: [] },
        { event: IGovernanceErc20Logs.Transfer, topic: '0xTopic2', config: [] },
        { event: 'OtherEvent', topic: '0xTopic3', config: [] },
      ]

      const configIndexerStub = sandbox
        .stub(configIndexer, 'filter')
        .returns(mockConfigs.filter(c => c.event === IGovernanceErc20Logs.Transfer))

      const result = TokenHolderSync._getGovernanceLogConfigsByName(IGovernanceErc20Logs.Transfer)

      expect(Array.isArray(result)).to.be.true
      expect(result).to.have.length(1)
      expect(result[0].event).to.equal(IGovernanceErc20Logs.Transfer)
      expect(configIndexerStub.callCount).to.equal(1)
    })

    it('should return empty array when no matching configs found', () => {
      const configIndexerStub = sandbox.stub(configIndexer, 'filter').returns([])

      const result = TokenHolderSync._getGovernanceLogConfigsByName(IGovernanceErc20Logs.Transfer)

      expect(Array.isArray(result)).to.be.true
      expect(result).to.have.length(0)
      expect(configIndexerStub.callCount).to.equal(1)
    })
  })
})
