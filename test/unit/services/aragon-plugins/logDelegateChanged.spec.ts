import { Models } from '@dbModels'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import { LogDelegateChanged } from '@services/aragon-plugins/logDelegateChanged'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonPlugins: LogDelegateChanged', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    const plugin = {
      address: '0x1234567890123456789012345678901234567890',
      tokenAddress: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 100,
      interfaceType: 'tokenVoting',
    }

    const token = {
      address: '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      network: NetworksEnum.ethereumMainnet,
      blockNumber: 50,
    }

    it('should crawl DelegateChanged events historically and log start/end', async () => {
      sandbox.stub(Models.Token, 'findOne').resolves(token as any)
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves(undefined)
      sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      await LogDelegateChanged.start(plugin as any)

      expect(crawlStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Start LogDelegateChanged historical sync' as any)).to.be.true
      expect(verboseStub.calledWith('End LogDelegateChanged historical sync' as any)).to.be.true
    })

    it('should use token.blockNumber as fromBlock', async () => {
      sandbox.stub(Models.Token, 'findOne').resolves(token as any)
      let capturedFromBlock: any
      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (this: any): Promise<undefined> {
        capturedFromBlock = this.crawlSetting.filter.fromBlock
        return undefined
      })
      sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      sandbox.stub(logger, 'verbose')

      await LogDelegateChanged.start(plugin as any)

      expect(capturedFromBlock).to.eq(token.blockNumber)
    })

    it('should fall back to plugin.blockNumber when token is not found', async () => {
      sandbox.stub(Models.Token, 'findOne').resolves(null)
      let capturedFromBlock: any
      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (this: any): Promise<undefined> {
        capturedFromBlock = this.crawlSetting.filter.fromBlock
        return undefined
      })
      sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      sandbox.stub(logger, 'verbose')

      await LogDelegateChanged.start(plugin as any)

      expect(capturedFromBlock).to.eq(plugin.blockNumber)
    })

    it('should crawl successfully for VE plugin with escrow addresses', async () => {
      const vePlugin = {
        ...plugin,
        votingEscrow: {
          escrowAddress: '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
          exitQueueAddress: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
        },
      }

      sandbox.stub(Models.Token, 'findOne').resolves(token as any)
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves(undefined)
      sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      sandbox.stub(logger, 'verbose')

      await LogDelegateChanged.start(vePlugin as any)

      expect(crawlStub.calledOnce).to.be.true
    })

    it('should call processError when crawl triggers onError', async () => {
      sandbox.stub(Models.Token, 'findOne').resolves(token as any)
      const error = new Error('crawl error')
      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (this: any): Promise<undefined> {
        this.crawlParams.onError(error, { transactionHash: '0xhash' })
        return undefined
      })
      sandbox.stub(BlockchainLogCrawler.prototype, 'end').resolves()
      sandbox.stub(logger, 'verbose')

      const processErrorStub = sandbox.stub(LogDelegateChanged, 'processError').resolves()

      await LogDelegateChanged.start(plugin as any)

      expect(processErrorStub.calledOnce).to.be.true
      expect(processErrorStub.firstCall.args[0]).to.equal(error)
      expect(processErrorStub.firstCall.args[2]).to.deep.equal({ transactionHash: '0xhash' })
    })
  })

  describe('processError', () => {
    it('should log an error', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      const plugin = { address: '0x123', network: NetworksEnum.ethereumMainnet }
      const log = { transactionHash: '0xhash' }

      await LogDelegateChanged.processError('some error', plugin as any, log)

      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogDelegateChanged' as any)).to.be.true
    })
  })
})
