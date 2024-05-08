import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { PluginLogsUpdatePrepared } from '@services/indexer/pluginSetupProcessorLogs/updatePrepared'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { UtilsIndexer } from '@models/utils/indexer'
import Network from '@models/schema/network'

describe('Indexer: PluginLogsUpdatePrepared', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should skip unsupported networks', async () => {
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves(null)
      const stubLogger = sandbox.stub(logger, 'verbose')
      const crawlerStub = { crawl: sandbox.stub().resolves() }
      await PluginLogsUpdatePrepared.start()

      expect(stubLogger.calledWith('Unsupported Network' as any)).to.be.true
      expect(crawlerStub.crawl.notCalled).to.be.true
      expect(networkFindStub.calledOnce).to.be.true
    })

    it('should process supported networks and run crawlers', async () => {
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves({ lastBlockMetadataLog: 123 })
      const crawlerStub = { crawl: sandbox.stub().resolves() }
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()
      sandbox.stub(PluginLogsUpdatePrepared, 'createCrawler' as any).returns(crawlerStub as any)
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      await PluginLogsUpdatePrepared.start()

      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(crawlerStub.crawl.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(saveSyncStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(loggerVerboseStub.callCount).to.eq(Object.values(Network.NETWORKS).length + 1)
      expect(loggerVerboseStub.calledWith('Start PluginLogsUpdatePrepared' as any)).to.be.true
      expect(loggerVerboseStub.calledWith('Finish PluginLogsUpdatePrepared' as any)).to.be.true
    })
  })

  it('processError', async () => {
    const error = new Error('Test error')
    const loggerStub = sinon.stub(logger, 'error')

    await PluginLogsUpdatePrepared.processError(error, NetworksEnum.mainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error PluginLogsUpdatePrepared' as any))
  })
})
