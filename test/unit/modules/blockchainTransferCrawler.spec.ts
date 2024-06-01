import * as sinon from 'sinon'
import { expect } from 'chai'
import BlockchainTransferCrawler from '@modules/blockchainTransferCrawler'
import { ConfigState } from '@state/configState'
import { NetworksEnum } from '@types'
import Utils from '@helpers/utils'
import Logger from '@logger'

describe('Modules:BlockchainTransferCrawler', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
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
        latestBlockNumber: 0,
        lastBlockSync: 0,
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

  describe('crawl', () => {
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
