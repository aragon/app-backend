import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { LogLockToVote } from '@plugins/logLockToVote'
import { IPluginInterfaceType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonPlugins: LogLockToVote', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should start the LogLockToVote', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')
      await LogLockToVote.start({
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        lockManagerAddress: '0x456',
      } as any)
      expect(crawlStub.calledTwice).to.be.true // Two crawlers: plugin and lockManager
      expect(verboseStub.calledWith('Start LogLockToVote' as any)).to.be.true
      expect(verboseStub.calledTwice).to.be.true
    })

    it('should handle errors during plugin crawling', async () => {
      const pluginStub = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 0,
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0x456',
      } as any

      const error = new Error('Plugin crawler test error')
      let crawlCallCount = 0
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (
        this: BlockchainLogCrawler,
      ): Promise<any> {
        crawlCallCount++
        // First crawler (plugin) triggers error
        if (crawlCallCount === 1 && (this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, { logIndex: 1, transactionHash: '0xhash' })
        }
      })
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()

      const processErrorStub = sandbox.stub(LogLockToVote, 'processError').resolves()

      await LogLockToVote.start(pluginStub)

      expect(crawlStub.calledTwice).to.be.true
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, pluginStub, { logIndex: 1, transactionHash: '0xhash' })).to.be.true
    })

    it('should handle errors during lockManager crawling', async () => {
      const pluginStub = {
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
        blockNumber: 0,
        interfaceType: IPluginInterfaceType.lockToVote,
        lockManagerAddress: '0x456',
      } as any

      const error = new Error('LockManager crawler test error')
      let crawlCallCount = 0
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (
        this: BlockchainLogCrawler,
      ): Promise<any> {
        crawlCallCount++
        // Second crawler (lockManager) throws error
        if (crawlCallCount === 2 && (this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, { logIndex: 2, transactionHash: '0xhash2' })
        }
      })
      const endStub = sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()

      const processErrorStub = sandbox.stub(LogLockToVote, 'processError').resolves()

      await LogLockToVote.start(pluginStub)

      expect(crawlStub.calledTwice).to.be.true
      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.calledWith(error, pluginStub, { logIndex: 2, transactionHash: '0xhash2' })).to.be.true
    })

    it('should process error', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      await LogLockToVote.processError(
        'error',
        { address: '0x123', network: NetworksEnum.ethereumSepolia } as any,
        'log',
      )
      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogLockToVote' as any)).to.be.true
    })
  })
})
