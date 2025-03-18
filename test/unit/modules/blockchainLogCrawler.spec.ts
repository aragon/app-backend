import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import logger from '@logger'
import { NetworksEnum } from '@types'
import Utils from '@helpers/utils'
import config from '@config'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import { Models } from '@dbModels'
import DbTx from '@modules/dbTx'
import ProviderModule from '@modules/provider'

describe('Module: blockchainLogCrawler', () => {
  let sandbox: SinonSandbox
  let mockProvider: any
  let logError: any
  let logVerbose: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    mockProvider = {
      getBlockNumber: sandbox.stub(),
      send: sandbox.stub(),
    }
    logVerbose = sandbox.stub(logger, 'verbose')
    logError = sandbox.stub(logger, 'error')
  })

  afterEach(() => {
    sandbox.restore()
  })

  it('should crawl logs correctly', async () => {
    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.ethereumMainnet,
      fromBlock: 100,
      toBlock: 200,
      address: '0xAddress',
      events: [],
      stopOnError: false,
      logService: 'indexer-ethereum-mainnet',
      onError: () => {},
    })

    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

    mockProvider.getBlockNumber
      .onFirstCall()
      .resolves(100) // Starting block number
      .onSecondCall()
      .resolves(200) // Latest block number
    mockProvider.send
      .onFirstCall()
      .resolves([
        { transactionHash: '0x1', blockNumber: 101, transactionIndex: 1 },
        { transactionHash: '0x2', blockNumber: 102, transactionIndex: 2 },
      ])
      .onSecondCall()
      .resolves([])

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
    expect(mockProvider.send.calledOnce).to.be.true
    expect(processLogsSpy.calledOnceWith(sandbox.match.array)).to.be.true
    expect(logVerbose.calledWith('Finished crawling logs')).to.be.true
    expect(onSaveProgressStub.calledOnce).to.be.true
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

    const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').callsFake(
      (log, iface) =>
        ({
          event: iface.fragments[0].name,
          args: {},
        }) as any,
    )
    const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns({} as any)

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

    await crawler.processLogs(unsortedLogs)

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

    const stubParseLog = sandbox.stub(Web3Helper, 'parseLog').callsFake(log => log as any)
    const stubParseInfoLog = sandbox.stub(Web3Helper, 'parseInfoLog').resolves(true)

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
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

    const stubSaveProgress = sandbox.stub(crawler, 'onSaveProgress').resolves()
    const processLogsSpy = sandbox.spy(crawler, 'processLogs')

    await crawler.processLogs(unsortedLogs)

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

  it('should re-order and return the formatted logs when skip processing is true', async () => {
    const events = [
      { topic: '0xTopic1', event: 'Test1', config: [{ handler: sandbox.stub().resolves(), abi: ['event Test1()'] }] },
    ] as any

    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.ethereumMainnet,
      fromBlock: 100,
      toBlock: 200,
      skipLogProcessing: true,
      address: '0xAddress',
      events: events,
      stopOnError: false,
      logService: null,
      onError: () => {},
    })

    mockProvider.getBlockNumber.onFirstCall().resolves(100)
    mockProvider.send
      .onFirstCall()
      .resolves([
        { blockNumber: 101, transactionIndex: 1, index: 5, topics: ['0xTopic1'], data: '0xData1' },
        { blockNumber: 101, transactionIndex: 20, index: 2, topics: ['0xTopic1'], data: '0xData1' },
        { blockNumber: 101, transactionIndex: 2, index: 9, topics: ['0xTopic1'], data: '0xData1' },
        { blockNumber: 101, transactionIndex: 50, index: 4, topics: ['0xTopic1'], data: '0xData1' },
        { blockNumber: 101, transactionIndex: 50, index: 4, topics: ['0xTopic1'], data: '0xData1' },
      ])
      .onSecondCall()
      .resolves([])
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

    const updateAndCheckConditionsStub = sandbox
      .stub(crawler, 'updateAndCheckConditions')
      .onFirstCall()
      .resolves(true)
      .onSecondCall()
      .resolves(false)

    const processLogsSpy = sandbox.spy(crawler, 'processLogs')
    const formatLogStub = sandbox.stub(crawler, 'formatLog').returns({
      args: {
        first: 'first',
      },
    } as any)

    const response = await crawler.crawl()
    expect(updateAndCheckConditionsStub.calledOnce).to.be.true
    expect(mockProvider.send.calledOnce).to.be.true
    expect(processLogsSpy.calledOnce).to.be.false
    expect(formatLogStub.callCount).to.equal(5)
    expect(response?.length).to.equal(5)
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

    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

    await crawler.processLogs(logs)

    expect(logError.calledOnce).to.be.true
    expect(logError.calledWith('Error event setting not found in blockchainCrawler')).to.be.true

    for (const event of events) {
      expect(event.handler.notCalled).to.be.true
    }
  })

  it('should stop processing logs on parse log error when stopOnError is true', async () => {
    const logs = [
      { blockNumber: 101, transactionIndex: 0, index: 0, topics: ['0xTopic1'], data: '0xData1' },
      { blockNumber: 101, transactionIndex: 1, index: 0, topics: ['0xTopic2'], data: '0xData2' },
    ] as any

    const events = [
      { topic: '0xTopic1', event: 'Test1', config: [{ abi: ['event Test1()'], handler: sandbox.stub().resolves() }] },
      { topic: '0xTopic2', event: 'Test2', config: [{ abi: ['event Test2()'], handler: sandbox.stub().resolves() }] },
    ] as any

    const stubParseLog = sandbox.stub(Web3Helper, 'parseLog').callsFake((log: any) => {
      if (log.topics[0] === '0xTopic2') return null as any
      return { event: 'Test1', args: {} } as any // Simulate successful parsing for the first log
    })

    const stubParseInfoLog = sandbox.stub(Web3Helper, 'parseInfoLog').returns({} as any)
    const stubSaveProgress = sandbox.stub(BlockchainLogCrawler.prototype, 'onSaveProgress').resolves()

    const onErrorStub = sandbox.stub()

    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.ethereumMainnet,
      fromBlock: 100,
      toBlock: 200,
      address: '0xAddress',
      events,
      stopOnError: true,
      logService: `indexer-${NetworksEnum.ethereumMainnet}`,
      onError: onErrorStub,
    })
    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider as any)

    await crawler.processLogs(logs)

    expect(events[0].config[0].handler.calledOnce).to.be.true
    expect(stubParseLog.calledTwice).to.be.true
    expect(stubParseInfoLog.calledTwice).to.be.true
    expect(stubSaveProgress.calledOnceWith(logs[0].blockNumber)).to.be.true

    expect(logError.calledOnce).to.be.true
    expect(logError.calledWith('Error parsing log in blockchainCrawler')).to.be.true
    expect(onErrorStub.calledOnce).to.be.true
    expect(events[1].config[0].handler.notCalled).to.be.true

    expect(crawler.crawlSetting.isOnError).to.be.true
    expect(crawler.crawlSetting.nbError).to.equal(1)
    expect(crawler.crawlSetting.nbSuccess).to.equal(1)
  })

  it('should handle rate limiting by pausing and retrying', async () => {
    const waitStub = sandbox.stub(Utils, 'wait').resolves()
    mockProvider.getBlockNumber.resolves(100)

    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.ethereumMainnet,
      fromBlock: 100,
      toBlock: 200,
      address: '0xAddress',
      events: [],
      stopOnError: false,
      logService: null,
      onError: () => {},
    })

    const rateLimitError = new Error('Your app has exceeded its compute units per second capacity')
    const retryStub = sandbox
      .stub()
      .onFirstCall()
      .rejects(rateLimitError)
      .onSecondCall()
      .resolves([
        { transactionHash: '0x1', blockNumber: 101 },
        { transactionHash: '0x2', blockNumber: 102 },
      ])

    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      ...mockProvider,
      send: retryStub,
    } as any)

    await crawler.crawl()

    expect(waitStub.calledOnce).to.be.true
    expect(logVerbose.calledWith('Finished crawling logs')).to.be.true
  })

  it('should reduce batch size and retry on batch size error', async () => {
    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.ethereumMainnet,
      fromBlock: 100,
      toBlock: 200,
      address: '0xAddress',
      events: [],
      stopOnError: false,
      logService: null,
      onError: () => {},
    })

    const batchSizeError = new Error('Log response size exceeded')
    const retryStub = sandbox
      .stub()
      .onFirstCall()
      .rejects(batchSizeError)
      .onSecondCall()
      .resolves([{ transactionHash: '0x1', blockNumber: 101 }])

    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getBlockNumber: sandbox.stub().resolves(200),
      send: retryStub,
    } as any)

    const originalBatchSize = crawler.crawlSetting.originalBatchSize

    await crawler.crawl()

    expect(crawler.crawlSetting.batchSize).to.be.lessThanOrEqual(originalBatchSize)
    expect(logVerbose.calledWith('Finished crawling logs')).to.be.true
  })

  it('should stop crawling if batch size becomes too small', async () => {
    const crawler = new BlockchainLogCrawler({
      network: NetworksEnum.ethereumMainnet,
      fromBlock: 100,
      toBlock: 300,
      address: '0xAddress',
      events: [],
      stopOnError: false,
      logService: null,
      onError: () => {},
    })

    const batchSizeError = new Error('Log response size exceeded')

    const retryStub = sandbox.stub().rejects(batchSizeError)

    sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns({
      getBlockNumber: sandbox.stub().resolves(300),
      send: retryStub,
    } as any)

    let batchSize = crawler.crawlSetting.batchSize
    sandbox.stub(crawler.crawlSetting, 'batchSize').get(() => batchSize)
    sandbox.stub(crawler.crawlSetting, 'batchSize').set(value => {
      batchSize = value
    })

    await crawler.crawl()

    expect(logError.calledWith('Batch size too small, stopping crawl')).to.be.true
    expect(crawler.crawlSetting.batchSize).to.eq(1)
  })

  it('should throw an error if block interval time is not found for the network', () => {
    sandbox.stub(utils, 'networkToAragon').returns('FAKE_NETWORK')

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

    expect(executeTxFnStub.calledOnce).to.be.true
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
})
