import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import ProviderModule from '@modules/provider'
import { LogMultiSig } from '@plugins/logMultisig'
import { UnitTestUtils } from '@test/lib/utils'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonIndexer: LogMultiSig', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start indexer', () => {
    it('should start the multi-sig events log crawler', async () => {
      const plugin = {
        network: NetworksEnum.polygonMainnet,
        address: '0x1234567890123456789012345678901234567890',
      } as any

      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      await LogMultiSig.start(plugin)

      expect(crawlStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Start LogMultiSig' as any)).to.be.true
      expect(verboseStub.calledWith('End LogMultiSig' as any)).to.be.true
    })
  })
})
