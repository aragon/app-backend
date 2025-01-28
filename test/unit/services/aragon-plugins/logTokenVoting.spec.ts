import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import logger from '@logger'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { ProxyToken } from '@modules/proxyToken'

describe('AragonPlugins: LogTokenVoting', () => {
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
      const verboseStub = sandbox.stub(logger, 'verbose')
      const token = { address: '0x123', network: NetworksEnum.ethereumSepolia } as any
      await LogTokenVoting.start(
        {
          address: '0x123',
          tokenAddress: token.address,
          network: token.network,
        } as any,
        token as any,
      )
      expect(crawlStub.calledTwice).to.be.true
      expect(verboseStub.calledWith('Start LogTokenVoting' as any)).to.be.true
      expect(verboseStub.calledTwice).to.be.true
    })

    it('should handle errors during crawling for the first BlockchainLogCrawler', async () => {
      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        interfaceType: 'tokenVoting',
      } as any

      const tokenStub = {
        address: '0x456',
        blockNumber: 200,
        network: NetworksEnum.ethereumSepolia,
      } as any

      const error = new Error('Test error from first crawler')

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')
      crawlStub.onFirstCall().callsFake(async function (this: BlockchainLogCrawler): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, { logIndex: 1, transactionHash: '0xhash1' })
        }
      })
      crawlStub.onSecondCall().resolves()

      const processErrorStub = sandbox.stub(LogTokenVoting, 'processError').resolves()

      await LogTokenVoting.start(pluginStub, tokenStub)

      expect(crawlStub.calledTwice).to.be.true
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, pluginStub, { logIndex: 1, transactionHash: '0xhash1' })).to.be.true
    })

    it('should handle errors during crawling for the second BlockchainLogCrawler', async () => {
      const pluginStub = {
        address: '0x123',
        tokenAddress: '0x456',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 100,
        interfaceType: 'tokenVoting',
      } as any

      const tokenStub = {
        address: '0x456',
        blockNumber: 200,
        network: NetworksEnum.ethereumSepolia,
      } as any

      const error = new Error('Test error from second crawler')

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl')
      crawlStub.onFirstCall().resolves()
      crawlStub.onSecondCall().callsFake(async function (this: BlockchainLogCrawler): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, { logIndex: 2, transactionHash: '0xhash2' })
        }
      })

      const processErrorStub = sandbox.stub(LogTokenVoting, 'processError').resolves()

      await LogTokenVoting.start(pluginStub, tokenStub)

      expect(crawlStub.calledTwice).to.be.true
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, pluginStub, { logIndex: 2, transactionHash: '0xhash2' })).to.be.true
    })

    it('should process error', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ blockNumber: 1 } as any)
      await LogTokenVoting.processError(
        'error',
        {
          address: '0x123',
          tokenAddress: '0xtoken',
          network: NetworksEnum.ethereumSepolia,
        } as any,
        'log',
      )
      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogTokenVoting' as any)).to.be.true
    })
  })
})
