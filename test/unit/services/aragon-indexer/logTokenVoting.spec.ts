import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { NetworksEnum } from '@types'
import { UnitTestUtils } from '@test/lib/utils'
import ProviderModule from '@modules/provider'
import { ProxyToken } from '@modules/proxyToken'

describe('Indexer: LogTokenVoting', () => {
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
      } as any

      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')
      const stubToken = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({ blockNumber: 10 } as any)

      await LogTokenVoting.start(plugin)

      expect(stubToken.calledOnceWith(plugin.tokenAddress, plugin.network)).to.be.true
      expect(crawlStub.calledTwice).to.be.true
      expect(verboseStub.calledWith('Start LogTokenVoting' as any)).to.be.true
      expect(verboseStub.calledWith('End LogTokenVoting' as any)).to.be.true
    })
  })
})
