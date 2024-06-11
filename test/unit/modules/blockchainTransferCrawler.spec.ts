import * as sinon from 'sinon'
import { expect } from 'chai'
import BlockchainTransferCrawler from '@modules/blockchainTransferCrawler'
import { ConfigState } from '@state/configState'
import { NetworksEnum } from '@types'
import Utils from '@helpers/utils'
import Logger from '@logger'
import Web3Helper from '@helpers/web3'
import BlockchainLogCrawler from "@modules/blockchainLogCrawler";

describe.only('Modules:BlockchainTransferCrawler', () => {
  let sandbox: sinon.SinonSandbox
  let mockProvider: any
  let logError: any
  let logVerbose: any
  let logWarn: any
  let logInfo: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    mockProvider = {
      getBlockNumber: sandbox.stub(),
      send: sandbox.stub(),
    }
    logVerbose = sandbox.stub(Logger, 'verbose')
    logWarn = sandbox.stub(Logger, 'warn')
    logInfo = sandbox.stub(Logger, 'info')
    logError = sandbox.stub(Logger, 'error')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('constructor', () => {
    it('should throw an error if the provider is not configured', () => {})
  })

  describe('constructor', () => {
    it('should throw an error if the provider is not configured', () => {
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(null)
      expect(
        () =>
          new BlockchainTransferCrawler({
            network: NetworksEnum.mainnet,
            filter: {},
            onTx: async () => {},
          }),
      ).to.throw('Provider not configured for network: mainnet')
    })

    it('should initialize with default values', () => {
      const providerStub = {}
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)

      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
        filter: {},
        onTx: async () => {},
      })

      expect(crawler['network']).to.equal(NetworksEnum.mainnet)
      expect(crawler['filter']).to.deep.include({ fromBlock: 0, toBlock: 'latest' })
      expect(crawler['shutdown']).to.be.false
      expect(crawler['crawling']).to.be.false
      expect(crawler['isOnError']).to.be.false
      expect(crawler['crawlResult']).to.deep.include({
        network: NetworksEnum.mainnet,
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
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
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
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
        filter: {},
        onTx: async () => {},
      })

      const result = await crawler.getBlockNumber('latest')
      expect(result).to.equal(-1)
    })

    it('should return the block number when given a specific block', async () => {
      const providerStub = {}
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
        filter: {},
        onTx: async () => {},
      })

      const result = await crawler.getBlockNumber(100)
      expect(result).to.equal(100)
    })
  })

  describe.only('crawl', () => {

    it('should crawl logs correctly', async () => {
      sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => mockProvider } as any)
      mockProvider.getBlockNumber.resolves(16721863 + 10)
      mockProvider.send
        .onFirstCall()
        .resolves({transfers: [{ transactionHash: '0x1', blockNum: 2 }, { transactionHash: '0x2', blockNum: 3 }]})
        .onSecondCall()
        .resolves([])

      const onTxStub = sandbox.stub().resolves()

      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
        filter: {},
        onTx: onTxStub,
      })

      await crawler.crawl()

      expect(onTxStub.calledTwice).to.be.true
      expect(onTxStub.calledTwice).to.be.true
      expect(logVerbose.calledWith('Finished crawling logs')).to.be.true
    })

    it('should crawl logs correctly with logService', async () => {
      const stubSaveProgress = sandbox.stub(BlockchainTransferCrawler.prototype, 'onSaveProgress').resolves()
      sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => mockProvider } as any)
      mockProvider.getBlockNumber.resolves(16721863 + 10)
      mockProvider.send
        .onFirstCall()
        .resolves({transfers: [{ transactionHash: '0x1', blockNum: 2 }, { transactionHash: '0x2', blockNum: 3 }]})
        .onSecondCall()
        .resolves([])

      const onTxStub = sandbox.stub().resolves()
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
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

    it('should handle continuous crawling with new blocks added', async () => {
      sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => mockProvider } as any)
      let blockNumber = 16721863 + 10
      mockProvider.getBlockNumber.callsFake(() => Promise.resolve(blockNumber++))
      mockProvider.send.resolves({transfers: [{ transactionHash: `0x${blockNumber}`, blockNum: blockNumber }]})

      const onTxStub = sandbox.stub().resolves()
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
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

      expect(stubProcessLogs.callCount).to.be.eq(2)
      expect(stubProcessLogs.args[0][0][0].blockNum).to.exist
      expect(stubProcessLogs.args[1][0][0].blockNum).to.exist
      expect(onTxStub.callCount).to.be.eq(2)
      expect(logVerbose.calledWith('Finished crawling logs')).to.be.true
    })




    it('should handle transfers correctly', async () => {
      const getBlockNumberStub = sandbox.stub().resolves(10)
      const providerStub = {
        getBlockNumber: getBlockNumberStub,
        send: sandbox.stub().resolves({ transfers: [] }),
      }
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)
      const onTxStub = sandbox.stub().resolves()
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
        filter: { fromBlock: 0, toBlock: 10 },
        onTx: onTxStub,
      })

      const result = await crawler.crawl()
      expect(result).to.be.undefined
    })

    it('should handle transfers correctly - call convertToHexNumber', async () => {
      const getBlockNumberStub = sandbox.stub().resolves(10)
      const providerStub = {
        getBlockNumber: getBlockNumberStub,
        send: sandbox.stub().resolves({ transfers: [] }),
      }
      const convertToHexNumberStub = sandbox.spy(Web3Helper, 'convertToHexNumber')
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)

      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
        filter: { fromBlock: 0, toBlock: 0 },
        onTx: async () => {},
      })

      sandbox.stub(crawler, 'updateAndCheckConditions').onFirstCall().resolves(true).onSecondCall().resolves(false)
      sandbox.stub(crawler, 'getBlockNumber').onFirstCall().resolves(1).onSecondCall().resolves(0)
      const stubProcessTxs = sandbox.stub(crawler, 'processTxs').resolves(true as any)

      await crawler.crawl()

      expect(stubProcessTxs.calledOnce).to.be.true
      expect(convertToHexNumberStub.calledTwice).to.be.true
    })

    it('should handle transfers correctly with logService', async () => {
      const stubSaveProgress = sandbox.stub(BlockchainTransferCrawler.prototype, 'onSaveProgress').resolves()
      const getBlockNumberStub = sandbox.stub().resolves(10)
      const providerStub = {
        getBlockNumber: getBlockNumberStub,
        send: sandbox.stub().resolves({ transfers: [] }),
      }
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)
      const onTxStub = sandbox.stub().resolves()
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
        filter: { fromBlock: 0, toBlock: 10 },
        onTx: onTxStub,
        logService: 'testService' as any,
      })

      const result = await crawler.crawl()
      expect(result).to.be.undefined
    })

    it('should handle transfers correctly - shutdown', async () => {
      const getBlockNumberStub = sandbox.stub().resolves(10)
      const providerStub = {
        getBlockNumber: getBlockNumberStub,
        send: sandbox.stub().resolves({ transfers: [] }),
      }
      const convertToHexNumberStub = sandbox.spy(Web3Helper, 'convertToHexNumber')
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)

      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
        filter: { fromBlock: 0, toBlock: 0 },
        onTx: async () => {},
        shutdown: true,
      })

      sandbox.stub(crawler, 'updateAndCheckConditions').onFirstCall().resolves(true)
      sandbox.stub(crawler, 'getBlockNumber').onFirstCall().resolves(1).onSecondCall().resolves(0)
      const stubProcessTxs = sandbox.stub(crawler, 'processTxs').resolves(true as any)

      await crawler.crawl()

      expect(stubProcessTxs.calledOnce).to.be.true
      expect(convertToHexNumberStub.calledTwice).to.be.true
    })

    it('should throw an error if already crawling', async () => {
      const providerStub = {}
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
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
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)
      const onErrorStub = sandbox.stub()
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
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
      const providerStub = {}
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
        filter: {},
        onTx: async () => {},
      })
      crawler['batchSize'] = 1000

      const error = new Error('The query timed out. Either reduce your query filters or retry this query')
      await crawler.handleErrors(error)

      expect(crawler['batchSize']).to.equal(500)
    })

    it('should wait on rate limited error', async () => {
      const waitStub = sandbox.stub(Utils, 'wait').resolves()
      const providerStub = {}
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
        filter: {},
        onTx: async () => {},
      })

      const error = new Error('Your app has exceeded its compute units per second capacity')
      await crawler.handleErrors(error)

      expect(waitStub.calledOnce).to.be.true
    })

    it('should call onError and shutdown on other errors', async () => {
      const onErrorStub = sandbox.stub()
      const providerStub = {}
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
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
      const providerStub = {}
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)
      const onTxStub = sandbox.stub().resolves()
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
        filter: {},
        onTx: onTxStub,
      })

      const txs = [{ hash: '0x1', blockNum: 10 }]
      await crawler.processTxs(txs as any)

      expect(onTxStub.calledOnce).to.be.true
      expect(crawler['crawlResult'].nbSuccess).to.equal(1)
    })

    it('should handle errors and increment error count', async () => {
      const providerStub = {}
      sandbox.stub(ConfigState.getInstance(), 'getConfigItem').returns(providerStub)
      const onTxStub = sandbox.stub().rejects(new Error('Transaction error'))
      const onErrorStub = sandbox.stub()
      const crawler = new BlockchainTransferCrawler({
        network: NetworksEnum.mainnet,
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

  it('defaultOnError', async () => {
    const loggerStub = sandbox.stub(Logger, 'error')
    BlockchainTransferCrawler.defaultOnError(new Error('Already crawling'))
    expect(loggerStub.calledOnce).to.be.true
  })
})
