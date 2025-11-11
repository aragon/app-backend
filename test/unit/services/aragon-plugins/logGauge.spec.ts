import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { LogGauge } from '@plugins/logGauge'

describe('AragonPlugins: LogGauge', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should start the LogGauge and process logs successfully', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
      }
      const tokenStub = {
        address: '0x456',
        blockNumber: 100,
        network: NetworksEnum.ethereumSepolia,
      }

      await LogGauge.start(pluginStub as any, tokenStub as any)

      expect(crawlStub.calledOnce).to.be.true
      expect(verboseStub.calledTwice).to.be.true
      expect(verboseStub.calledWith('Start LogGauge' as any)).to.be.true
      expect(verboseStub.calledWith('End LogGauge' as any)).to.be.true
    })

    it('should handle errors during crawling', async () => {
      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
      }
      const tokenStub = {
        address: '0x456',
        blockNumber: 100,
        network: NetworksEnum.ethereumSepolia,
      }

      const error = new Error('Test error')
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (
        this: BlockchainLogCrawler,
      ): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, { logIndex: 1, transactionHash: '0xhash' })
        }
      })
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()

      const processErrorStub = sandbox.stub(LogGauge, 'processError').resolves()

      await LogGauge.start(pluginStub as any, tokenStub as any)

      expect(crawlStub.calledOnce).to.be.true
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, pluginStub, { logIndex: 1, transactionHash: '0xhash' })).to.be.true
    })
  })

  describe('processError', () => {
    it('should log an error when processError is called', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      const pluginStub = {
        address: '0x123',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumSepolia,
      }
      const logStub = { logIndex: 1, transactionHash: '0xhash' }

      await LogGauge.processError('error-message', pluginStub as any, logStub)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogGauge' as any)).to.be.true
    })
  })
})
