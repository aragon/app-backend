import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import ProviderModule from '@modules/provider'
import { LogTokenVoting } from '@plugins/logTokenVoting'
import { UnitTestUtils } from '@test/lib/utils'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonIndexer: LogTokenVoting', () => {
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

      await LogTokenVoting.start(plugin, token)

      expect(crawlStub.calledTwice).to.be.true
      expect(verboseStub.calledWith('Start LogTokenVoting' as any)).to.be.true
      expect(verboseStub.calledWith('End LogTokenVoting' as any)).to.be.true
    })
  })
})
