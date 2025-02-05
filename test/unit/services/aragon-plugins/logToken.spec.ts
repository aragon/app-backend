import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { LogToken } from '@plugins/logToken'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { NetworksEnum } from '@types'
import { UnitTestUtils } from '@test/lib/utils'
import ProviderModule from '@modules/provider'
describe('AragonIndexer: LogToken', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start token voting blockchain crawler', () => {
    it('should start the token voting events log crawler', async () => {
      const plugin = {
        network: NetworksEnum.polygonMainnet,
        address: '0x1234567890123456789012345678901234567890',
        tokenAddress: '0x1234567890123456789012345678901234567800',
      } as any

      const token = {
        network: NetworksEnum.polygonMainnet,
        address: plugin.tokenAddress,
      } as any

      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      await LogToken.start(plugin, token)

      expect(crawlStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Start Log Token' as any)).to.be.true
      expect(verboseStub.calledWith('End LogToken' as any)).to.be.true
    })

    it('should process error', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      await LogToken.processError('error', { address: '0x123', network: NetworksEnum.ethereumSepolia } as any, 'log')
      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogToken' as any)).to.be.true
    })

    it('should handle errors during crawling', async () => {
      const plugin = {
        address: '0x123',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 0,
      } as any

      const token = {
        address: '0xtoken',
        network: NetworksEnum.ethereumSepolia,
      } as any

      sandbox.stub(logger, 'verbose')
      const error = new Error('Test error')
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (
        this: BlockchainLogCrawler,
      ): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, 'log' as any)
        }
      })

      const processErrorStub = sandbox.stub(LogToken, 'processError').resolves()

      await LogToken.start(plugin, token)

      expect(crawlStub.calledOnce).to.be.true
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, plugin, 'log')).to.be.true
    })
  })
})
