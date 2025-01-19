import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import logger from '@logger'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import { ProxyToken } from '@modules/proxyToken'

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
      sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ blockNumber: 1 } as any)
      await LogTokenVoting.processError('error', {
        address: '0x123',
        tokenAddress: '0xtoken',
        network: NetworksEnum.ethereumSepolia,
      } as any)
      expect(errorStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Error LogTokenVoting' as any)).to.be.true
    })

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
  })
})
