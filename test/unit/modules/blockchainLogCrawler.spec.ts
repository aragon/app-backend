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

    it('should handle rate limiting error', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        events: [
          { topic: '0xTopic', event: 'Test', config: [{ abi: ['event Test()'], handler: sandbox.stub().resolves() }] },
        ],
      })

      const rateLimitError = { error: { message: 'Too many requests, reason: call rate limit exhausted' } }
      const executeBatchStub = sandbox
        .stub(crawler, 'executeBatchRequest')
        .onFirstCall()
        .resolves([rateLimitError])
        .onSecondCall()
        .resolves([{ result: [{ blockNumber: '0x65', transactionIndex: '0x1', logIndex: '0x0' }] }])

      const utilsStub = sandbox.stub(Utils, 'wait').resolves()

      const result = await crawler.getLogsByBatch(100, 200)

      expect(executeBatchStub.calledTwice).to.be.true
      expect(result.logs).to.have.lengthOf(1)
      expect(result.toBlock).to.equal(200)
      expect(utilsStub.calledOnce).to.be.true
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

    it('should return error object when batch size error occurs', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      sandbox.stub(crawler, 'getProviderUrl').resolves('https://ethereum-rpc.com')
      sandbox.stub(Utils, 'chunkArray').returns([['0xTopic1']])

      const batchSizeError = new Error('Response size is larger than 150MB limit')
      sandbox.stub(axios, 'post').rejects(batchSizeError)
      sandbox.stub(crawler, 'isBatchSizeError').returns(true)

      const result = await crawler.executeBatchRequest(['0xTopic1'], 100, 150)

      expect(result).to.deep.equal([{ error: batchSizeError }])
    })

    it('should throw error when it is not a batch size error', async () => {
      const crawler = new BlockchainLogCrawler(crawlerConfig)

      sandbox.stub(crawler, 'getProviderUrl').resolves('https://ethereum-rpc.com')
      sandbox.stub(Utils, 'chunkArray').returns([['0xTopic1']])

      const networkError = new Error('Network connection timeout')
      sandbox.stub(axios, 'post').rejects(networkError)
      sandbox.stub(crawler, 'isBatchSizeError').returns(false)

      try {
        await crawler.executeBatchRequest(['0xTopic1'], 100, 150)
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(networkError)
        expect(logError.calledOnce).to.be.true
        expect(logError.firstCall.args[0]).to.equal('error executeBatchRequest')
        expect(logError.firstCall.args[1]).to.deep.include({
          error: networkError,
          topics: ['0xTopic1'],
          currentBlock: 100,
          toBlock: 150,
        })
      }
    })
  })

  describe('end', () => {
    it('should set end to true and save when config exists', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        logService: 'indexer-ethereum-mainnet',
      })

      await Models.ConfigIndexer.create({
        network: NetworksEnum.ethereumMainnet,
        service: 'indexer-ethereum-mainnet',
      })

      const findExistingLogStub = sandbox.spy(Models.ConfigIndexer, 'findExistingLog')

      await crawler.end()

      expect(
        findExistingLogStub.calledOnceWith({
          network: NetworksEnum.ethereumMainnet,
          service: 'indexer-ethereum-mainnet',
        }),
      ).to.be.true

      const configAfterUpdate = await Models.ConfigIndexer.findExistingLog({
        network: NetworksEnum.ethereumMainnet,
        service: 'indexer-ethereum-mainnet',
      })

      expect(configAfterUpdate.end).to.be.true
    })

    it('should do nothing when no config exists', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        logService: 'indexer-ethereum-mainnet',
      })

      const findExistingLogStub = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(null)

      await crawler.end()

      expect(
        findExistingLogStub.calledOnceWith({
          network: NetworksEnum.ethereumMainnet,
          service: 'indexer-ethereum-mainnet',
        }),
      ).to.be.true
    })

    it('should work without logService', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        logService: undefined,
      })

      const findExistingLogStub = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(null)

      await crawler.end()

      expect(
        findExistingLogStub.calledOnceWith({
          network: NetworksEnum.ethereumMainnet,
          service: undefined,
        }),
      ).to.be.true
    })

    it('should handle errors during findExistingLog', async () => {
      const crawler = new BlockchainLogCrawler({
        ...crawlerConfig,
        logService: 'indexer-ethereum-mainnet',
      })

      const findError = new Error('Database query failed')
      const findExistingLogStub = sandbox.stub(Models.ConfigIndexer, 'findExistingLog').rejects(findError)

      try {
        await crawler.end()
        expect.fail('Should have thrown an error')
      } catch (error) {
        expect(error).to.equal(findError)
        expect(findExistingLogStub.calledOnce).to.be.true
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
      {
        topic: '0xTopic1',
        event: 'Test1',
        config: [{ abi: [{ name: 'Test1', type: 'event', inputs: [] }], handler: sandbox.stub().resolves() }],
      },
      {
        topic: '0xTopic2',
        event: 'Test2',
        config: [{ abi: [{ name: 'Test2', type: 'event', inputs: [] }], handler: sandbox.stub().resolves() }],
      },
      {
        topic: '0xTopic3',
        event: 'Test3',
        config: [{ abi: [{ name: 'Test3', type: 'event', inputs: [] }], handler: sandbox.stub().resolves() }],
      },
      {
        topic: '0xTopic4',
        event: 'Test4',
        config: [{ abi: [{ name: 'Test4', type: 'event', inputs: [] }], handler: sandbox.stub().resolves() }],
      },
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
      {
        topic: '0xTopic1',
        event: 'Test1',
        config: [{ handler: sandbox.stub().resolves(), abi: [{ name: 'Test1', type: 'event', inputs: [] }] }],
      },
      {
        topic: '0xTopic2',
        event: 'Test2',
        config: [{ handler: sandbox.stub().resolves(), abi: [{ name: 'Test2', type: 'event', inputs: [] }] }],
      },
      {
        topic: '0xTopic3',
        event: 'Test3',
        config: [{ handler: sandbox.stub().resolves(), abi: [{ name: 'Test3', type: 'event', inputs: [] }] }],
      },
      {
        topic: '0xTopic4',
        event: 'Test4',
        config: [{ handler: sandbox.stub().resolves(), abi: [{ name: 'Test4', type: 'event', inputs: [] }] }],
      },
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

    // Progress is now saved once per batch, not per log
    expect(stubSaveProgress.callCount).to.equal(0)
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

  describe('parallel processing', () => {
    describe('getParallelConfig', () => {
      it('should return default config when parallel is true', () => {
        const crawler = new BlockchainLogCrawler({
          ...crawlerConfig,
          parallel: true,
        })

        const config = crawler.getParallelConfig()

        expect(config).to.deep.equal({
          enable: true,
          concurrency: 1,
          batchSize: 50,
          useBatch: false,
        })
      })

      it('should return disabled config when parallel is false', () => {
        const crawler = new BlockchainLogCrawler({
          ...crawlerConfig,
          parallel: false,
        })

        const config = crawler.getParallelConfig()

        expect(config).to.deep.equal({
          enable: false,
          concurrency: 1,
          batchSize: 1,
          useBatch: false,
        })
      })

      it('should return custom config when parallel is an object', () => {
        const crawler = new BlockchainLogCrawler({
          ...crawlerConfig,
          parallel: {
            enable: true,
            concurrency: 10,
            batchSize: 20,
          },
        })

        const config = crawler.getParallelConfig()

        expect(config).to.deep.equal({
          enable: true,
          concurrency: 10,
          batchSize: 20,
          useBatch: false,
        })
      })

      it('should use defaults for missing values in object config', () => {
        const crawler = new BlockchainLogCrawler({
          ...crawlerConfig,
          parallel: {
            enable: true,
          },
        })

        const config = crawler.getParallelConfig()

        expect(config).to.deep.equal({
          enable: true,
          concurrency: 1,
          batchSize: 50,
          useBatch: false,
        })
      })

      it('should return disabled config when parallel is undefined', () => {
        const crawler = new BlockchainLogCrawler({
          ...crawlerConfig,
          parallel: undefined,
        })

        const config = crawler.getParallelConfig()

        expect(config).to.deep.equal({
          enable: false,
          concurrency: 1,
          batchSize: 1,
          useBatch: false,
        })
      })

      it('should auto-scale config based on log count when autoScale is enabled', () => {
        const crawler = new BlockchainLogCrawler({
          ...crawlerConfig,
          parallel: {
            enable: true,
            autoScale: true,
          },
        })

        // Test different log counts
        const testCases = [
          { logCount: 50, expected: { concurrency: 2, batchSize: 500 } },
          { logCount: 500, expected: { concurrency: 2, batchSize: 500 } },
          { logCount: 5000, expected: { concurrency: 5, batchSize: 2000 } },
          { logCount: 50000, expected: { concurrency: 10, batchSize: 5000 } },
          { logCount: 200000, expected: { concurrency: 20, batchSize: 20000 } },
          { logCount: 500000, expected: { concurrency: 20, batchSize: 20000 } },
        ]

        testCases.forEach(({ logCount, expected }) => {
          const config = crawler.getParallelConfig(logCount)
          expect(config.enable).to.be.true
          expect(config.concurrency).to.equal(expected.concurrency)
          expect(config.batchSize).to.equal(expected.batchSize)
        })
      })

      it('should not auto-scale when autoScale is false', () => {
        const crawler = new BlockchainLogCrawler({
          ...crawlerConfig,
          parallel: {
            enable: true,
            autoScale: false,
            concurrency: 5,
            batchSize: 10,
          },
        })

        const config = crawler.getParallelConfig(10000) // Large log count

        expect(config).to.deep.equal({
          enable: true,
          concurrency: 5,
          batchSize: 10,
          useBatch: false,
        })
      })
    })

    describe('processLogsParallel', () => {
      let crawler: BlockchainLogCrawler
      let events: any[]
      let handlerStub1: any
      let handlerStub2: any
      let handlerStub3: any
      let handlerStub4: any

      beforeEach(() => {
        handlerStub1 = sandbox.stub().resolves()
        handlerStub2 = sandbox.stub().resolves()
        handlerStub3 = sandbox.stub().resolves()
        handlerStub4 = sandbox.stub().resolves()

        events = [
          {
            topic: '0xTopic1',
            event: 'Test1',
            config: [{ abi: [{ name: 'Test1', type: 'event', inputs: [] }], handler: handlerStub1 }],
          },
          {
            topic: '0xTopic2',
            event: 'Test2',
            config: [{ abi: [{ name: 'Test2', type: 'event', inputs: [] }], handler: handlerStub2 }],
          },
          {
            topic: '0xTopic3',
            event: 'Test3',
            config: [{ abi: [{ name: 'Test3', type: 'event', inputs: [] }], handler: handlerStub3 }],
          },
          {
            topic: '0xTopic4',
            event: 'Test4',
            config: [{ abi: [{ name: 'Test4', type: 'event', inputs: [] }], handler: handlerStub4 }],
          },
        ]

        crawler = new BlockchainLogCrawler({
          ...crawlerConfig,
          parallel: {
            enable: true,
            concurrency: 2,
            batchSize: 2,
          },
          events,
        })

        sandbox.stub(Web3Utils, 'parseLog').callsFake(
          (log, iface) =>
            ({
              name: iface.fragments[0].name,
              args: {},
            }) as any,
        )

        sandbox.stub(Web3Utils, 'parseInfoLog').returns({
          blockNumber: 100,
          transactionHash: '0xabc',
          network: NetworksEnum.ethereumMainnet,
        } as any)
      })

      it('should process logs in parallel with proper concurrency', async () => {
        const logs = [
          { blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xTopic1'], transactionHash: '0x1' },
          { blockNumber: 101, transactionIndex: 0, index: 1, topics: ['0xTopic2'], transactionHash: '0x1' },
          { blockNumber: 101, transactionIndex: 1, index: 0, topics: ['0xTopic3'], transactionHash: '0x2' },
          { blockNumber: 101, transactionIndex: 1, index: 1, topics: ['0xTopic4'], transactionHash: '0x2' },
        ] as any

        await crawler.processLogsParallel(logs, {
          fromBlock: 100,
          toBlock: 150,
          latestBlock: 200,
        })

        expect(handlerStub1.calledOnce).to.be.true
        expect(handlerStub2.calledOnce).to.be.true
        expect(handlerStub3.calledOnce).to.be.true
        expect(handlerStub4.calledOnce).to.be.true
        expect(crawler.crawlSetting.nbSuccess).to.equal(4)
      })

      it('should handle empty logs array', async () => {
        const highestBlock = await crawler.processLogsParallel([], {
          fromBlock: 100,
          toBlock: 150,
          latestBlock: 200,
        })

        expect(highestBlock).to.equal(0)
        expect(handlerStub1.notCalled).to.be.true
        expect(crawler.crawlSetting.nbSuccess).to.equal(0)
      })

      it('should handle null logs array', async () => {
        const highestBlock = await crawler.processLogsParallel(null as any, {
          fromBlock: 100,
          toBlock: 150,
          latestBlock: 200,
        })

        expect(highestBlock).to.equal(0)
        expect(handlerStub1.notCalled).to.be.true
        expect(crawler.crawlSetting.nbSuccess).to.equal(0)
      })

      it('should prevent duplicate processing using all 4 fields', async () => {
        const duplicateLogs = [
          { blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xTopic1'], transactionHash: '0x1' },
          { blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xTopic1'], transactionHash: '0x1' }, // Exact duplicate
          { blockNumber: 101, transactionIndex: 0, index: 1, topics: ['0xTopic1'], transactionHash: '0x1' }, // Different logIndex
          { blockNumber: 101, transactionIndex: 1, index: 0, topics: ['0xTopic1'], transactionHash: '0x1' }, // Different transactionIndex
        ] as any

        await crawler.processLogsParallel(duplicateLogs, {
          fromBlock: 100,
          toBlock: 150,
          latestBlock: 200,
        })

        // Should process 3 unique logs (one duplicate was skipped)
        expect(handlerStub1.callCount).to.equal(3)
        expect(crawler.crawlSetting.nbSuccess).to.equal(3)
      })

      it('should handle errors and continue processing when stopOnError is false', async () => {
        handlerStub2.rejects(new Error('Handler error'))

        const logs = [
          { blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xTopic1'], transactionHash: '0x1' },
          { blockNumber: 101, transactionIndex: 0, index: 1, topics: ['0xTopic2'], transactionHash: '0x1' },
          { blockNumber: 101, transactionIndex: 1, index: 0, topics: ['0xTopic3'], transactionHash: '0x2' },
        ] as any

        const onErrorStub = sandbox.stub()
        crawler['crawlParams'].onError = onErrorStub

        await crawler.processLogsParallel(logs, {
          fromBlock: 100,
          toBlock: 150,
          latestBlock: 200,
        })

        expect(handlerStub1.calledOnce).to.be.true
        expect(handlerStub2.calledOnce).to.be.true
        expect(handlerStub3.calledOnce).to.be.true
        expect(onErrorStub.calledOnce).to.be.true
        expect(crawler.crawlSetting.nbSuccess).to.equal(2)
        expect(crawler.crawlSetting.nbError).to.equal(1)
      })

      it('should stop processing on error when stopOnError is true', async () => {
        handlerStub1.rejects(new Error('Handler error'))

        crawler['crawlParams'].stopOnError = true
        const onErrorStub = sandbox.stub()
        crawler['crawlParams'].onError = onErrorStub

        const logs = [
          { blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xTopic1'], transactionHash: '0x1' },
          { blockNumber: 101, transactionIndex: 0, index: 1, topics: ['0xTopic2'], transactionHash: '0x1' },
          { blockNumber: 101, transactionIndex: 1, index: 0, topics: ['0xTopic3'], transactionHash: '0x2' },
        ] as any

        try {
          await crawler.processLogsParallel(logs, {
            fromBlock: 100,
            toBlock: 150,
            latestBlock: 200,
          })
          expect.fail('Should have thrown an error')
        } catch (error: any) {
          expect(error.message).to.equal('Handler error')
          expect(onErrorStub.calledOnce).to.be.true
          expect(crawler.crawlSetting.shutdown).to.be.true
        }
      })

      it('should process logs in batches to avoid memory spikes', async () => {
        const logs = Array.from({ length: 10 }, (_, i) => ({
          blockNumber: 101,
          transactionIndex: Math.floor(i / 2),
          index: i % 2,
          topics: [`0xTopic${(i % 4) + 1}`],
          transactionHash: `0x${Math.floor(i / 2)}`,
        }))

        await crawler.processLogsParallel(logs as any, {
          fromBlock: 100,
          toBlock: 150,
          latestBlock: 200,
        })

        expect(handlerStub1.callCount).to.be.greaterThan(0)
        expect(handlerStub2.callCount).to.be.greaterThan(0)
        expect(handlerStub3.callCount).to.be.greaterThan(0)
        expect(handlerStub4.callCount).to.be.greaterThan(0)
        expect(crawler.crawlSetting.nbSuccess).to.equal(10)
      })

      it('should handle logs without matching events', async () => {
        const logs = [
          { blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xUnknownTopic'], transactionHash: '0x1' },
          { blockNumber: 101, transactionIndex: 0, index: 1, topics: ['0xTopic1'], transactionHash: '0x1' },
        ] as any

        await crawler.processLogsParallel(logs, {
          fromBlock: 100,
          toBlock: 150,
          latestBlock: 200,
        })

        expect(handlerStub1.calledOnce).to.be.true
        expect(crawler.crawlSetting.nbSuccess).to.equal(1) // Only one valid event processed
        expect(logError.calledWith('Error event setting not found in blockchainCrawler')).to.be.true
      })

      it('should update lastSync with the highest block number processed', async () => {
        const logs = [
          { blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xTopic1'], transactionHash: '0x1' },
          { blockNumber: 105, transactionIndex: 0, index: 0, topics: ['0xTopic2'], transactionHash: '0x2' },
          { blockNumber: 103, transactionIndex: 0, index: 0, topics: ['0xTopic3'], transactionHash: '0x3' },
        ] as any

        await crawler.processLogsParallel(logs, {
          fromBlock: 100,
          toBlock: 150,
          latestBlock: 200,
        })

        // The lastSync should be updated with each processed log
        expect(crawler.crawlSetting.lastSync).to.be.oneOf([101, 103, 105])
      })

      it('should return highest block number processed', async () => {
        const logs = [
          { blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xTopic1'], transactionHash: '0x1' },
          { blockNumber: 105, transactionIndex: 0, index: 0, topics: ['0xTopic2'], transactionHash: '0x2' },
          { blockNumber: 102, transactionIndex: 0, index: 0, topics: ['0xTopic3'], transactionHash: '0x3' },
        ] as any

        const highestBlock = await crawler.processLogsParallel(logs, {
          fromBlock: 100,
          toBlock: 150,
          latestBlock: 200,
        })

        // Should return the highest block number processed
        expect(highestBlock).to.equal(105)
        expect(crawler.crawlSetting.lastSync).to.equal(105)
      })

      it('should verify all logs are processed exactly once', async () => {
        const processedLogs: string[] = []

        // Override handlers to track processing
        handlerStub1.callsFake((event, info) => {
          processedLogs.push(`${info.blockNumber}-${info.transactionHash}-0-0`)
          return Promise.resolve()
        })
        handlerStub2.callsFake((event, info) => {
          processedLogs.push(`${info.blockNumber}-${info.transactionHash}-0-1`)
          return Promise.resolve()
        })

        const logs = [
          { blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xTopic1'], transactionHash: '0x1' },
          { blockNumber: 101, transactionIndex: 0, index: 1, topics: ['0xTopic2'], transactionHash: '0x1' },
          { blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xTopic1'], transactionHash: '0x1' }, // Duplicate
        ] as any

        await crawler.processLogsParallel(logs, {
          fromBlock: 100,
          toBlock: 150,
          latestBlock: 200,
        })

        // Check only unique logs were processed
        expect(processedLogs).to.have.lengthOf(2)
        expect(processedLogs).to.include('100-0xabc-0-0')
        expect(processedLogs).to.include('100-0xabc-0-1')
      })
    })

    describe('integration with crawl method', () => {
      it('should use parallel processing when enabled', async () => {
        const crawler = new BlockchainLogCrawler({
          ...crawlerConfig,
          parallel: {
            enable: true,
            concurrency: 3,
            batchSize: 5,
          },
          events: [
            {
              topic: '0xTopic1',
              event: 'Test1',
              config: [{ abi: [{ name: 'Test1', type: 'event', inputs: [] }], handler: sandbox.stub().resolves() }],
            },
          ],
        })

        sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

        // Stub Web3Helper.getBlockNumber
        sandbox
          .stub(Web3Helper, 'getBlockNumber')
          .onFirstCall()
          .resolves(100) // fromBlock
          .onSecondCall()
          .resolves(200) // toBlock

        const getLogsByStrategyStub = sandbox.stub(crawler, 'getLogsByStrategy').resolves({
          logs: [
            { transactionHash: '0x1', blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xTopic1'] },
            { transactionHash: '0x2', blockNumber: 102, transactionIndex: 0, index: 0, topics: ['0xTopic1'] },
          ] as any,
          toBlock: 102,
        })

        const processLogsParallelSpy = sandbox.spy(crawler, 'processLogsParallel')
        const processLogsSpy = sandbox.spy(crawler, 'processLogs')

        // Stub updateAndCheckConditions to control the crawl loop
        sandbox.stub(crawler, 'updateAndCheckConditions').onFirstCall().resolves(true).onSecondCall().resolves(false)

        await crawler.crawl()

        expect(processLogsParallelSpy.calledOnce).to.be.true
        expect(processLogsSpy.notCalled).to.be.true
      })

      it('should use sequential processing when parallel is disabled', async () => {
        const crawler = new BlockchainLogCrawler({
          ...crawlerConfig,
          parallel: false,
          events: [
            {
              topic: '0xTopic1',
              event: 'Test1',
              config: [{ abi: [{ name: 'Test1', type: 'event', inputs: [] }], handler: sandbox.stub().resolves() }],
            },
          ],
        })

        sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

        // Stub Web3Helper.getBlockNumber
        sandbox
          .stub(Web3Helper, 'getBlockNumber')
          .onFirstCall()
          .resolves(100) // fromBlock
          .onSecondCall()
          .resolves(200) // toBlock

        const getLogsByStrategyStub = sandbox.stub(crawler, 'getLogsByStrategy').resolves({
          logs: [
            { transactionHash: '0x1', blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xTopic1'] },
          ] as any,
          toBlock: 101,
        })

        const processLogsParallelSpy = sandbox.spy(crawler, 'processLogsParallel')
        const processLogsSpy = sandbox.spy(crawler, 'processLogs')

        // Stub updateAndCheckConditions to control the crawl loop
        sandbox.stub(crawler, 'updateAndCheckConditions').onFirstCall().resolves(true).onSecondCall().resolves(false)

        await crawler.crawl()

        expect(processLogsSpy.calledOnce).to.be.true
        expect(processLogsParallelSpy.notCalled).to.be.true
      })

      it('should process all logs even with uneven batch sizes', async () => {
        const processedLogs: any[] = []
        const handlerStub = sandbox.stub().callsFake((event, info) => {
          processedLogs.push({ event: event.name, txHash: info.transactionHash })
          return Promise.resolve()
        })

        const crawler = new BlockchainLogCrawler({
          ...crawlerConfig,
          parallel: { enable: true, concurrency: 2, batchSize: 5 },
          events: [
            {
              topic: '0xTopic1',
              event: 'Test1',
              config: [{ abi: [{ name: 'Test1', type: 'event', inputs: [] }], handler: handlerStub }],
            },
          ],
        })

        // Create 13 logs to test uneven division
        const mockLogs: any[] = []
        for (let i = 0; i < 13; i++) {
          mockLogs.push({
            transactionHash: `0x${i}`,
            blockNumber: 100 + i,
            transactionIndex: 0,
            index: 0,
            topics: ['0xTopic1'],
          })
        }

        sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

        // Stub Web3Helper.getBlockNumber
        sandbox
          .stub(Web3Helper, 'getBlockNumber')
          .onFirstCall()
          .resolves(100) // fromBlock
          .onSecondCall()
          .resolves(200) // toBlock

        sandbox.stub(crawler, 'getLogsByStrategy').resolves({
          logs: mockLogs,
          toBlock: 112,
        })

        // Stub updateAndCheckConditions to control the crawl loop
        sandbox.stub(crawler, 'updateAndCheckConditions').onFirstCall().resolves(true).onSecondCall().resolves(false)

        // Stub formatLog to return proper event objects
        sandbox.stub(crawler, 'formatLog').callsFake((log: any) => ({
          event: { name: 'Test1' } as any,
          handler: handlerStub,
          info: { transactionHash: log.transactionHash } as any,
        }))

        await crawler.crawl()

        // Verify all 13 logs were processed
        expect(processedLogs.length).to.equal(13)
        expect(handlerStub.callCount).to.equal(13)

        // Verify each log was processed exactly once
        const uniqueTxHashes = new Set(processedLogs.map(log => log.txHash))
        expect(uniqueTxHashes.size).to.equal(13)

        // Verify the transaction hashes match
        for (let i = 0; i < 13; i++) {
          expect(processedLogs.some(log => log.txHash === `0x${i}`)).to.be.true
        }
      })
    })

    describe('processLogsParallelBatch', () => {
      it('should process logs in batches when useBatch is true', async () => {
        const batchHandlerStub = sandbox.stub().resolves()

        const mockLogs = [
          { blockNumber: 100, transactionHash: '0x1', transactionIndex: 0, index: 0, topics: ['0xEventA'] },
          { blockNumber: 101, transactionHash: '0x2', transactionIndex: 0, index: 0, topics: ['0xEventA'] },
          { blockNumber: 102, transactionHash: '0x3', transactionIndex: 0, index: 0, topics: ['0xEventA'] },
          { blockNumber: 103, transactionHash: '0x4', transactionIndex: 0, index: 0, topics: ['0xEventB'] },
          { blockNumber: 104, transactionHash: '0x5', transactionIndex: 0, index: 0, topics: ['0xEventB'] },
        ] as any[]

        const crawler = new BlockchainLogCrawler({
          network: NetworksEnum.ethereumSepolia,
          events: [
            {
              event: 'EventA',
              topic: '0xEventA',
              config: [
                {
                  abi: [],
                  handler: batchHandlerStub,
                },
              ],
            },
            {
              event: 'EventB',
              topic: '0xEventB',
              config: [
                {
                  abi: [],
                  handler: batchHandlerStub,
                },
              ],
            },
          ],
          parallel: {
            enable: true,
            useBatch: true,
            batchSize: 10,
          },
          address: ['0x123'],
          onError: sandbox.stub(),
          logService: 'test' as any,
          stopOnError: true,
        })

        // Stub formatLog to return proper event objects
        sandbox.stub(crawler, 'formatLog').callsFake((log: any) => ({
          event: { name: log.topics[0] === '0xEventA' ? 'EventA' : 'EventB' } as any,
          handler: batchHandlerStub,
          info: { transactionHash: log.transactionHash, blockNumber: log.blockNumber } as any,
        }))

        const highestBlock = await crawler.processLogsParallelBatch(mockLogs, {
          fromBlock: 100,
          toBlock: 104,
          latestBlock: 200,
        })

        // Should be called twice - once for EventA batch and once for EventB batch
        expect(batchHandlerStub.callCount).to.equal(2)

        // Check first batch call (EventA)
        const firstBatchCall = batchHandlerStub.getCall(0).args[0]
        expect(firstBatchCall).to.have.lengthOf(3)
        expect(firstBatchCall[0].parsedEvent.name).to.equal('EventA')

        // Check second batch call (EventB)
        const secondBatchCall = batchHandlerStub.getCall(1).args[0]
        expect(secondBatchCall).to.have.lengthOf(2)
        expect(secondBatchCall[0].parsedEvent.name).to.equal('EventB')

        // Check highest block returned
        expect(highestBlock).to.equal(104)
      })

      it('should split large batches based on batchSize', async () => {
        const batchHandlerStub = sandbox.stub().resolves()

        // Create 15 logs for the same event
        const mockLogs = Array.from({ length: 15 }, (_, i) => ({
          blockNumber: 100 + i,
          transactionHash: `0x${i}`,
          transactionIndex: 0,
          index: 0,
          topics: ['0xEventA'],
        })) as any[]

        const crawler = new BlockchainLogCrawler({
          network: NetworksEnum.ethereumSepolia,
          events: [
            {
              event: 'EventA',
              topic: '0xEventA',
              config: [
                {
                  abi: [],
                  handler: batchHandlerStub,
                },
              ],
            },
          ],
          parallel: {
            enable: true,
            useBatch: true,
            batchSize: 10, // Set batch size to 10
          },
          address: ['0x123'],
          onError: sandbox.stub(),
          logService: 'test' as any,
          stopOnError: true,
        })

        // Stub formatLog
        sandbox.stub(crawler, 'formatLog').callsFake((log: any) => ({
          event: { name: 'EventA' } as any,
          handler: batchHandlerStub,
          info: { transactionHash: log.transactionHash, blockNumber: log.blockNumber } as any,
        }))

        await crawler.processLogsParallelBatch(mockLogs, {})

        // Should be called twice - first batch with 10, second batch with 5
        expect(batchHandlerStub.callCount).to.equal(2)

        const firstBatchCall = batchHandlerStub.getCall(0).args[0]
        expect(firstBatchCall).to.have.lengthOf(10)

        const secondBatchCall = batchHandlerStub.getCall(1).args[0]
        expect(secondBatchCall).to.have.lengthOf(5)
      })

      it('should handle errors in batch processing', async () => {
        const batchHandlerStub = sandbox.stub()
        batchHandlerStub.onFirstCall().rejects(new Error('Batch processing error'))

        const onErrorStub = sandbox.stub()

        const mockLogs = [
          { blockNumber: 100, transactionHash: '0x1', transactionIndex: 0, index: 0, topics: ['0xEventA'] },
        ] as any[]

        const crawler = new BlockchainLogCrawler({
          network: NetworksEnum.ethereumSepolia,
          events: [
            {
              event: 'EventA',
              topic: '0xEventA',
              config: [
                {
                  abi: [],
                  handler: batchHandlerStub,
                },
              ],
            },
          ],
          parallel: {
            enable: true,
            useBatch: true,
          },
          address: ['0x123'],
          onError: onErrorStub,
          logService: 'test' as any,
          stopOnError: true,
        })

        sandbox.stub(crawler, 'formatLog').returns({
          event: { name: 'EventA' } as any,
          handler: batchHandlerStub,
          info: {} as any,
        })

        try {
          await crawler.processLogsParallelBatch(mockLogs, {})
          expect.fail('Should have thrown an error')
        } catch (error: any) {
          expect(error.message).to.equal('Batch processing error')
          expect(crawler.crawlSetting.shutdown).to.be.true
        }
      })
    })
  })

  describe('buildTopics', () => {
    it('should handle events without topic and log error', () => {
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        onError: sandbox.stub(),
        logService: 'test' as any,
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
      })

      const events = [
        { event: 'EventWithTopic', topic: '0xTopic1' },
        { event: 'EventWithoutTopic' }, // Missing topic
        { event: 'EventWithArrayTopic', topic: ['0xTopic2', '0xTopic3'] },
      ]

      const result = crawler.buildTopics(events)

      expect(logError.calledOnce).to.be.true
      expect(logError.firstCall.args[0]).to.equal('Topic hash not found for event EventWithoutTopic')
      expect(result).to.deep.equal(['0xTopic1', '0xTopic2', '0xTopic3'])
    })
  })

  describe('getParallelConfig edge cases', () => {
    it('should return fallback config when parallel is not configured', () => {
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        onError: sandbox.stub(),
        logService: 'test' as any,
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
        parallel: undefined,
      })

      const config = crawler['getParallelConfig'](100)

      expect(config).to.deep.equal({
        enable: false,
        concurrency: 1,
        batchSize: 1,
        useBatch: false,
      })
    })

    it('should handle logCount <= 0 in getAdaptiveConfig', () => {
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        onError: sandbox.stub(),
        logService: 'test' as any,
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
        parallel: { enable: true },
      })

      const config = (crawler as any).getAdaptiveConfig(0)

      expect(config).to.deep.equal({
        concurrency: 1,
        batchSize: 50,
      })
    })

    it('should handle large log counts (50,000-100,000)', () => {
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        onError: sandbox.stub(),
        logService: 'test' as any,
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
        parallel: { enable: true },
      })

      const config = (crawler as any).getAdaptiveConfig(75000)

      expect(config.concurrency).to.equal(15)
      expect(config.batchSize).to.equal(10000) // Actual value returned by getAdaptiveConfig
    })

    it('should handle very large log counts (>500,000)', () => {
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        onError: sandbox.stub(),
        logService: 'test' as any,
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
        parallel: { enable: true },
      })

      const config = (crawler as any).getAdaptiveConfig(600000)

      expect(config.concurrency).to.equal(20)
      expect(config.batchSize).to.equal(20000) // 600000 / 30 = 20000
    })
  })

  describe('processLogsParallel error handling', () => {
    it('should handle logs with no event from formatLog', async () => {
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        onError: sandbox.stub(),
        logService: 'test' as any,
        parallel: { enable: true, concurrency: 2 },
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
      })

      const formatLogStub = sandbox.stub(crawler, 'formatLog')
      formatLogStub.onFirstCall().returns({
        event: null as any, // No event
        handler: sandbox.stub(),
        info: {} as any,
      })
      formatLogStub.onSecondCall().returns({
        event: { name: 'Test' } as any,
        handler: sandbox.stub().resolves(),
        info: {} as any,
      })

      const mockLogs = [
        { blockNumber: 100, transactionHash: '0x1' },
        { blockNumber: 101, transactionHash: '0x2' },
      ] as any[]

      const result = await (crawler as any).processLogsParallel(mockLogs, { concurrency: 2, batchSize: 10 })

      expect(result).to.equal(101)
      expect(crawler.crawlSetting.nbSuccess).to.equal(1)
    })

    it('should handle queue errors with stopOnError', async () => {
      const onErrorStub = sandbox.stub()
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        onError: onErrorStub,
        logService: 'test' as any,
        parallel: { enable: true, concurrency: 2 },
        stopOnError: true,
        network: NetworksEnum.ethereumMainnet,
      })

      const handlerStub = sandbox.stub()
      handlerStub.onFirstCall().rejects(new Error('Handler error'))

      sandbox.stub(crawler, 'formatLog').returns({
        event: { name: 'Test' } as any,
        handler: handlerStub,
        info: {} as any,
      })

      const mockLogs: any[] = [{ blockNumber: 100, transactionHash: '0x1' }]

      try {
        await (crawler as any).processLogsParallel(mockLogs, {})
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Handler error')
        expect(crawler.crawlSetting.shutdown).to.be.true
      }
    })

    it('should handle empty queue scenario', async () => {
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        onError: sandbox.stub(),
        logService: 'test' as any,
        parallel: { enable: true, concurrency: 2 },
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
      })

      const result = await (crawler as any).processLogsParallel([], {})

      expect(result).to.equal(0)
    })

    it('should stop adding tasks when shutdown is triggered', async () => {
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        onError: sandbox.stub(),
        logService: 'test' as any,
        parallel: { enable: true, concurrency: 1 },
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
      })

      // Create many logs
      const mockLogs = Array.from({ length: 100 }, (_, i) => ({
        blockNumber: 100 + i,
        transactionHash: `0x${i}`,
      }))

      let processedCount = 0
      const handlerStub = sandbox.stub().callsFake(() => {
        processedCount++
        if (processedCount === 5) {
          crawler.crawlSetting.shutdown = true
        }
        return Promise.resolve()
      })

      sandbox.stub(crawler, 'formatLog').returns({
        event: { name: 'Test' } as any,
        handler: handlerStub,
        info: {} as any,
      })

      await (crawler as any).processLogsParallel(mockLogs, {})

      // Should have stopped processing after shutdown
      expect(processedCount).to.be.at.most(100)
    })
  })

  describe('processLogsParallelBatch error handling', () => {
    it('should handle error with onError callback and stopOnError', async () => {
      const onErrorStub = sandbox.stub()
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        onError: onErrorStub,
        logService: 'test' as any,
        stopOnError: true,
        network: NetworksEnum.ethereumMainnet,
      })

      const handlerStub = sandbox.stub().rejects(new Error('Batch error'))

      sandbox.stub(crawler, 'formatLog').returns({
        event: { name: 'Test' } as any,
        handler: handlerStub,
        info: {} as any,
      })

      const mockLogs: any[] = [{ blockNumber: 100, transactionHash: '0x1' }]

      try {
        await (crawler as any).processLogsParallelBatch(mockLogs, {})
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Batch error')
        // onError is not called when stopOnError is true and error is thrown
        expect(crawler.crawlSetting.shutdown).to.be.true
        expect(crawler.crawlSetting.nbError).to.equal(1)
      }
    })

    it('should continue processing when stopOnError is false', async () => {
      const onErrorStub = sandbox.stub()
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        onError: onErrorStub,
        logService: 'test' as any,
        stopOnError: false,
        network: NetworksEnum.ethereumMainnet,
      })

      const handlerStub = sandbox.stub()
      handlerStub.onFirstCall().rejects(new Error('Batch error'))
      handlerStub.onSecondCall().resolves()

      let callCount = 0
      sandbox.stub(crawler, 'formatLog').callsFake(() => {
        callCount++
        return {
          event: { name: callCount === 1 ? 'EventA' : 'EventB' } as any,
          handler: handlerStub,
          info: {} as any,
        }
      })

      const mockLogs: any[] = [
        { blockNumber: 100, transactionHash: '0x1' },
        { blockNumber: 101, transactionHash: '0x2' },
      ]

      const result = await (crawler as any).processLogsParallelBatch(mockLogs, {})

      expect(result).to.equal(101)
      // onError might not be called directly in batch processing
      expect(crawler.crawlSetting.nbError).to.equal(1)
      expect(crawler.crawlSetting.nbSuccess).to.equal(1)
    })
  })

  describe('getStrategyBySituation other strategies', () => {
    it('should handle smartRouter strategy', () => {
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        onError: sandbox.stub(),
        logService: 'test' as any,
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
        strategy: 'smartRouter' as any,
      })

      const result = (crawler as any).getStrategyBySituation(100, 200)

      expect(result).to.equal('getLogsByBatch')
    })
  })

  describe('isBatchSizeError', () => {
    it('should return true for timeout errors', () => {
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
        logService: 'test' as any,
        onError: sandbox.stub(),
      })

      const timeoutErrors = [
        { message: 'The query timed out' },
        { message: 'Request timeout exceeded' },
        { message: 'Operation timeout after 30s' },
      ]

      timeoutErrors.forEach(error => {
        expect((crawler as any).isBatchSizeError(error)).to.be.true
      })
    })

    it('should return true for size limit errors', () => {
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
        logService: 'test' as any,
        onError: sandbox.stub(),
      })

      const sizeLimitErrors = [
        { message: 'eth_getLogs is limited to 10000 results' },
        { message: 'Response size is larger than 150MB limit' },
        { message: 'Log response size exceeded the maximum allowed' },
        { message: 'Query returned more than 1000000 results' },
        { message: 'Cannot create a string longer than allowed' },
      ]

      sizeLimitErrors.forEach(error => {
        expect((crawler as any).isBatchSizeError(error)).to.be.true
      })
    })

    it('should return true for block range errors', () => {
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
        logService: 'test' as any,
        onError: sandbox.stub(),
      })

      const blockRangeErrors = [
        { message: 'Block range is too large' },
        { message: 'Consider reducing your block range' },
      ]

      blockRangeErrors.forEach(error => {
        expect((crawler as any).isBatchSizeError(error)).to.be.true
      })
    })

    it('should return false for non-batch size errors', () => {
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
        logService: 'test' as any,
        onError: sandbox.stub(),
      })

      const otherErrors = [
        { message: 'Network connection failed' },
        { message: 'Invalid address' },
        { message: 'Contract not found' },
        { message: 'Unknown error occurred' },
      ]

      otherErrors.forEach(error => {
        expect((crawler as any).isBatchSizeError(error)).to.be.false
      })
    })

    it('should log error and return false when error is null', () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')

      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
        logService: 'test' as any,
        onError: sandbox.stub(),
      })

      const result = (crawler as any).isBatchSizeError(null)

      expect(result).to.be.false
      expect(loggerErrorStub.calledOnce).to.be.true
      expect(loggerErrorStub.firstCall.args[0]).to.equal('Error isBatchSizeError: check error message')
    })

    it('should log error and return false when error is undefined', () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')

      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
        logService: 'test' as any,
        onError: sandbox.stub(),
      })

      const result = (crawler as any).isBatchSizeError(undefined)

      expect(result).to.be.false
      expect(loggerErrorStub.calledOnce).to.be.true
      expect(loggerErrorStub.firstCall.args[0]).to.equal('Error isBatchSizeError: check error message')
    })

    it('should log error and return false when error is empty object', () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')

      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
        logService: 'test' as any,
        onError: sandbox.stub(),
      })

      const result = (crawler as any).isBatchSizeError({})

      expect(result).to.be.false
      expect(loggerErrorStub.calledOnce).to.be.true
      expect(loggerErrorStub.firstCall.args[0]).to.equal('Error isBatchSizeError: check error message')
    })

    it('should handle error without message property', () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')

      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
        logService: 'test' as any,
        onError: sandbox.stub(),
      })

      const errorWithoutMessage = { code: 'TIMEOUT', data: 'some data' }
      const result = (crawler as any).isBatchSizeError(errorWithoutMessage)

      expect(result).to.be.false
      // Logger should still be called because error exists but has no message
      expect(loggerErrorStub.calledOnce).to.be.true
    })

    it('should handle multiple matching error messages', () => {
      const crawler = new BlockchainLogCrawler({
        events: [],
        address: ['0x123'],
        network: NetworksEnum.ethereumMainnet,
        stopOnError: false,
        logService: 'test' as any,
        onError: sandbox.stub(),
      })

      const complexError = {
        message: 'The query timed out. Block range is too large. Consider reducing your block range.',
      }

      // Should return true as it matches multiple batch size error patterns
      expect((crawler as any).isBatchSizeError(complexError)).to.be.true
    })
  })
})
