import * as sinon from 'sinon'
import { SinonSandbox, SinonStub } from 'sinon'
import { expect } from 'chai'
import { TokenHolderSync } from '@plugins/tokenHolderSync'
import BlockScoutHelper from '@helpers/blockScout'
import { ProxyMember } from '@modules/proxyMember'
import DbTx from '@modules/dbTx'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { IGovernanceErc20Logs, NetworksEnum } from '@types'
import configIndexer from '@indexer/configIndexer'
import config from '@config'
import logger from '@logger'

describe('AragonPlugins: TokenHolderSync', () => {
  let sandbox: SinonSandbox
  let blockScoutGetTokenCountersStub: SinonStub
  let blockScoutGetAllTokenHoldersStub: SinonStub
  let proxyMemberCreateMemberStub: SinonStub
  let proxyMemberGetBalancesStub: SinonStub
  let proxyMemberAddToDaoStub: SinonStub
  let dbTxExecuteTxFnStub: SinonStub
  let crawlerCrawlStub: SinonStub
  let loggerVerboseStub: SinonStub
  let loggerErrorStub: SinonStub

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
    blockScoutGetAllTokenHoldersStub = sandbox.stub(BlockScoutHelper, 'getAllTokenHolders')

    // Stub ProxyMember methods
    proxyMemberCreateMemberStub = sandbox.stub(ProxyMember, 'createMember')
    proxyMemberGetBalancesStub = sandbox.stub(ProxyMember, 'getBalances')
    proxyMemberAddToDaoStub = sandbox.stub(ProxyMember, 'addToDao')

    // Stub DbTx
    dbTxExecuteTxFnStub = sandbox.stub(DbTx, 'executeTxFn')

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

  describe('isOptimizedFlowNeeded', () => {
    it('should return false if token is not a custom token', async () => {
      const sameBlockNumberToken = { ...mockToken, blockNumber: mockPlugin.blockNumber }

      const result = await TokenHolderSync.isOptimizedFlowNeeded(sameBlockNumberToken, mockPlugin)

      expect(result).to.be.false
      expect(blockScoutGetTokenCountersStub.called).to.be.false
    })

    it('should return false if token holder count is below threshold', async () => {
      blockScoutGetTokenCountersStub.resolves({ holders: '50', transfers: 100 })

      const result = await TokenHolderSync.isOptimizedFlowNeeded(mockToken, mockPlugin)

      expect(result).to.be.false
      expect(blockScoutGetTokenCountersStub.calledOnce).to.be.true
      expect(loggerVerboseStub.called).to.be.false
    })

    it('should return true if token holder count is above threshold', async () => {
      blockScoutGetTokenCountersStub.resolves({ holders: '150', transfers: 100 })

      const result = await TokenHolderSync.isOptimizedFlowNeeded(mockToken, mockPlugin)

      expect(result).to.be.true
      expect(blockScoutGetTokenCountersStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledOnce).to.be.true
    })

    it('should handle BlockScout API errors gracefully', async () => {
      blockScoutGetTokenCountersStub.rejects(new Error('BlockScout API error'))

      const result = await TokenHolderSync.isOptimizedFlowNeeded(mockToken, mockPlugin)

      expect(result).to.be.false
    })
  })

  describe('syncHoldersFromBlockScout', () => {
    it('should correctly process token holders from BlockScout', async () => {
      const mockHolders = [
        { address: '0xHolder1', value: '100' },
        { address: '0xHolder2', value: '200' },
      ]

      const mockMember = { id: 'member-1' }
      const mockBalance = {
        id: 'balance-1',
        increaseBalance: sandbox.stub().resolves({ id: 'updated-balance-1' }),
      }

      blockScoutGetAllTokenHoldersStub.callsFake(async (_address, _network, _options, callback) => {
        if (callback) {
          for (const holder of mockHolders) {
            await callback(holder)
          }
        }
        return { holders: mockHolders, total: mockHolders.length, hasMore: false }
      })

      proxyMemberCreateMemberStub.resolves(mockMember)
      proxyMemberGetBalancesStub.resolves(mockBalance)
      dbTxExecuteTxFnStub.callsFake(
        async fn => await fn({ session: { commitTransaction: () => {}, endSession: () => {} } }),
      )
      proxyMemberAddToDaoStub.resolves(mockMember)

      await TokenHolderSync.syncHoldersFromBlockScout(mockPlugin, mockToken)

      expect(blockScoutGetAllTokenHoldersStub.calledOnce).to.be.true
      expect(proxyMemberCreateMemberStub.calledTwice).to.be.true
      expect(proxyMemberGetBalancesStub.calledTwice).to.be.true
      expect(dbTxExecuteTxFnStub.calledTwice).to.be.true
      expect(proxyMemberAddToDaoStub.calledTwice).to.be.true
      expect(mockBalance.increaseBalance.calledTwice).to.be.true
    })

    it('should skip holders with invalid data', async () => {
      blockScoutGetAllTokenHoldersStub.callsFake(async (_address, _network, _options, callback) => {
        if (callback) {
          await callback({ address: '0xHolder1', value: '100' })
        }
        return { holders: [{ address: '0xHolder1', value: '100' }], total: 1, hasMore: false }
      })

      proxyMemberCreateMemberStub.resolves(null) // Member creation fails
      proxyMemberGetBalancesStub.resolves(null) // Balance retrieval fails

      await TokenHolderSync.syncHoldersFromBlockScout(mockPlugin, mockToken)

      expect(blockScoutGetAllTokenHoldersStub.calledOnce).to.be.true
      expect(proxyMemberCreateMemberStub.calledOnce).to.be.true
      expect(proxyMemberGetBalancesStub.calledOnce).to.be.true
      expect(dbTxExecuteTxFnStub.called).to.be.false
      expect(proxyMemberAddToDaoStub.called).to.be.false
    })

    it('should skip holders with zero balance', async () => {
      const mockHolders = [
        { address: '0xHolder1', value: '100' },
        { address: '0xHolder2', value: '0' }, // Zero balance holder
        { address: '0xHolder3', value: '200' },
      ]

      const mockMember = { id: 'member-1' }
      const mockBalance = {
        id: 'balance-1',
        increaseBalance: sandbox.stub().resolves({ id: 'updated-balance-1' }),
      }

      blockScoutGetAllTokenHoldersStub.callsFake(async (_address, _network, _options, callback) => {
        if (callback) {
          for (const holder of mockHolders) {
            await callback(holder)
          }
        }
        return { holders: mockHolders, total: mockHolders.length, hasMore: false }
      })

      proxyMemberCreateMemberStub.resolves(mockMember)
      proxyMemberGetBalancesStub.resolves(mockBalance)
      dbTxExecuteTxFnStub.callsFake(
        async fn => await fn({ session: { commitTransaction: () => {}, endSession: () => {} } }),
      )
      proxyMemberAddToDaoStub.resolves(mockMember)

      await TokenHolderSync.syncHoldersFromBlockScout(mockPlugin, mockToken)

      // Verify only two holders with non-zero balance were processed
      expect(proxyMemberCreateMemberStub.calledTwice).to.be.true
      expect(proxyMemberCreateMemberStub.firstCall.args[0]).to.equal('0xHolder1')
      expect(proxyMemberCreateMemberStub.secondCall.args[0]).to.equal('0xHolder3')

      // Verify zero balance holder was skipped
      expect(proxyMemberCreateMemberStub.neverCalledWith('0xHolder2')).to.be.true

      expect(proxyMemberGetBalancesStub.calledTwice).to.be.true
      expect(dbTxExecuteTxFnStub.calledTwice).to.be.true
      expect(proxyMemberAddToDaoStub.calledTwice).to.be.true
      expect(mockBalance.increaseBalance.calledTwice).to.be.true
    })
  })

  describe('syncDelegationEvents', () => {
    it('should create and call crawler for delegation events', async () => {
      await TokenHolderSync.syncDelegationEvents(mockPlugin, mockToken)

      expect(crawlerCrawlStub.calledOnce).to.be.true
      const crawler = crawlerCrawlStub.getCall(0).thisValue
      expect(crawler.crawlParams.onlyHistorical).to.be.true
      expect(crawler.crawlParams.network).to.equal(mockToken.network)
      expect(crawler.crawlParams.address).to.deep.equal([mockToken.address])
      expect(crawler.crawlParams.fromBlock).to.equal(mockToken.blockNumber)
    })
  })

  describe('syncTransfersEvents', () => {
    it('should create and call crawler for transfer events', async () => {
      await TokenHolderSync.syncTransfersEvents(mockPlugin, mockToken)

      expect(crawlerCrawlStub.calledOnce).to.be.true
      const crawler = crawlerCrawlStub.getCall(0).thisValue
      expect(crawler.crawlParams.onlyHistorical).to.be.true
      expect(crawler.crawlParams.network).to.equal(mockPlugin.network)
      expect(crawler.crawlParams.address).to.deep.equal([mockPlugin.tokenAddress])
      expect(crawler.crawlParams.fromBlock).to.equal(mockPlugin.blockNumber)
    })
  })

  describe('_getGovernanceLogConfigsByName', () => {
    it('should filter config logs by event name', () => {
      const result = TokenHolderSync._getGovernanceLogConfigsByName(IGovernanceErc20Logs.DelegateVotesChanged)
      expect(Array.isArray(result)).to.be.true
    })
  })
})
