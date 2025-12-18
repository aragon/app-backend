import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { LogSpp } from '@plugins/logSPP'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonPlugins: LogMultiSig', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the LogDao', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')
      await LogSpp.start({
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
      } as any)
      expect(crawlStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Start LogSpp' as any)).to.be.true
      expect(verboseStub.calledTwice).to.be.true
    })

    it('should handle errors during crawling', async () => {
      const pluginStub = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 0,
        interfaceType: IPluginInterfaceType.spp,
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

      const processErrorStub = sandbox.stub(LogSpp, 'processError').resolves()

      await LogSpp.start(pluginStub)

      expect(crawlStub.calledOnce).to.be.true
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, pluginStub, { logIndex: 1, transactionHash: '0xhash' })).to.be.true
    })

    it('should process error', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      await LogSpp.processError('error', { address: '0x123', network: NetworksEnum.ethereumSepolia } as any, 'log')
      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogSpp' as any)).to.be.true
    })
  })
})
