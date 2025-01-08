import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import logger from '@logger'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { NetworksEnum } from '@types'
import { expect } from 'chai'

describe('Plugins: LogTokenVoting', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', async () => {
    it('should process error', async () => {
      const errorStub = sandbox.stub(logger, 'error')
      await LogTokenVoting.processError('error', { address: '0x123', network: NetworksEnum.ethereumSepolia } as any)
      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogTokenVoting' as any)).to.be.true
    })

    it('should start the LogDao', async () => {
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')
      await LogTokenVoting.start({
        address: '0x123',
        network: NetworksEnum.ethereumSepolia,
      } as any)
      expect(crawlStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Start LogTokenVoting' as any)).to.be.true
      expect(verboseStub.calledTwice).to.be.true
    })
  })
})
