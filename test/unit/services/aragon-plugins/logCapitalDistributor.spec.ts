import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import logger from '@logger'
import { LogCapitalDistributor } from '@plugins/logCapitalDistributor'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'

describe('AragonPlugins: LogCapitalDistributor', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should start the LogCapitalDistributor', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      const plugin = {
        id: '1',
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        interfaceType: IPluginInterfaceType.admin,
      } as any

      await LogCapitalDistributor.start(plugin)

      expect(crawlStub.calledOnce).to.be.true
      expect(endStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Start LogCapitalDistributor' as any)).to.be.true
      expect(verboseStub.calledWith('End LogCapitalDistributor' as any)).to.be.true
      expect(verboseStub.calledTwice).to.be.true
    })

    it('should handle errors during crawling', async () => {
      const plugin = {
        id: '1',
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        interfaceType: IPluginInterfaceType.admin,
      } as any

      const error = new Error('Test error')
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (
        this: BlockchainLogCrawler,
      ): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, { logIndex: 1, transactionHash: '0xhash' })
        }
      })
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()

      const processErrorStub = sandbox.stub(LogCapitalDistributor, 'processError').resolves()

      await LogCapitalDistributor.start(plugin)

      expect(crawlStub.calledOnce).to.be.true
      expect(endStub.calledOnce).to.be.true
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, plugin, { logIndex: 1, transactionHash: '0xhash' })).to.be.true
    })

    it('should initialize crawler with correct configuration', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      sandbox.stub(logger, 'verbose')

      const plugin = {
        id: '42',
        address: '0x456',
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 200,
        interfaceType: IPluginInterfaceType.multisig,
      } as any

      await LogCapitalDistributor.start(plugin)

      expect(crawlStub.calledOnce).to.be.true
      expect(endStub.calledOnce).to.be.true

      // Verify crawler configuration
      const crawlerInstance = crawlStub.thisValues[0]
      expect(crawlerInstance.crawlParams.network).to.equal(plugin.network)
      expect(crawlerInstance.crawlParams.address).to.equal(plugin.address)
      expect(crawlerInstance.crawlParams.fromBlock).to.equal(plugin.blockNumber)
      expect(crawlerInstance.crawlParams.stopOnError).to.be.true
    })

    it('should handle plugin without blockNumber', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      sandbox.stub(logger, 'verbose')

      const plugin = {
        id: '1',
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.tokenVoting,
        // blockNumber is undefined
      } as any

      await LogCapitalDistributor.start(plugin)

      expect(crawlStub.calledOnce).to.be.true
      expect(endStub.calledOnce).to.be.true

      // Verify crawler configuration handles undefined blockNumber
      const crawlerInstance = crawlStub.thisValues[0]
      expect(crawlerInstance.crawlParams.fromBlock).to.be.undefined
    })
  })

  describe('processError', () => {
    it('should log an error when processError is called', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      const error = new Error('Test error')
      const plugin = {
        id: '1',
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        interfaceType: IPluginInterfaceType.admin,
      } as any
      const logStub = { logIndex: 1, transactionHash: '0xhash' }

      await LogCapitalDistributor.processError(error, plugin, logStub)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogCapitalDistributor' as any)).to.be.true
    })

    it('should handle string error messages', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      const plugin = {
        id: '1',
        address: '0x123',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.spp,
      } as any

      await LogCapitalDistributor.processError('string error message', plugin, 'log data')

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogCapitalDistributor' as any)).to.be.true
    })

    it('should include plugin and log details in error logging', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      const error = new Error('Blockchain connection failed')
      const plugin = {
        id: '5',
        address: '0xabcdef',
        network: NetworksEnum.ethereumMainnet,
        interfaceType: IPluginInterfaceType.gauge,
        blockNumber: 15000,
      } as any
      const logStub = {
        logIndex: 3,
        transactionHash: '0xhash123',
        blockNumber: 15001,
      }

      await LogCapitalDistributor.processError(error, plugin, logStub)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogCapitalDistributor' as any)).to.be.true
    })
  })
})
