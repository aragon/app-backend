import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { LogCrossChain } from '@plugins/logCrossChain'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonPlugins: LogCrossChain', () => {
  let sandbox: SinonSandbox

  const plugin = {
    address: '0x1111111111111111111111111111111111111111',
    network: NetworksEnum.ethereumSepolia,
    blockNumber: 12000,
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should crawl the controller from its creation block', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      await LogCrossChain.start(plugin as any)

      expect(crawlStub.calledOnce).to.be.true
      expect(endStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Start LogCrossChain for plugin' as any)).to.be.true
      expect(verboseStub.calledWith('End LogCrossChain for plugin' as any)).to.be.true
    })
  })

  describe('_processError', () => {
    it('should log crawl errors', async () => {
      const errorStub = sandbox.stub(logger, 'error')

      await LogCrossChain._processError(new Error('boom'), plugin.address as any, plugin.network, { some: 'log' })

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.args[0][0]).to.equal('Error LogCrossChain')
    })
  })
})
