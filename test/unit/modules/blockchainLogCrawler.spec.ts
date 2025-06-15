import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import logger from '@logger'
import { ICrawStrategy, NetworksEnum } from '@types'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import axios from 'axios'
import Utils from '@helpers/utils'
import config from '@config'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import Web3Utils from '@helpers/web3Utils'

describe('Module: blockchainLogCrawler', () => {
  let sandbox: SinonSandbox
  let mockProvider: any
  let logError: any
  let logVerbose: any
  let crawlerConfig: any
  beforeEach(() => {
    sandbox = sinon.createSandbox()
    mockProvider = {
      getBlockNumber: sandbox.stub(),
      send: sandbox.stub(),
    }
    logVerbose = sandbox.stub(logger, 'verbose')
    logError = sandbox.stub(logger, 'error')

    crawlerConfig = {
      network: NetworksEnum.ethereumMainnet,
      fromBlock: 100,
      toBlock: 200,
      address: '0xAddress',
      events: [],
      stopOnError: false,
      logService: 'indexer-ethereum-mainnet',
      onError: () => {},
    }
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('crawl', () => {
    it('should crawl logs correctly', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

      mockProvider.getBlockNumber
        .onFirstCall()
        .resolves(100) // Starting block number
        .onSecondCall()
        .resolves(200) // Latest block number
      const getLogsByStrategyStub = sandbox
        .stub(crawler, 'getLogsByStrategy')
        .onFirstCall()
        .resolves({
          logs: [
            { transactionHash: '0x1', blockNumber: 101, transactionIndex: 1 },
            { transactionHash: '0x2', blockNumber: 102, transactionIndex: 2 },
          ] as any,
          toBlock: 1231,
        })
        .onSecondCall()
        .resolves({ logs: [] as any, toBlock: 1231 })

      const updateAndCheckConditionsStub = sandbox
        .stub(crawler, 'updateAndCheckConditions')
        .onFirstCall()
        .resolves(true)
        .onSecondCall()
        .resolves(false)

      const onSaveProgressStub = sandbox.stub(crawler, 'onSaveProgress').resolves()
      const processLogsSpy = sandbox.spy(crawler, 'processLogs')

      await crawler.crawl()

      expect(updateAndCheckConditionsStub.calledOnce).to.be.true
      expect(processLogsSpy.calledOnceWith(sandbox.match.array)).to.be.true
      expect(logVerbose.calledWith('Finished crawling logs')).to.be.true
      expect(onSaveProgressStub.calledOnce).to.be.true
      expect(getLogsByStrategyStub.calledOnce).to.be.true
    })

    it('should throw error if already crawling', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)
      crawler['crawlSetting'].crawling = true

      try {
        await crawler.crawl()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect((error as Error).message).to.equal('Already crawling')
      }
    })

    it('should return early if current block equals latest block', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

      const getBlockNumberStub = sandbox
        .stub(Web3Helper, 'getBlockNumber')
        .onFirstCall()
        .resolves(100) // Both start and end are the same block
        .onSecondCall()
        .resolves(100)

      const result = await crawler.crawl()

      expect(result).to.deep.equal([])
      expect(crawler['crawlSetting'].crawling).to.be.false
      expect(getBlockNumberStub.calledTwice).to.be.true
    })

    it('should handle errors and retry with different strategy', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

      mockProvider.getBlockNumber.onFirstCall().resolves(100).onSecondCall().resolves(200)

      crawler['crawlParams'].strategy = ICrawStrategy.getLogsWithoutTopics

      sandbox
        .stub(crawler, 'updateAndCheckConditions')
        .onFirstCall()
        .resolves(true)
        .onSecondCall()
        .resolves(true)
        .onThirdCall()
        .resolves(false)

      // First call throws an error
      const getLogsByStrategyStub = sandbox
        .stub(crawler, 'getLogsByStrategy')
        .onFirstCall()
        .rejects(new Error('RPC Error'))
        .onSecondCall()
        .resolves({
          logs: [{ transactionHash: '0x3', blockNumber: 103, transactionIndex: 3 }] as any,
          toBlock: 150,
        })

      const handleErrorsSpy = sandbox.spy(crawler, 'handleErrors')

      await crawler.crawl()

      expect(handleErrorsSpy.calledOnce).to.be.true
      expect(crawler['crawlParams'].strategy).to.equal(ICrawStrategy.getLogsByBatch)

      expect(getLogsByStrategyStub.calledTwice).to.be.true
    })

    it('should skip processing logs when skipLogProcessing is true', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        skipLogProcessing: true,
      })

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

      mockProvider.getBlockNumber.onFirstCall().resolves(100).onSecondCall().resolves(200)

      const logs = [
        { transactionHash: '0x1', blockNumber: 101, transactionIndex: 1 },
        { transactionHash: '0x2', blockNumber: 102, transactionIndex: 2 },
      ]

      sandbox.stub(crawler, 'getLogsByStrategy').resolves({ logs: logs as any, toBlock: 150 })

      sandbox.stub(crawler, 'updateAndCheckConditions').onFirstCall().resolves(true).onSecondCall().resolves(false)

      const formatLogStub = sandbox.stub(crawler, 'formatLog').callsFake(log => ({ ...log, formatted: true }) as any)

      const processLogsSpy = sandbox.spy(crawler, 'processLogs')

      const result = await crawler.crawl()

      expect(processLogsSpy.notCalled).to.be.true
      expect(formatLogStub.calledTwice).to.be.true
      expect(result).to.have.lengthOf(2)
      expect(result?.[0]).to.have.property('formatted', true)
    })

    it('should break the loop when shutdown is triggered', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

      mockProvider.getBlockNumber.onFirstCall().resolves(100).onSecondCall().resolves(200)

      sandbox.stub(crawler, 'updateAndCheckConditions').resolves(true)

      const getLogsByStrategyStub = sandbox
        .stub(crawler, 'getLogsByStrategy')
        .onFirstCall()
        .resolves({
          logs: [{ transactionHash: '0x1', blockNumber: 101, transactionIndex: 1 }] as any,
          toBlock: 150,
        })
        .onSecondCall()
        .callsFake(() => {
          // Set shutdown to true before second call completes
          crawler['crawlSetting'].shutdown = true
          return Promise.resolve({
            logs: [{ transactionHash: '0x2', blockNumber: 151, transactionIndex: 1 }] as any,
            toBlock: 200,
          })
        })

      const processLogsSpy = sandbox.spy(crawler, 'processLogs')

      await crawler.crawl()

      expect(getLogsByStrategyStub.calledTwice).to.be.true
      expect(processLogsSpy.calledOnce).to.be.true
      expect(crawler['crawlSetting'].crawling).to.be.false
    })

    it('should use logService to get the starting block if available', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

      const getServiceStartBlockStub = sandbox.stub(crawler, 'getServiceStartBlock').resolves(150)

      mockProvider.getBlockNumber.onFirstCall().resolves(150).onSecondCall().resolves(200)

      sandbox.stub(crawler, 'updateAndCheckConditions').resolves(false)

      await crawler.crawl()

      expect(getServiceStartBlockStub.calledOnce).to.be.true
      expect(crawler['crawlSetting'].filter.fromBlock).to.equal(150)
    })

    it('should handle empty logs correctly', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

      mockProvider.getBlockNumber.onFirstCall().resolves(100).onSecondCall().resolves(200)

      sandbox.stub(crawler, 'getLogsByStrategy').resolves({ logs: [] as any, toBlock: 150 })

      sandbox.stub(crawler, 'updateAndCheckConditions').onFirstCall().resolves(true).onSecondCall().resolves(false)

      const sortLogsStub = sandbox.stub(crawler, 'sortLogs').returns([])
      const processLogsSpy = sandbox.spy(crawler, 'processLogs')

      await crawler.crawl()

      expect(processLogsSpy.notCalled).to.be.true
      expect(sortLogsStub.calledOnce).to.be.true
      expect(logVerbose.calledWith('Processing log')).to.be.true
    })
  })

  describe('getLogsByStrategy', () => {
    it('should call getLogsByBlockReceipts for getBlockReceipts strategy', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        strategy: ICrawStrategy.getBlockReceipts,
      })

      const getLogsByBlockReceiptsStub = sandbox
        .stub(crawler, 'getLogsByBlockReceipts')
        .resolves({ logs: [], toBlock: 150 })

      const result = await crawler.getLogsByStrategy(100, 200)

      expect(getLogsByBlockReceiptsStub.calledOnceWith(100, 200)).to.be.true
      expect(result).to.deep.equal({ logs: [], toBlock: 150 })
    })

    it('should call getLogsWithoutTopics for getLogsWithoutTopics strategy', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        strategy: ICrawStrategy.getLogsWithoutTopics,
      })

      const getLogsWithoutTopicsStub = sandbox
        .stub(crawler, 'getLogsWithoutTopics')
        .resolves({ logs: [], toBlock: 150 })

      const result = await crawler.getLogsByStrategy(100, 200)

      expect(getLogsWithoutTopicsStub.calledOnceWith(100, 200)).to.be.true
      expect(result).to.deep.equal({ logs: [], toBlock: 150 })
    })

    it('should call getLogsByBatch for getLogsByBatch strategy', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        strategy: ICrawStrategy.getLogsByBatch,
      })

      const getLogsByBatchStub = sandbox.stub(crawler, 'getLogsByBatch').resolves({ logs: [], toBlock: 150 })

      const result = await crawler.getLogsByStrategy(100, 200)

      expect(getLogsByBatchStub.calledOnceWith(100, 200)).to.be.true
      expect(result).to.deep.equal({ logs: [], toBlock: 150 })
    })

    it('should default to getLogsByBatch when an unknown strategy is provided', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        strategy: 'invalidStrategy' as any,
      })

      const getLogsByBatchStub = sandbox.stub(crawler, 'getLogsByBatch').resolves({ logs: [], toBlock: 150 })

      const result = await crawler.getLogsByStrategy(100, 200)

      expect(getLogsByBatchStub.calledOnceWith(100, 200)).to.be.true
      expect(result).to.deep.equal({ logs: [], toBlock: 150 })
    })
  })

  describe('getLogsByBatch', () => {
    it('should successfully fetch logs in a batch', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        events: [
          { topic: '0xTopic', event: 'Test', config: [{ abi: ['event Test()'], handler: sandbox.stub().resolves() }] },
        ],
      })

      // Mock successful response from executeBatchRequest
      const mockLogs = [
        { blockNumber: '0x65', transactionIndex: '0x1', logIndex: '0x0' },
        { blockNumber: '0x66', transactionIndex: '0x2', logIndex: '0x1' },
      ]
      const executeBatchStub = sandbox.stub(crawler, 'executeBatchRequest').resolves([{ result: mockLogs }])

      const result = await crawler.getLogsByBatch(100, 200)

      expect(executeBatchStub.calledOnceWith(['0xTopic'], 100, 200)).to.be.true
      expect(result.logs).to.have.lengthOf(2)
      expect(result.logs[0].blockNumber).to.equal(101) // 0x65 in decimal
      expect(result.logs[1].blockNumber).to.equal(102) // 0x66 in decimal
      expect(result.toBlock).to.equal(200)
      expect(crawler['crawlSetting'].shutdown).to.be.false
      expect(crawler['crawlSetting'].nbTotal).to.equal(2)
    })

    it('should handle batch size errors by reducing batch size', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        events: [
          { topic: '0xTopic', event: 'Test', config: [{ abi: ['event Test()'], handler: sandbox.stub().resolves() }] },
        ],
      })

      crawler['crawlSetting'].originalBatchSize = 100
      crawler['crawlSetting'].batchSize = 100

      // Mock batch size error on first attempt, success on second
      const batchSizeError = { error: { message: 'Response size is larger than 150MB limit' } }
      const executeBatchStub = sandbox
        .stub(crawler, 'executeBatchRequest')
        .onFirstCall()
        .resolves([batchSizeError])
        .onSecondCall()
        .resolves([{ result: [{ blockNumber: '0x65', transactionIndex: '0x1', logIndex: '0x0' }] }])

      const result = await crawler.getLogsByBatch(100, 200)

      expect(executeBatchStub.calledTwice).to.be.true
      expect(result.logs).to.have.lengthOf(1)
      expect(result.toBlock).to.equal(133) //as divide by 3
    })

    it('should stop crawling when batch size is already at minimum', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        events: [
          { topic: '0xTopic', event: 'Test', config: [{ abi: ['event Test()'], handler: sandbox.stub().resolves() }] },
        ],
      })

      crawler['crawlSetting'].batchSize = 1
      // Mock batch size error
      const batchSizeError = { error: { message: 'Response size is larger than 150MB limit' } }
      const executeBatchStub = sandbox.stub(crawler, 'executeBatchRequest').resolves([batchSizeError])
      const errorStub = sandbox.stub()
      crawler['crawlParams'].onError = errorStub

      const result = await crawler.getLogsByBatch(100, 200)

      expect(executeBatchStub.calledOnce).to.be.true
      expect(logError.calledWith('Batch size too small, stopping crawl')).to.be.true
      expect(crawler['crawlSetting'].shutdown).to.be.true
      expect(errorStub.calledOnce).to.be.true
      expect(result.logs).to.be.empty
    })

    it('should reset batch size to original value only when runCount <= 2', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        events: [
          { topic: '0xTopic', event: 'Test', config: [{ abi: ['event Test()'], handler: sandbox.stub().resolves() }] },
        ],
      })

      // Set initial values
      crawler['crawlSetting'].originalBatchSize = 100
      crawler['crawlSetting'].batchSize = 30 // Simulates already reduced batch size

      // Case 1: runCount = 2 - should reset batch size
      crawler['crawlSetting'].runCount = 2

      // Mock successful response from executeBatchRequest
      const mockLogs = [{ blockNumber: '0x65', transactionIndex: '0x1', logIndex: '0x0' }]
      sandbox.stub(crawler, 'executeBatchRequest').resolves([{ result: mockLogs }])

      await crawler.getLogsByBatch(100, 200)

      // Batch size should be reset to original
      expect(crawler['crawlSetting'].batchSize).to.equal(100)

      // Reset stubs
      sandbox.restore()

      // Case 2: runCount = 3 - should NOT reset batch size
      const crawler2 = new BlockchainLogCrawler({
        ...crawlerConfig,
        events: [
          { topic: '0xTopic', event: 'Test', config: [{ abi: ['event Test()'], handler: sandbox.stub().resolves() }] },
        ],
      })

      crawler2['crawlSetting'].originalBatchSize = 100
      crawler2['crawlSetting'].batchSize = 30
      crawler2['crawlSetting'].runCount = 3

      sandbox.stub(crawler2, 'executeBatchRequest').resolves([{ result: mockLogs }])

      await crawler2.getLogsByBatch(100, 200)

      // Batch size should remain unchanged
      expect(crawler2['crawlSetting'].batchSize).to.equal(30)
    })

    it('should handle non-batch size errors by stopping the crawl', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        events: [
          { topic: '0xTopic', event: 'Test', config: [{ abi: ['event Test()'], handler: sandbox.stub().resolves() }] },
        ],
      })

      crawler['crawlSetting'].batchSize = 100

      // Mock a general RPC error
      const rpcError = { error: { message: 'RPC connection error' } }
      const executeBatchStub = sandbox.stub(crawler, 'executeBatchRequest').resolves([rpcError])

      const handleErrorsStub = sandbox.stub(crawler, 'handleErrors').resolves()

      const result = await crawler.getLogsByBatch(100, 200)

      expect(executeBatchStub.calledOnce).to.be.true
      expect(handleErrorsStub.calledOnce).to.be.true
      expect(crawler['crawlSetting'].shutdown).to.be.true
      expect(result.logs).to.be.empty
      expect(result.toBlock).to.equal(200)
    })

    it('should handle exceptions during execution', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        events: [
          { topic: '0xTopic', event: 'Test', config: [{ abi: ['event Test()'], handler: sandbox.stub().resolves() }] },
        ],
      })

      // Mock an exception in executeBatchRequest
      const executeBatchStub = sandbox.stub(crawler, 'executeBatchRequest').rejects(new Error('Network error'))

      const handleErrorsStub = sandbox.stub(crawler, 'handleErrors').resolves()

      const result = await crawler.getLogsByBatch(100, 200)

      expect(executeBatchStub.calledOnce).to.be.true
      expect(handleErrorsStub.calledOnce).to.be.true
      expect(result.logs).to.be.empty
    })

    it('should apply filterLogs if provided', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        events: [
          { topic: '0xTopic', event: 'Test', config: [{ abi: ['event Test()'], handler: sandbox.stub().resolves() }] },
        ],
      })

      const mockLogs = [
        { blockNumber: '0x65', transactionIndex: '0x1', logIndex: '0x0' }, // Should be filtered out
        { blockNumber: '0x66', transactionIndex: '0x2', logIndex: '0x1' }, // Should remain
      ]
      sandbox.stub(crawler, 'executeBatchRequest').resolves([{ result: mockLogs }])

      const filterStub = sandbox.stub().resolves(mockLogs.filter(log => log.blockNumber === '0x66'))
      crawler['crawlParams'].filterLogs = filterStub

      const result = await crawler.getLogsByBatch(100, 200)

      expect(filterStub.calledOnce).to.be.true
      expect(result.logs).to.have.lengthOf(1)
      expect(result.logs[0].blockNumber).to.equal(102)
    })
  })

  describe('getLogsWithoutTopics', () => {
    it('should successfully fetch logs without topics and filter them', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        events: [
          {
            topic: '0xTopic1',
            event: 'Test1',
            config: [{ abi: ['event Test1()'], handler: sandbox.stub().resolves() }],
          },
          {
            topic: '0xTopic2',
            event: 'Test2',
            config: [{ abi: ['event Test2()'], handler: sandbox.stub().resolves() }],
          },
        ],
      })

      crawler['crawlSetting'].batchSize = 50
      const allLogs = [
        { topics: ['0xTopic1'], blockNumber: 101 },
        { topics: ['0xTopic2'], blockNumber: 102 },
        { topics: ['0xTopic3'], blockNumber: 103 }, // Should be filtered out
      ]

      const mockProvider = {
        getLogs: sandbox.stub().resolves(allLogs),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').resolves(mockProvider)

      const result = await crawler.getLogsWithoutTopics(100, 200)

      expect(result.logs).to.have.lengthOf(2)
      expect(result.logs[0].blockNumber).to.equal(101)
      expect(result.logs[1].blockNumber).to.equal(102)
      expect(result.toBlock).to.equal(150)
    })

    it('should apply filterLogs if provided', async () => {
      const filterLogsFn = sandbox.stub().callsFake(logs => logs.filter(log => log.blockNumber === 101))

      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        events: [
          {
            topic: '0xTopic1',
            event: 'Test1',
            config: [{ abi: ['event Test1()'], handler: sandbox.stub().resolves() }],
          },
          {
            topic: '0xTopic2',
            event: 'Test2',
            config: [{ abi: ['event Test2()'], handler: sandbox.stub().resolves() }],
          },
        ],
      })
      crawler['crawlSetting'].batchSize = 50
      crawler['crawlParams'].filterLogs = filterLogsFn

      const allLogs = [
        { topics: ['0xTopic1'], blockNumber: 101 }, // Should remain after both filters
        { topics: ['0xTopic2'], blockNumber: 102 }, // Should be filtered out by filterLogs
      ]

      // Mock provider and getLogs method
      const mockProvider = {
        getLogs: sandbox.stub().resolves(allLogs),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').resolves(mockProvider)

      const result = await crawler.getLogsWithoutTopics(100, 200)

      expect(filterLogsFn.calledOnce).to.be.true
      expect(result.logs).to.have.lengthOf(1)
      expect(result.logs[0].blockNumber).to.equal(101)
    })

    it('should handle batch size errors by logging and re-throwing', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      crawler['crawlSetting'].batchSize = 100

      const batchSizeError = new Error('query returned more than 10000 results')

      const mockProvider = {
        getLogs: sandbox.stub().rejects(batchSizeError),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').resolves(mockProvider)

      sandbox.stub(crawler, 'isBatchSizeError').returns(true)

      const logWarnSpy = sandbox.stub(logger, 'warn')

      try {
        await crawler.getLogsWithoutTopics(100, 200)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(batchSizeError)
        expect(logWarnSpy.calledOnce).to.be.true
        expect(logWarnSpy.firstCall.args[0]).to.equal('Batch size error in getLogs, will switch to batch strategy')
      }
    })

    it('should handle other errors by re-throwing without logging', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        events: [
          {
            topic: '0xTopic1',
            event: 'Test1',
            config: [{ abi: ['event Test1()'], handler: sandbox.stub().resolves() }],
          },
        ],
      })

      crawler['crawlSetting'].batchSize = 50

      const regularError = new Error('Network connection error')

      const mockProvider = {
        getLogs: sandbox.stub().rejects(regularError),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').resolves(mockProvider)
      sandbox.stub(crawler, 'isBatchSizeError').returns(false)
      const logWarnSpy = sandbox.stub(logger, 'warn')

      try {
        await crawler.getLogsWithoutTopics(100, 200)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(regularError)
        expect(logWarnSpy.called).to.be.false
      }
    })

    it('should log and re-thrown when batch size is too error', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      crawler['crawlSetting'].batchSize = 100

      const batchSizeError = new Error('The query timed out')

      const mockProvider = {
        getLogs: sandbox.stub().rejects(batchSizeError),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').resolves(mockProvider)

      sandbox.stub(crawler, 'isBatchSizeError').returns(true)

      const logWarnSpy = sandbox.stub(logger, 'warn')

      try {
        await crawler.getLogsWithoutTopics(100, 200)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(batchSizeError)
        expect(logWarnSpy.calledOnce).to.be.true
        expect(logWarnSpy.firstCall.args[0]).to.equal('Batch size error in getLogs, will switch to batch strategy')
      }
    })
  })

  describe('getLogsByBlockReceipts', () => {
    const mockResponse = {
      data: [
        {
          id: 'block-100',
          result: [
            {
              logs: [
                {
                  topics: ['0xTopic1'],
                  blockNumber: '0x64', // 100 in hex
                  transactionIndex: '0x1',
                  logIndex: '0x0',
                },
                {
                  topics: ['0xTopic3'], // Should be filtered out
                  blockNumber: '0x64',
                  transactionIndex: '0x2',
                  logIndex: '0x1',
                },
              ],
            },
          ],
        },
        {
          id: 'block-101',
          result: [
            {
              logs: [
                {
                  topics: ['0xTopic2'],
                  blockNumber: '0x65', // 101 in hex
                  transactionIndex: '0x1',
                  logIndex: '0x0',
                },
              ],
            },
          ],
        },
        {
          id: 'block-102',
          result: [], // Empty block
        },
      ],
    }

    it('should fetch logs from block receipts successfully', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        events: [
          {
            topic: '0xTopic1',
            event: 'Test1',
            config: [{ abi: ['event Test1()'], handler: sandbox.stub().resolves() }],
          },
          {
            topic: '0xTopic2',
            event: 'Test2',
            config: [{ abi: ['event Test2()'], handler: sandbox.stub().resolves() }],
          },
        ],
      })

      sandbox.stub(crawler, 'getProviderUrl').resolves('https://ethereum-rpc.com')

      sandbox.stub(axios, 'post').resolves(mockResponse)

      const result = await crawler.getLogsByBlockReceipts(100, 102)

      expect(result.logs).to.have.lengthOf(2)
      expect(result.logs[0].topics[0]).to.equal('0xTopic1')
      expect(result.logs[0].blockNumber).to.equal(100)
      expect(result.logs[1].topics[0]).to.equal('0xTopic2')
      expect(result.logs[1].blockNumber).to.equal(101)
      expect(result.toBlock).to.equal(102)
    })

    it('should apply filterLogs if provided', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        events: [
          {
            topic: '0xTopic1',
            event: 'Test1',
            config: [{ abi: ['event Test1()'], handler: sandbox.stub().resolves() }],
          },
          {
            topic: '0xTopic2',
            event: 'Test2',
            config: [{ abi: ['event Test2()'], handler: sandbox.stub().resolves() }],
          },
        ],
      })

      sandbox.stub(crawler, 'getProviderUrl').resolves('https://ethereum-rpc.com')

      sandbox.stub(axios, 'post').resolves(mockResponse)

      const filterLogsFn = sandbox.stub().callsFake(logs => logs.filter(log => log.topics[0] === '0xTopic1'))

      crawler['crawlParams'].filterLogs = filterLogsFn

      const result = await crawler.getLogsByBlockReceipts(100, 102)

      expect(filterLogsFn.calledOnce).to.be.true
      expect(result.logs).to.have.lengthOf(1)
      expect(result.logs[0].topics[0]).to.equal('0xTopic1')
      expect(result.logs[0].blockNumber).to.equal(100)
    })

    it('should fails entire responses in block receipts if some fails', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        events: [
          {
            topic: '0xTopic1',
            event: 'Test1',
            config: [{ abi: ['event Test1()'], handler: sandbox.stub().resolves() }],
          },
        ],
      })

      sandbox.stub(crawler, 'getProviderUrl').resolves('https://ethereum-rpc.com')

      const mockResponse = {
        data: [
          {
            id: 'block-100',
            error: { code: -32000, message: 'Block not found' }, // Error for block 100
          },
          {
            id: 'block-101',
            result: [
              {
                logs: [
                  {
                    topics: ['0xTopic1'],
                    blockNumber: '0x65', // 101 in hex
                    transactionIndex: '0x1',
                    logIndex: '0x0',
                  },
                ],
              },
            ],
          },
          {
            id: 'block-102',
            result: null, // Null result
          },
        ],
      }

      const axiosStub = sandbox.stub(axios, 'post').resolves(mockResponse)

      const result = await crawler.getLogsByBlockReceipts(100, 102)
      expect(crawler['crawlSetting'].shutdown).to.be.true
      expect(result.logs).to.have.lengthOf(0)
      expect(axiosStub.calledOnce).to.be.true
      expect(axiosStub.args[0][1]).to.be.an('array').with.lengthOf(3)
    })

    it('should handle HTTP request errors', async () => {
      const onErrorStub = sandbox.stub()
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      sandbox.stub(crawler, 'getProviderUrl').resolves('https://ethereum-rpc.com')

      crawler['crawlParams'].onError = onErrorStub
      const networkError = new Error('Network connection error')
      sandbox.stub(axios, 'post').rejects(networkError)

      const logWarnStub = sandbox.stub(logger, 'warn')

      const result = await crawler.getLogsByBlockReceipts(100, 102)

      expect(result.logs).to.be.empty
      expect(logWarnStub.calledOnce).to.be.true
      expect(logWarnStub.firstCall.args[0]).to.equal('Batch request failed, falling back to individual requests')
      expect(crawler['crawlSetting'].shutdown).to.be.true
      expect(onErrorStub.calledOnceWith(networkError)).to.be.true
    })

    it('should use default endBlock when not provided', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        events: [
          {
            topic: '0xTopic1',
            event: 'Test1',
            config: [{ abi: ['event Test1()'], handler: sandbox.stub().resolves() }],
          },
        ],
      })

      sandbox.stub(crawler, 'getProviderUrl').resolves('https://ethereum-rpc.com')

      const axiosPostStub = sandbox.stub(axios, 'post').resolves({
        data: [
          {
            id: 'block-100',
            result: [
              {
                logs: [
                  {
                    topics: ['0xTopic1'],
                    blockNumber: '0x64',
                    transactionIndex: '0x1',
                    logIndex: '0x0',
                  },
                ],
              },
            ],
          },
        ],
      })

      const result = await crawler.getLogsByBlockReceipts(100)

      expect(result.toBlock).to.equal(100)

      const requestsArg = axiosPostStub.firstCall.args[1]
      expect(requestsArg).to.have.lengthOf(1)
      expect((requestsArg as any)[0].params[0]).to.equal('0x64') // Hex for 100
    })
  })

  describe('getProviderUrl', () => {
    it('should get URL from provider when getProvider exists', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      // Mock provider with getProvider function
      const mockCoreProvider = {
        connection: {
          url: 'https://custom-ethereum-rpc.com',
        },
      }

      const mockProvider = {
        config: {
          getProvider: sandbox.stub().resolves(mockCoreProvider),
        },
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').resolves(mockProvider)

      const url = await crawler.getProviderUrl()

      expect(url).to.equal('https://custom-ethereum-rpc.com')
      expect(mockProvider.config.getProvider.calledOnce).to.be.true
    })

    it('should fall back to config when getProvider does not exist', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      // Mock provider without getProvider function
      const mockProvider = {
        config: {},
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').resolves(mockProvider)

      sandbox.stub(config, 'NODES').value({
        ETHEREUM_MAINNET: {
          ARAGON_RPC: 'https://fallback-ethereum-rpc.com',
        },
      })

      const url = await crawler.getProviderUrl()

      expect(url).to.equal('https://fallback-ethereum-rpc.com')
    })

    it('should handle provider with no config property', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      // Mock provider with no config property
      const mockProvider = {}

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').resolves(mockProvider)

      sandbox.stub(config, 'NODES').value({
        ETHEREUM_MAINNET: {
          ARAGON_RPC: 'https://fallback-ethereum-rpc.com',
        },
      })

      const url = await crawler.getProviderUrl()

      expect(url).to.equal('https://fallback-ethereum-rpc.com')
    })
  })

  describe('executeBatchRequest', () => {
    it('should create and execute batch requests for topics', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      sandbox.stub(crawler, 'getProviderUrl').resolves('https://ethereum-rpc.com')

      const topics = ['0xTopic1', '0xTopic2', '0xTopic3', '0xTopic4', '0xTopic5']

      const mockResponse = {
        data: [
          {
            id: 'request-id-1',
            result: [{ blockNumber: '0x64', transactionIndex: '0x1', logIndex: '0x0' }],
          },
          {
            id: 'request-id-2',
            result: [{ blockNumber: '0x65', transactionIndex: '0x2', logIndex: '0x1' }],
          },
        ],
      }
      const axiosPostStub = sandbox.stub(axios, 'post').resolves(mockResponse)

      const result: any = await crawler.executeBatchRequest(topics, 100, 150)

      expect(result).to.equal(mockResponse.data)

      expect(axiosPostStub.calledOnce).to.be.true

      const [url, requests] = axiosPostStub.firstCall.args as [string, any[]]
      expect(url).to.equal('https://ethereum-rpc.com')
      expect(requests).to.have.lengthOf(2)

      expect(requests[0].method).to.equal('eth_getLogs')
      expect(requests[0].params[0].fromBlock).to.equal('0x64')
      expect(requests[0].params[0].toBlock).to.equal('0x96')
      expect(requests[0].params[0].topics[0]).to.deep.equal(['0xTopic1', '0xTopic2', '0xTopic3', '0xTopic4'])

      expect(requests[1].method).to.equal('eth_getLogs')
      expect(requests[1].params[0].topics[0]).to.deep.equal(['0xTopic5'])
    })

    it('should log and rethrow errors', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      sandbox.stub(crawler, 'getProviderUrl').resolves('https://ethereum-rpc.com')

      sandbox.stub(Utils, 'chunkArray').returns([['0xTopic1']])

      const networkError = new Error('Network connection error')

      sandbox.stub(axios, 'post').rejects(networkError)

      try {
        await crawler.executeBatchRequest(['0xTopic1'], 100, 150)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(networkError)

        expect(logError.calledOnce).to.be.true
        expect(logError.firstCall.args[0]).to.equal('error executeBatchRequest')
      }
    })
  })

  it('should sort logs, process and parse', async () => {
    // Mock the logs to simulate input
    const unsortedLogs = [
      { blockNumber: 102, transactionIndex: 2, index: 0, topics: ['0xTopic1'], data: '0xData1' },
      { blockNumber: 101, transactionIndex: 1, index: 0, topics: ['0xTopic2'], data: '0xData2' },
      { blockNumber: 101, transactionIndex: 1, index: 1, topics: ['0xTopic3'], data: '0xData3' },
      { blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xTopic4'], data: '0xData4' },
    ] as any

    // Expected sorted logs
    const sortedLogs = [
      { blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xTopic4'], data: '0xData4' },
      { blockNumber: 101, transactionIndex: 1, index: 0, topics: ['0xTopic2'], data: '0xData2' },
      { blockNumber: 101, transactionIndex: 1, index: 1, topics: ['0xTopic3'], data: '0xData3' },
      { blockNumber: 102, transactionIndex: 2, index: 0, topics: ['0xTopic1'], data: '0xData1' },
    ] as any

    // Mock event settings
    const events = [
      { topic: '0xTopic1', event: 'Test1', config: [{ abi: ['event Test1()'], handler: sandbox.stub().resolves() }] },
      { topic: '0xTopic2', event: 'Test2', config: [{ abi: ['event Test2()'], handler: sandbox.stub().resolves() }] },
      { topic: '0xTopic3', event: 'Test3', config: [{ abi: ['event Test3()'], handler: sandbox.stub().resolves() }] },
      { topic: '0xTopic4', event: 'Test4', config: [{ abi: ['event Test4()'], handler: sandbox.stub().resolves() }] },
    ] as any

    const parseLogStub = sandbox.stub(Web3Utils, 'parseLog').callsFake(
      (log, iface) =>
        ({
          event: iface.fragments[0].name,
          args: {},
        }) as any,
    )
    const parseInfoLogStub = sandbox.stub(Web3Utils, 'parseInfoLog').returns({} as any)

    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.ethereumMainnet,
      fromBlock: 100,
      toBlock: 200,
      address: '0xAddress',
      events,
      stopOnError: false,
      logService: null,
      onError: sandbox.stub(),
    })

    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)
    const processLogsSpy = sandbox.spy(crawler, 'processLogs')

    await crawler.processLogs(unsortedLogs, {
      fromBlock: 100,
      toBlock: 150,
      latestBlock: 200,
    })

    const processedLogs = processLogsSpy.args[0][0]
    expect(processedLogs.length).to.deep.equal(sortedLogs.length)
    expect(parseLogStub.callCount).to.equal(4)
    expect(parseInfoLogStub.callCount).to.equal(4)
    expect(crawler.crawlSetting.nbSuccess).to.equal(4)

    for (const event of events) {
      expect(event.config[0].handler.calledOnce).to.be.true
    }
  })

  it('should sort logs by transactionIndex and index within the same block', async () => {
    // Mock logs with the same blockNumber but different transactionIndex and index
    const unsortedLogs = [
      { blockNumber: 101, transactionIndex: 1, index: 1, topics: ['0xTopic1'], data: '0xData1' },
      { blockNumber: 101, transactionIndex: 1, index: 0, topics: ['0xTopic2'], data: '0xData2' },
      { blockNumber: 101, transactionIndex: 0, index: 1, topics: ['0xTopic3'], data: '0xData3' },
      { blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xTopic4'], data: '0xData4' },
    ] as any

    // Expected sorted logs
    const sortedLogs = [
      { blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xTopic4'], data: '0xData4' },
      { blockNumber: 101, transactionIndex: 0, index: 1, topics: ['0xTopic3'], data: '0xData3' },
      { blockNumber: 101, transactionIndex: 1, index: 0, topics: ['0xTopic2'], data: '0xData2' },
      { blockNumber: 101, transactionIndex: 1, index: 1, topics: ['0xTopic1'], data: '0xData1' },
    ] as any

    // Mock event settings
    const events = [
      { topic: '0xTopic1', event: 'Test1', config: [{ handler: sandbox.stub().resolves(), abi: ['event Test1()'] }] },
      { topic: '0xTopic2', event: 'Test2', config: [{ handler: sandbox.stub().resolves(), abi: ['event Test2()'] }] },
      { topic: '0xTopic3', event: 'Test3', config: [{ handler: sandbox.stub().resolves(), abi: ['event Test3()'] }] },
      { topic: '0xTopic4', event: 'Test4', config: [{ handler: sandbox.stub().resolves(), abi: ['event Test4()'] }] },
    ] as any

    const stubParseLog = sandbox.stub(Web3Utils, 'parseLog').callsFake(log => log as any)
    const stubParseInfoLog = sandbox.stub(Web3Utils, 'parseInfoLog').resolves(true)

    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.ethereumMainnet,
      fromBlock: 100,
      toBlock: 200,
      address: '0xAddress',
      events,
      stopOnError: false,
      logService: `indexer-${NetworksEnum.ethereumMainnet}`,
      onError: sandbox.stub(),
    })

    const stubSaveProgress = sandbox.stub(crawler, 'onSaveProgress').resolves()
    const processLogsSpy = sandbox.spy(crawler, 'processLogs')

    await crawler.processLogs(unsortedLogs, {
      fromBlock: 100,
      toBlock: 150,
      latestBlock: 200,
    })

    const processedLogs = processLogsSpy.args[0][0]
    expect(processedLogs.length).to.deep.equal(sortedLogs.length)
    expect(sortedLogs[0].data).to.equal(processedLogs[3].data)
    expect(sortedLogs[1].blockNumber).to.equal(processedLogs[2].blockNumber)
    expect(sortedLogs[2].blockNumber).to.equal(processedLogs[1].blockNumber)
    expect(sortedLogs[3].blockNumber).to.equal(processedLogs[0].blockNumber)

    expect(stubParseLog.callCount).to.equal(4)
    expect(stubParseInfoLog.callCount).to.equal(4)

    for (const event of events) {
      expect(event.config[0].handler.calledOnce).to.be.true
    }

    expect(stubSaveProgress.callCount).to.equal(4)
    expect(stubSaveProgress.calledWith(sortedLogs[0].blockNumber)).to.be.true
  })

  it('should log an error when event setting is not found', async () => {
    // Mock logs with a topic not present in events
    const logs = [
      { blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xUnknownTopic'], data: '0xData1' },
    ] as any

    const events = [
      { topic: '0xTopic1', abi: ['event Test1()'], event: 'Test1', handler: sandbox.stub().resolves() },
    ] as any

    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.ethereumMainnet,
      fromBlock: 100,
      toBlock: 200,
      address: '0xAddress',
      events,
      stopOnError: false,
      logService: null,
      onError: sandbox.stub(),
    })

    await crawler.processLogs(logs, {
      fromBlock: 100,
      toBlock: 150,
      latestBlock: 200,
    })

    expect(logError.calledOnce).to.be.true
    expect(logError.calledWith('Error event setting not found in blockchainCrawler')).to.be.true

    for (const event of events) {
      expect(event.handler.notCalled).to.be.true
    }
  })

  it('should throw an error if block interval time is not found for the network', () => {
    sandbox.stub(Utils, 'networkToAragon').returns('FAKE_NETWORK')

    // Mock the entire config.NODES object to include a fake network with undefined INTERVAL_BLOCK_TIME
    sandbox.stub(config, 'NODES').value({
      ...config.NODES,
      FAKE_NETWORK: {
        WS: '',
        FROM_BLOCK: 0,
        INTERVAL_BLOCK_TIME: undefined,
        ETHERSCAN_API_KEY: '',
        ETHERSCAN_API_URL: '',
      },
    })

    expect(() => {
      new BlockchainLogCrawler({
        network: NetworksEnum.ethereumMainnet,
        fromBlock: 100,
        toBlock: 200,
        address: '0xAddress',
        events: [],
        stopOnError: false,
        logService: null,
        onError: () => {},
      })
    }).to.throw(Error, 'Block interval time not found for network: ethereum-mainnet')
  })

  it('should log an error when a topic hash is missing in the event', () => {
    const events = [
      { event: 'EventWithoutTopic' }, // Missing 'topic' property
    ] as any

    new BlockchainLogCrawler({
      network: NetworksEnum.ethereumMainnet,
      fromBlock: 100,
      toBlock: 200,
      address: '0xAddress',
      events,
      stopOnError: false,
      logService: null,
      onError: () => {},
    })

    expect(logError.calledOnce).to.be.true
    expect(logError.calledWithMatch('Topic hash not found for event EventWithoutTopic' as any)).to.be.true
  })

  it('should update an existing config with the new block number', async () => {
    const blockNumber = 100

    const existingConfig = {
      update: sandbox.stub().resolves(),
    }

    const stubFindLog = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(existingConfig)

    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.ethereumMainnet,
      fromBlock: 100,
      toBlock: 200,
      address: '0xAddress',
      events: [],
      stopOnError: false,
      logService: `indexer-${NetworksEnum.ethereumMainnet}`,
      onError: () => {},
    })

    await crawler.onSaveProgress(blockNumber)

    expect(existingConfig.update.calledOnceWith({ lastSync: blockNumber })).to.be.true
    expect(
      stubFindLog.calledOnceWith({
        network: NetworksEnum.ethereumMainnet,
        service: `indexer-${NetworksEnum.ethereumMainnet}`,
      }),
    ).to.be.true
  })

  it('should create a new config if none exists', async () => {
    const blockNumber = 100

    const stubFindLog = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(null)

    const createStub = sandbox.stub(Models.ConfigIndexer, 'create').resolves()
    const executeTxFnStub = sandbox.stub(DbTx, 'executeTxFn').callsFake(async fn => {
      await fn({ session: { commitTransaction: sandbox.stub(), endSession: sandbox.stub() } })
    })

    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.ethereumMainnet,
      fromBlock: 100,
      toBlock: 200,
      address: '0xAddress',
      events: [],
      stopOnError: false,
      logService: `indexer-${NetworksEnum.ethereumMainnet}`,
      onError: () => {},
    })

    await crawler.onSaveProgress(blockNumber)

    expect(Models.ConfigIndexer.findExistingLog.calledOnce).to.be.true
    expect(createStub.calledOnce).to.be.true
    expect(executeTxFnStub.calledOnce).to.be.true
    expect(
      stubFindLog.calledOnceWith({
        network: NetworksEnum.ethereumMainnet,
        service: `indexer-${NetworksEnum.ethereumMainnet}`,
      }),
    ).to.be.true
  })

  it('should return the lastSync value from existingConfig if it exists', async () => {
    const lastSync = 150
    const stubFindLog = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves({ lastSync })

    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.ethereumMainnet,
      fromBlock: 100,
      toBlock: 200,
      address: '0xAddress',
      events: [],
      stopOnError: false,
      logService: `indexer-${NetworksEnum.ethereumMainnet}`,
      onError: () => {},
    })

    const startBlock = await crawler.getServiceStartBlock()

    expect(
      stubFindLog.calledOnceWith({
        network: NetworksEnum.ethereumMainnet,
        service: `indexer-${NetworksEnum.ethereumMainnet}`,
      }),
    ).to.be.true
    expect(startBlock).to.equal(lastSync)
  })

  it('should return the fromBlock value if no existingConfig is found and fromBlock > 0', async () => {
    const stubFindLog = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(null)

    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.ethereumMainnet,
      fromBlock: 100,
      toBlock: 200,
      address: '0xAddress',
      events: [],
      stopOnError: false,
      logService: `indexer-${NetworksEnum.ethereumMainnet}`,
      onError: () => {},
    })

    const startBlock = await crawler.getServiceStartBlock()

    expect(
      stubFindLog.calledOnceWith({
        network: NetworksEnum.ethereumMainnet,
        service: `indexer-${NetworksEnum.ethereumMainnet}`,
      }),
    ).to.be.true
    expect(startBlock).to.equal(100)
  })

  it('should return the FROM_BLOCK value from config if no existingConfig is found and fromBlock is 0', async () => {
    const defaultFromBlock = 50
    const stubFindLog = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(null)

    sandbox.stub(config, 'NODES').value({
      ...config.NODES,
      ETHEREUM_MAINNET: {
        ...config.NODES.ETHEREUM_MAINNET,
        FROM_BLOCK: defaultFromBlock,
      },
    })

    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.ethereumMainnet,
      fromBlock: 0,
      toBlock: 200,
      address: '0xAddress',
      events: [],
      stopOnError: false,
      logService: `indexer-${NetworksEnum.ethereumMainnet}`,
      onError: () => {},
    })

    const startBlock = await crawler.getServiceStartBlock()

    expect(
      stubFindLog.calledOnceWith({
        network: NetworksEnum.ethereumMainnet,
        service: `indexer-${NetworksEnum.ethereumMainnet}`,
      }),
    ).to.be.true
    expect(startBlock).to.equal(defaultFromBlock)
  })

  describe('getStrategyBySituation', () => {
    it('should return getBlockReceipts when oneBlockPerTime is true and range is within threshold', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        oneBlockPerTime: true,
      })

      sandbox.stub(config, 'BLOCKCHAIN_LOG_CRAWLER').value({
        ONE_BLOCK_PER_TIME_MIN_THRESHOLD: 50,
        BLOCK_HIGH_RANGE: 40,
        BLOCK_MEDIUM_RANGE: 20,
      })

      const strategy = crawler.getStrategyBySituation(100, 120) // Range of 20 blocks

      expect(strategy).to.equal(ICrawStrategy.getBlockReceipts)
    })

    it('should return getBlockReceipts when processing a single block', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      const strategy = crawler.getStrategyBySituation(100, 101)

      expect(strategy).to.equal(ICrawStrategy.getBlockReceipts)
    })

    it('should return getLogsWithoutTopics for small ranges with high-speed chains', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      crawler['crawlSetting'].batchSize = 1000

      sandbox.stub(config, 'BLOCKCHAIN_LOG_CRAWLER').value({
        BLOCK_HIGH_RANGE: 40,
        BLOCK_MEDIUM_RANGE: 20,
      })

      sandbox.stub(config, 'NODES').value({
        ETHEREUM_MAINNET: {
          INTERVAL_BLOCK_TIME: 0.5,
        },
      })

      const strategy = crawler.getStrategyBySituation(100, 130)

      expect(strategy).to.equal(ICrawStrategy.getLogsWithoutTopics)
    })

    it('should return getLogsWithoutTopics for small ranges with medium-speed chains', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      sandbox.stub(config, 'BLOCKCHAIN_LOG_CRAWLER').value({
        BLOCK_HIGH_RANGE: 40,
        BLOCK_MEDIUM_RANGE: 20,
      })

      sandbox.stub(config, 'NODES').value({
        ETHEREUM_MAINNET: {
          INTERVAL_BLOCK_TIME: 3,
        },
      })

      const strategy = crawler.getStrategyBySituation(100, 115) // Range of 15 blocks

      expect(strategy).to.equal(ICrawStrategy.getLogsWithoutTopics)
    })

    it('should return getLogsWithoutTopics for small ranges with slow-speed chains', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      sandbox.stub(config, 'BLOCKCHAIN_LOG_CRAWLER').value({
        BLOCK_HIGH_RANGE: 40,
        BLOCK_MEDIUM_RANGE: 20,
        BLOCK_LOW_RANGE: 10,
      })

      sandbox.stub(config, 'NODES').value({
        ETHEREUM_MAINNET: {
          INTERVAL_BLOCK_TIME: 10, // Slow block time (> 5 seconds)
        },
      })

      const strategy = crawler.getStrategyBySituation(100, 104) // Range of 15 blocks

      expect(strategy).to.equal(ICrawStrategy.getLogsWithoutTopics)
    })

    it('should return getLogsByBatch for large ranges', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      sandbox.stub(config, 'BLOCKCHAIN_LOG_CRAWLER').value({
        BLOCK_HIGH_RANGE: 40,
        BLOCK_MEDIUM_RANGE: 20,
      })

      sandbox.stub(config, 'NODES').value({
        ETHEREUM_MAINNET: {
          INTERVAL_BLOCK_TIME: 3,
        },
      })

      const strategy = crawler.getStrategyBySituation(100, 150) // Range of 50 blocks

      expect(strategy).to.equal(ICrawStrategy.getLogsByBatch)
    })

    it('should cap medium range threshold by batchSize/2', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)
      sandbox.stub(config, 'BLOCKCHAIN_LOG_CRAWLER').value({
        BLOCK_HIGH_RANGE: 40,
        BLOCK_MEDIUM_RANGE: 20,
      })

      sandbox.stub(config, 'NODES').value({
        ETHEREUM_MAINNET: {
          INTERVAL_BLOCK_TIME: 0.5, // Fast chain
        },
      })

      const strategy = crawler.getStrategyBySituation(100, 115)

      expect(strategy).to.equal(ICrawStrategy.getLogsWithoutTopics)
    })
  })

  describe('getOffsetToBlockNumber', () => {
    it('should return the offset to block number if we meet the conditions', () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        network: NetworksEnum.peaqMainnet,
        filterLogs: sandbox.stub().returns(true),
      })

      const offset = crawler.getOffsetToBlockNumber(100)

      expect(offset).to.equal(96)
    })

    it('should return block as it is if no filterLogs is passed', () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        network: NetworksEnum.peaqMainnet,
      })

      const offset = crawler.getOffsetToBlockNumber(200)

      expect(offset).to.equal(200)
    })

    it('should check if the error is batch error', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      const batchSizeError = new Error('Query returned more than 1000000 results')

      const isBatchSizeError = crawler.isBatchSizeError(batchSizeError)

      expect(isBatchSizeError).to.be.true
    })
  })
})
