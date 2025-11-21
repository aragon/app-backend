import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import logger from '@logger'
import { LogCampaignStrategy } from '@plugins/logCampaignStrategy'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { NetworksEnum } from '@types'
import { expect } from 'chai'

describe('AragonPlugins: LogCampaignStrategy', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should start the LogCampaignStrategy', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      await LogCampaignStrategy.start('0x123', NetworksEnum.ethereumSepolia)

      expect(crawlStub.calledOnce).to.be.true
      expect(endStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Start LogCampaignStrategy' as any)).to.be.true
      expect(verboseStub.calledWith('End LogCampaignStrategy' as any)).to.be.true
      expect(verboseStub.calledTwice).to.be.true
    })

    it('should start the LogCampaignStrategy with fromBlock parameter', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      await LogCampaignStrategy.start('0x123', NetworksEnum.ethereumSepolia, 100)

      expect(crawlStub.calledOnce).to.be.true
      expect(endStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Start LogCampaignStrategy' as any)).to.be.true
      expect(verboseStub.calledWith('End LogCampaignStrategy' as any)).to.be.true
    })

    it('should handle errors during crawling', async () => {
      const error = new Error('Test error')
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (
        this: BlockchainLogCrawler,
      ): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, { logIndex: 1, transactionHash: '0xhash' })
        }
      })
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()

      const processErrorStub = sandbox.stub(LogCampaignStrategy, 'processError').resolves()

      await LogCampaignStrategy.start('0x123', NetworksEnum.ethereumSepolia)

      expect(crawlStub.calledOnce).to.be.true
      expect(endStub.calledOnce).to.be.true
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, { logIndex: 1, transactionHash: '0xhash' })).to.be.true
    })

    it('should initialize crawler with correct configuration', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      sandbox.stub(logger, 'verbose')

      const allocationStrategyAddress = '0x456'
      const network = NetworksEnum.ethereumMainnet
      const fromBlock = 200

      await LogCampaignStrategy.start(allocationStrategyAddress, network, fromBlock)

      expect(crawlStub.calledOnce).to.be.true
      expect(endStub.calledOnce).to.be.true

      // Verify crawler configuration
      const crawlerInstance = crawlStub.thisValues[0]
      expect(crawlerInstance.crawlParams.network).to.equal(network)
      expect(crawlerInstance.crawlParams.address).to.equal(allocationStrategyAddress)
      expect(crawlerInstance.crawlParams.fromBlock).to.equal(fromBlock)
      expect(crawlerInstance.crawlParams.stopOnError).to.be.true
    })
  })

  describe('processError', () => {
    it('should log an error when processError is called', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      const error = new Error('Test error')
      const logStub = { logIndex: 1, transactionHash: '0xhash' }

      await LogCampaignStrategy.processError(error, logStub)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogCampaignStrategy' as any)).to.be.true
    })

    it('should handle string error messages', async () => {
      const errorStub = sandbox.stub(logger, 'error')

      await LogCampaignStrategy.processError('string error message', 'log data')

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogCampaignStrategy' as any)).to.be.true
    })
  })
})
