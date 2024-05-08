import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import logger from '@logger'
import { ConfigState } from '@state/configState'
import { NetworksEnum } from '@types'
import Utils from '@helpers/utils'

describe('Module: blockchainLogCrawler', () => {
  let sandbox: SinonSandbox
  let mockProvider: any
  let logError: any
  let logWarn: any
  let logInfo: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    mockProvider = {
      getBlockNumber: sandbox.stub(),
      getLogs: sandbox.stub(),
    }
    logWarn = sandbox.spy(logger, 'warn')
    logInfo = sandbox.spy(logger, 'info')
    logError = sandbox.spy(logger, 'error')
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should crawl logs correctly', async () => {
    sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => mockProvider } as any)
    mockProvider.getBlockNumber.resolves(10)
    mockProvider.getLogs
      .onFirstCall()
      .resolves([{ transactionHash: '0x1' }, { transactionHash: '0x2' }])
      .onSecondCall()
      .resolves([])

    const onLogStub = sandbox.stub().resolves()
    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.mainnet,
      filter: {},
      batchSize: 10,
      onLog: onLogStub,
    })

    await crawler.crawl()

    expect(onLogStub.calledTwice).to.be.true
    expect(onLogStub.calledTwice).to.be.true
    expect(logInfo.calledWith('Finished crawling logs')).to.be.true
  })

  it('should handle continuous crawling with new blocks added', async () => {
    sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => mockProvider } as any)
    let blockNumber = 10
    mockProvider.getBlockNumber.callsFake(() => Promise.resolve(blockNumber++))
    mockProvider.getLogs.resolves([{ transactionHash: `0x${blockNumber}` }])

    const onLogStub = sandbox.stub().resolves()
    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.mainnet,
      filter: {},
      batchSize: 1,
      onLog: onLogStub,
    })
    sandbox
      .stub(crawler, 'updateAndCheckConditions')
      .onFirstCall()
      .resolves(true)
      .onSecondCall()
      .resolves(true)
      .onThirdCall()
      .resolves(false)

    const stubProcessLogs = sandbox.spy(crawler, 'processLogs')

    await crawler.crawl()

    expect(stubProcessLogs.callCount).to.be.eq(2)
    expect(stubProcessLogs.args[0][0][0].transactionHash).to.exist
    expect(stubProcessLogs.args[1][0][0].transactionHash).to.exist
    expect(onLogStub.callCount).to.be.eq(2)
    expect(logInfo.calledWith('Finished crawling logs')).to.be.true
  })

  it('should handle rate limiting by pausing and retrying', async () => {
    sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => mockProvider } as any)

    const rateLimitError = new Error('Your app has exceeded its compute units per second capacity')
    rateLimitError.message = 'Your app has exceeded its compute units per second capacity'
    const waitStub = sandbox.stub(Utils, 'wait').resolves()

    mockProvider.getBlockNumber.resolves(10)
    mockProvider.getLogs
      .onFirstCall()
      .rejects(rateLimitError)
      .onSecondCall()
      .resolves([{ transactionHash: '0x1' }, { transactionHash: '0x2' }])
      .onThirdCall()
      .resolves([])

    const onLogStub = sandbox.stub().resolves()
    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.mainnet,
      filter: {},
      batchSize: 10,
      onLog: onLogStub,
    })

    await crawler.crawl()

    expect(waitStub.calledOnce).to.be.true
    expect(onLogStub.calledTwice).to.be.true
    expect(onLogStub.calledTwice).to.be.true
    expect(logInfo.calledWith('Finished crawling logs')).to.be.true
  })

  it('should reduce batch size and retry on batch size error', async () => {
    sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => mockProvider } as any)
    const error = new Error('Log response size exceeded')
    error.message = 'Log response size exceeded'
    mockProvider.getBlockNumber.onFirstCall().resolves(100).onSecondCall().resolves(100)
    mockProvider.getLogs.onFirstCall().rejects(error).onSecondCall().resolves([])
    const onLogStub = sandbox.stub().resolves()
    const onErrorStub = sandbox.stub()
    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.mainnet,
      filter: {},
      batchSize: 2000,
      onLog: onLogStub,
      onError: onErrorStub,
    })

    await crawler.crawl()

    expect(logWarn.calledWith('Reducing batch size due to error')).to.be.true
  })

  it('should reduce batch size and retry on batch size error with default error', async () => {
    sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => mockProvider } as any)
    const error = new Error('Log response size exceeded')
    error.message = 'Log response size exceeded'
    mockProvider.getBlockNumber.onFirstCall().resolves(2000).onSecondCall().resolves(100)
    mockProvider.getLogs.onFirstCall().rejects(error).onSecondCall().resolves([])
    const onLogStub = sandbox.stub().resolves()
    const onErrorSpy = sandbox.spy(BlockchainLogCrawler, 'defaultOnError')
    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.mainnet,
      filter: {},
      batchSize: 2000,
      onLog: onLogStub,
      onError: BlockchainLogCrawler.defaultOnError,
    })

    await crawler.crawl()

    expect(logWarn.calledWith('Reducing batch size due to error')).to.be.true
    expect(logError.calledWith('Error in BlockchainLogCrawler')).to.be.true
    expect(onErrorSpy.calledOnce).to.be.true
  })

  it('should handle empty log responses', async () => {
    sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => mockProvider } as any)
    mockProvider.getBlockNumber.resolves(100)
    mockProvider.getLogs.resolves([])

    const onLogStub = sandbox.stub().resolves()
    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.mainnet,
      filter: {},
      batchSize: 2000,
      onLog: onLogStub,
    })

    await crawler.crawl()

    expect(onLogStub.callCount).to.equal(0)
    expect(logInfo.calledWith('Finished crawling logs')).to.be.true
  })

  it('should properly handle network errors', async () => {
    sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => mockProvider } as any)
    const networkError = new Error('Network failure')
    mockProvider.getBlockNumber.rejects(networkError)

    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.mainnet,
      filter: {},
      batchSize: 2000,
      onLog: async () => {},
      onError: async () => {},
    })

    await crawler.crawl()

    expect(logError.calledOnce).to.be.true
    expect(logError.calledWith('Error get block number')).to.be.true
  })

  it('should throw an error if the provider is not configured for the network', () => {
    sandbox.stub(ConfigState, 'getInstance').returns({
      getConfigItem: sandbox.stub().returns(null),
    } as any)

    const options = {
      network: NetworksEnum.mainnet,
      filter: {},
      onLog: async () => {},
    }

    expect(() => new BlockchainLogCrawler(options)).to.throw('Provider not configured for network: ' + options.network)
  })

  it('should throw an error if crawl is invoked while already crawling', async () => {
    const provider = {
      getBlockNumber: sandbox.stub().resolves(10),
      getLogs: sandbox.stub().resolves([]),
    }
    sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => provider } as any)
    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.mainnet,
      filter: {},
      batchSize: 2000,
      onLog: async () => {},
    })

    const crawlPromise = crawler.crawl()

    await expect(crawler.crawl()).to.be.rejectedWith('Already crawling')
    await crawlPromise
  })

  it('should handle errors in processLogs correctly', async () => {
    const provider = {
      getBlockNumber: sandbox.stub().resolves(10),
      getLogs: sandbox.stub().resolves([]),
    }
    sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => provider } as any)
    const mockOnError = sandbox.stub()
    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.mainnet,
      filter: {},
      batchSize: 5,
      onLog: async () => {},
      onError: mockOnError,
      stopOnError: true,
    })

    const testLogs = [{ transactionHash: '0x123' }, { transactionHash: '0x456' }]
    const processingError = new Error('Test processing error')

    sandbox
      .stub(crawler, 'onLog' as any)
      .onFirstCall()
      .resolves()
      .onSecondCall()
      .rejects(processingError)

    await crawler.processLogs(testLogs as any)

    expect(mockOnError.calledOnceWith(processingError, testLogs[1]))
    expect((crawler as any).crawlResult.nbError).to.equal(1)
    expect((crawler as any).isOnError).to.be.true
  })

  describe('calculateBatchSize', () => {
    let crawler

    beforeEach(() => {
      sandbox.stub(ConfigState, 'getInstance').returns({ getConfigItem: () => mockProvider } as any)
      crawler = new BlockchainLogCrawler({
        network: NetworksEnum.mainnet,
        filter: {},
        onLog: async () => {},
      })
    })

    it('should calculate the correct batch size for mainnet, arbitrum, and base networks', () => {
      const secondsInMonth = 30 * 24 * 3600
      const expectedBatchSize = Math.floor(secondsInMonth / 14) // Average block time ~14 seconds
      expect(crawler.calculateBatchSize(NetworksEnum.mainnet)).to.equal(expectedBatchSize)
      expect(crawler.calculateBatchSize(NetworksEnum.arbitrum)).to.equal(expectedBatchSize)
      expect(crawler.calculateBatchSize(NetworksEnum.base)).to.equal(expectedBatchSize)
    })

    it('should calculate the correct batch size for polygon network', () => {
      const secondsInMonth = 30 * 24 * 3600
      const expectedBatchSize = Math.floor(secondsInMonth / 2) // Average block time ~2 seconds
      expect(crawler.calculateBatchSize(NetworksEnum.polygon)).to.equal(expectedBatchSize)
    })

    it('should calculate the correct batch size for sepolia network', () => {
      const secondsInMonth = 30 * 24 * 3600
      const expectedBatchSize = Math.floor(secondsInMonth / 12) // Average block time ~12 seconds
      expect(crawler.calculateBatchSize(NetworksEnum.sepolia)).to.equal(expectedBatchSize)
    })

    it('should throw an error for an unsupported network', () => {
      const unsupportedNetwork = 'unknown' // Assume 'unknown' is not in NetworksEnum
      expect(() => crawler.calculateBatchSize(unsupportedNetwork as NetworksEnum)).to.throw(
        `Unsupported network: ${unsupportedNetwork}`,
      )
    })
  })
})
