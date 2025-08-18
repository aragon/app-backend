import * as sinon from 'sinon'
import { expect } from 'chai'
import BlockchainTransferCrawler from '@modules/blockchainTransferCrawler'
import { NetworksEnum } from '@types'
import Utils from '@helpers/utils'
import Logger from '@logger'
import { Models } from '@dbModels'
import config from '@config'
import { UnitTestUtils } from '@test/lib/utils'
import ProviderModule from '@modules/provider'
import Web3Utils from '@helpers/web3Utils'
import * as retryRequestModule from '@helpers/retryRequest'
import BottleneckModule from '@modules/bottleneck'

describe('Modules:BlockchainTransferCrawler', () => {
  let sandbox: sinon.SinonSandbox
  let mockProvider: any
  let logError: any
  let logVerbose: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    mockProvider = {
      getBlockNumber: sandbox.stub(),
      send: sandbox.stub(),
    }
    logVerbose = sandbox.stub(Logger, 'verbose')
    logError = sandbox.stub(Logger, 'error')
    // Stub wait to speed up all tests
    sandbox.stub(Utils, 'wait').resolves()
    // Stub retryRequest to execute immediately without retries
    sandbox.stub(retryRequestModule, 'retryRequest').callsFake(async fn => {
      try {
        return await fn()
      } catch (error) {
        throw error
      }
    })
    // Stub BottleneckModule to execute immediately without rate limiting
    sandbox.stub(BottleneckModule, 'getNodeTransferLimiter').returns({
      schedule: sandbox.stub().callsFake(async fn => fn()),
    } as any)
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const fakeProviders: any = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: {},
        onTx: async () => {},
      })

      expect(crawler['network']).to.equal(NetworksEnum.ethereumMainnet)
      expect(crawler['filter']).to.deep.include({ fromBlock: 0, toBlock: 'latest' })
      expect(crawler['shutdown']).to.be.false
      expect(crawler['crawling']).to.be.false
      expect(crawler['isOnError']).to.be.false
      expect(crawler['crawlResult']).to.deep.include({
        network: NetworksEnum.ethereumMainnet,
        lastSync: 0,
        nbSuccess: 0,
        nbError: 0,
        nbTotal: 0,
      })
    })
  })

  describe('getBlockNumber', () => {
    it('should return the latest block number', async () => {
      const providerStub = {
        getBlockNumber: sandbox.stub().resolves(123),
      }
      sandbox.stub(ProviderModule, 'getProvider').callsFake(_ => providerStub as any)
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: {},
        onTx: async () => {},
      })

      const result = await crawler.getBlockNumber('latest')
      expect(result).to.equal(123)
    })

    it('should handle errors gracefully and return -1', async () => {
      const providerStub = {
        getBlockNumber: sandbox.stub().rejects(new Error('error')),
      }
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => providerStub as any)
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: {},
        onTx: async () => {},
      })

      const result = await crawler.getBlockNumber('latest')
      expect(result).to.equal(-1)
    })

    it('should return the block number when given a specific block', async () => {
      const fakeProviders: any = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: {},
        onTx: async () => {},
      })

      const result = await crawler.getBlockNumber(100)
      expect(result).to.equal(100)
    })
  })

  describe('crawl', () => {
    it('should crawl transfers correctly', async () => {
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => mockProvider as any)
      const error = new Error('Log response size exceeded')
      mockProvider.getBlockNumber.resolves(300)
      mockProvider.send
        .onCall(0)
        .rejects(error)
        .onCall(1)
        .resolves({
          transfers: [
            { transactionHash: '0x1', blockNum: 2 },
            { transactionHash: '0x2', blockNum: 3 },
          ],
        })
        .onCall(2)
        .resolves({ transfers: [] })

      const onTxStub = sandbox.stub().resolves()

      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: {},
        onTx: onTxStub,
      })

      await crawler.crawl()

      expect(onTxStub.calledTwice).to.be.true
      expect(logVerbose.calledWith('Finished crawling logs')).to.be.true
    })

    it('should crawl transfers correctly with logService', async () => {
      // Stub ConfigIndexer for tests that use logService
      sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(null)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => mockProvider as any)
      const stubSaveProgress = sandbox.stub(BlockchainTransferCrawler.prototype, 'onSaveProgress').resolves()
      mockProvider.getBlockNumber.resolves(16721863 + 10)
      mockProvider.send
        .onFirstCall()
        .resolves({
          transfers: [
            { transactionHash: '0x1', blockNum: 2 },
            { transactionHash: '0x2', blockNum: 3 },
          ],
        })
        .onSecondCall()
        .resolves([])

      const onTxStub = sandbox.stub().resolves()
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: {},
        onTx: onTxStub,
        logService: 'testService' as any,
      })

      await crawler.crawl()

      expect(onTxStub.calledTwice).to.be.true
      expect(onTxStub.calledTwice).to.be.true
      expect(stubSaveProgress.calledThrice).to.be.true
      expect(logVerbose.calledWith('Finished crawling logs')).to.be.true
    })

    it('should handle crawling', async () => {
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => mockProvider as any)
      let blockNumber = 16721863 + 20
      mockProvider.getBlockNumber.callsFake(() => Promise.resolve(blockNumber++))
      mockProvider.send.resolves({ transfers: [{ transactionHash: `0x${blockNumber}`, blockNum: blockNumber }] })

      const onTxStub = sandbox.stub().resolves()
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: {},
        onTx: onTxStub,
      })
      sandbox
        .stub(crawler, 'updateAndCheckConditions')
        .onFirstCall()
        .resolves(true)
        .onSecondCall()
        .resolves(true)
        .onThirdCall()
        .resolves(false)

      const stubProcessLogs = sandbox.spy(crawler, 'processTxs')

      await crawler.crawl()

      expect(stubProcessLogs.callCount).to.be.eq(1)
      expect(stubProcessLogs.args[0][0][0].blockNum).to.exist
      expect(onTxStub.callCount).to.be.eq(1)
      expect(logVerbose.calledWith('Finished crawling logs')).to.be.true
    })

    it('should handle transfers correctly', async () => {
      const getBlockNumberStub = sandbox.stub().resolves(10)
      const providerStub = {
        getBlockNumber: getBlockNumberStub,
        send: sandbox.stub().resolves({ transfers: [] }),
      }
      sandbox.stub(ProviderModule, 'getProvider').callsFake(_network => providerStub as any)
      const onTxStub = sandbox.stub().resolves()
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: { fromBlock: 0, toBlock: 10 },
        onTx: onTxStub,
      })

      const result = await crawler.crawl()
      expect(result).to.be.undefined
    })

    it('should handle transfers correctly - call convertToHexNumber', async () => {
      const getBlockNumberStub = sandbox.stub().resolves(20)

      const providerStub = {
        getBlockNumber: getBlockNumberStub,
        send: sandbox.stub().resolves({ transfers: [] }),
      }
      const convertToHexNumberStub = sandbox.spy(Web3Utils, 'convertToHexNumber')
      sandbox.stub(ProviderModule, 'getProvider').callsFake(_network => providerStub as any)

      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: { fromBlock: 123, toBlock: 123 },
        onTx: async () => {},
      })

      sandbox.stub(crawler, 'updateAndCheckConditions').onFirstCall().resolves(true).onSecondCall().resolves(false)
      sandbox.stub(crawler, 'getBlockNumber').onFirstCall().resolves(1).onSecondCall().resolves(10)
      const stubProcessTxs = sandbox.stub(crawler, 'processTxs').resolves(true as any)

      await crawler.crawl()

      expect(stubProcessTxs.calledOnce).to.be.true
      expect(convertToHexNumberStub.calledTwice).to.be.true
    })

    it('should handle transfers correctly - shutdown', async () => {
      const getBlockNumberStub = sandbox.stub().onCall(0).resolves(10).onCall(1).resolves(20)
      const providerStub = {
        getBlockNumber: getBlockNumberStub,
        send: sandbox.stub().resolves({ transfers: [] }),
      }
      const convertToHexNumberStub = sandbox.spy(Web3Utils, 'convertToHexNumber')
      sandbox.stub(ProviderModule, 'getProvider').callsFake(_network => providerStub as any)

      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: { fromBlock: 123, toBlock: 1234 },
        onTx: async () => {},
        shutdown: true,
      })

      sandbox.stub(crawler, 'updateAndCheckConditions').onFirstCall().resolves(true)
      sandbox.stub(crawler, 'getBlockNumber').onFirstCall().resolves(1).onSecondCall().resolves(200)
      const stubProcessTxs = sandbox.stub(crawler, 'processTxs').resolves(true as any)

      await crawler.crawl()

      expect(stubProcessTxs.calledOnce).to.be.true
      expect(convertToHexNumberStub.calledTwice).to.be.true
    })

    it('should throw an error if already crawling', async () => {
      const fakeProviders: any = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: {},
        onTx: async () => {},
      })
      crawler['crawling'] = true

      try {
        await crawler.crawl()
      } catch (error: any) {
        expect(error.message).to.equal('Already crawling')
      }
    })

    it('should break the crawl loop when an error occurs and stopOnError and shutdown are true', async () => {
      const providerStub = {
        getBlockNumber: sandbox.stub().onFirstCall().resolves(100).onSecondCall().resolves(100),
        send: sandbox.stub().rejects(new Error('Test Error')),
      }
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => providerStub as any)
      const onErrorStub = sandbox.stub()
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: { fromBlock: 90, toBlock: 110 },
        onTx: async () => {},
        onError: onErrorStub,
        stopOnError: true,
      })

      crawler.shutdown = true

      await crawler.crawl()

      expect(onErrorStub.calledOnce).to.be.true
      expect(crawler.shutdown).to.be.true
      expect(providerStub.send.calledOnce).to.be.true
      expect(crawler.crawling).to.be.false
    })
  })

  describe('handleErrors', () => {
    it('should reduce batch size on batch size error', async () => {
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: {},
        onTx: async () => {},
      })
      crawler['batchSize'] = 1000

      const error = new Error('The query timed out. Either reduce your query filters or retry this query')
      await crawler.handleErrors(error)

      expect(crawler['batchSize']).to.equal(1000)
    })

    it('should wait on rate limited error', async () => {
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: {},
        onTx: async () => {},
      })

      const error = new Error('Your app has exceeded its compute units per second capacity')
      await crawler.handleErrors(error)

      expect(Utils.wait.calledOnce).to.be.true
    })

    it('should call onError and shutdown on other errors', async () => {
      const onErrorStub = sandbox.stub()
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: {},
        onTx: async () => {},
        onError: onErrorStub,
      })

      const error = new Error('Some other error')
      await crawler.handleErrors(error)

      expect(onErrorStub.calledOnce).to.be.true
      expect(crawler['shutdown']).to.be.true
    })
  })

  describe('processTxs', () => {
    it('should process transactions successfully', async () => {
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const onTxStub = sandbox.stub().resolves()
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: {},
        onTx: onTxStub,
      })

      const txs = [{ hash: '0x1', blockNum: 10 }]
      await crawler.processTxs(txs as any)

      expect(onTxStub.calledOnce).to.be.true
      expect(crawler['crawlResult'].nbSuccess).to.equal(1)
    })

    it('should handle errors and increment error count', async () => {
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const onTxStub = sandbox.stub().rejects(new Error('Transaction error'))
      const onErrorStub = sandbox.stub()
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: {},
        onTx: onTxStub,
        onError: onErrorStub,
      })

      const txs = [{ hash: '0x1', blockNum: 10 }]
      await crawler.processTxs(txs as any)

      expect(onErrorStub.calledOnce).to.be.true
      expect(crawler['crawlResult'].nbError).to.equal(1)
    })
  })

  describe('getServiceStartBlock', () => {
    it('should getServiceStartBlock', async () => {
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const mockLogService = 'testService'
      const mockNetwork = NetworksEnum.ethereumMainnet
      const mockLastSync = 123456
      const findExistingLogStub = sandbox
        .stub(Models.ConfigIndexer, 'findExistingLog')
        .resolves({ lastSync: mockLastSync })

      const crawler = new BlockchainTransferCrawler({
        network: mockNetwork,
        filter: {},
        onTx: async () => {},
        logService: mockLogService as any,
      })

      const result = await crawler.getServiceStartBlock()
      expect(findExistingLogStub.calledOnceWith({ network: mockNetwork, service: mockLogService })).to.be.true
      expect(result).to.equal(mockLastSync)
    })

    it('should getServiceStartBlock from config', async () => {
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const mockLogService = 'testService'
      const mockNetwork = NetworksEnum.ethereumMainnet

      const crawler = new BlockchainTransferCrawler({
        network: mockNetwork,
        filter: {},
        onTx: async () => {},
        logService: mockLogService as any,
      })

      const result = await crawler.getServiceStartBlock()
      expect(result).to.equal(config.NODES.ETHEREUM_MAINNET.FROM_BLOCK)
    })
  })

  it('defaultOnError', async () => {
    BlockchainTransferCrawler.defaultOnError(new Error('Already crawling'))
    expect(logError.calledOnce).to.be.true
  })

  describe('onSaveProgress', () => {
    it('should onSaveProgress - create', async () => {
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const blockNumber = 10

      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: {},
        onTx: async () => {},
        onError: () => {},
        stopOnError: true,
        logService: 'testService' as any,
      })

      const spyModelFind = sandbox.spy(Models.ConfigIndexer, 'findExistingLog')
      const spyModelCreate = sandbox.spy(Models.ConfigIndexer, 'create')

      await crawler.onSaveProgress(blockNumber)

      expect(spyModelFind.calledOnceWith({ network: NetworksEnum.ethereumMainnet, service: 'testService' })).to.be.true
      expect(spyModelCreate.calledOnce).to.be.true
    })

    it('should onSaveProgress - update', async () => {
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const blockNumber = 10

      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.ethereumMainnet,
        filter: {},
        onTx: async () => {},
        onError: () => {},
        stopOnError: true,
        logService: 'testService' as any,
      })

      const fakeModel = { update: sandbox.stub().resolves() }
      const spyModelFind = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(fakeModel)
      const spyModelCreate = sandbox.spy(Models.ConfigIndexer, 'create')

      await crawler.onSaveProgress(blockNumber)

      expect(spyModelFind.calledOnceWith({ network: NetworksEnum.ethereumMainnet, service: 'testService' })).to.be.true
      expect(fakeModel.update.calledOnce).to.be.true
      expect(spyModelCreate.notCalled).to.be.true
    })
  })

  it('should stop crawling if batch size becomes too small', async () => {
    // Override the global stub to reject for this specific test
    ;(retryRequestModule.retryRequest as sinon.SinonStub).rejects(new Error('Log response size exceeded'))

    sandbox.stub(ProviderModule, 'getProvider').callsFake(network => mockProvider as any)
    mockProvider.getBlockNumber.resolves(100)

    const onErrorStub = sandbox.stub()
    const crawler = new BlockchainTransferCrawler({
      network: NetworksEnum.ethereumMainnet,
      filter: { fromBlock: 0, toBlock: 100 },
      onTx: async () => {},
      onError: onErrorStub,
    })

    // Override updateAndCheckConditions to control loop iterations
    let iterationCount = 0
    sandbox.stub(crawler, 'updateAndCheckConditions').callsFake(async () => {
      iterationCount++
      // Only allow 2 iterations to test batch size reduction
      return iterationCount <= 2
    })

    // Start with batch size 2, it should reduce to 1, then stop
    crawler['batchSize'] = 2
    crawler['originalBatchSize'] = 100

    await crawler.crawl()

    expect(crawler['batchSize']).to.equal(1)
    expect(onErrorStub.calledOnce).to.be.true
    expect(logError.calledWith('Batch size too small, stopping crawl')).to.be.true
    expect(crawler['shutdown']).to.be.true
  })

  it('should stop crawling if shutdown flag is set', async () => {
    sandbox.stub(ProviderModule, 'getProvider').callsFake(network => mockProvider as any)
    mockProvider.getBlockNumber.resolves(10)
    mockProvider.send.resolves({ transfers: [] })

    const onTxStub = sandbox.stub().resolves()
    const crawler = new BlockchainTransferCrawler({
      network: NetworksEnum.ethereumMainnet,
      filter: { fromBlock: 0, toBlock: 10 },
      onTx: onTxStub,
    })

    // Immediately set shutdown on first iteration
    sandbox.stub(crawler, 'updateAndCheckConditions').callsFake(async () => {
      crawler.shutdown = true
      return false // Return false to exit loop immediately
    })

    await crawler.crawl()

    expect(onTxStub.notCalled).to.be.true
    expect(logVerbose.calledWith('Finished crawling logs')).to.be.true
  })
})
