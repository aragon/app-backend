import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { PluginLogsInstallationApplied } from '@services/indexer/pluginSetupProcessorLogs/installationApplied'
import logger from '@logger'
import { IEventLogPluginType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { UtilsIndexer } from '@models/utils/indexer'
import Network from '@models/schema/network'
import { Interface } from 'ethers'

describe('Indexer: PluginLogsInstallationApplied', () => {
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
      await PluginLogsInstallationApplied.start()

      expect(stubLogger.calledWith('Unsupported Network' as any)).to.be.true
      expect(crawlerStub.crawl.notCalled).to.be.true
      expect(networkFindStub.calledOnce).to.be.true
    })

    it('should process supported networks and run crawlers', async () => {
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves({ lastBlockMetadataLog: 123 })
      const crawlerStub = { crawl: sandbox.stub().resolves() }
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()
      sandbox.stub(PluginLogsInstallationApplied, 'createCrawler' as any).returns(crawlerStub as any)
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      await PluginLogsInstallationApplied.start()

      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(crawlerStub.crawl.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(saveSyncStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(loggerVerboseStub.callCount).to.eq(Object.values(Network.NETWORKS).length + 1)
      expect(loggerVerboseStub.calledWith('Start PluginLogsInstallationApplied' as any)).to.be.true
      expect(loggerVerboseStub.calledWith('Finish PluginLogsInstallationApplied' as any)).to.be.true
    })
  })

  it('processInstallationApplied', async () => {
    const txLog = {
      transactionHash: '0x123',
      address: '0x456',
      data: '0x789',
      topics: ['0xabc'],
      blockNumber: 1,
    }
    const fakeEvent = {
      args: {
        metadata: 'fake-metadata',
        dao: '0x456',
        preparedSetupId: '0x453',
        appliedSetupId: '0x452',
        plugin: '0x450',
      },
    }

    const stubParseLog = sandbox.stub(Interface.prototype, 'parseLog').returns(fakeEvent as any)
    const loggerStub = sandbox.stub(logger, 'verbose')
    const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findTxHashAndEvent')

    await PluginLogsInstallationApplied.processInstallationApplied(txLog, NetworksEnum.mainnet)

    expect(stubParseLog.calledOnce).to.be.true
    expect(stubParseLog.calledWith(txLog)).to.be.true
    expect(findTxSpy.calledWith(txLog.transactionHash, IEventLogPluginType.InstallationApplied)).to.be.true
    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('New PluginLog - InstallationApplied' as any))

    const daoMetadataDB = await Models.LogPluginSetupProcessor.findTxHashAndEvent(
      txLog.transactionHash,
      IEventLogPluginType.InstallationApplied,
    )
    expect(daoMetadataDB.transactionHash).to.eq(txLog.transactionHash)
    expect(daoMetadataDB.blockNumber).to.eq(txLog.blockNumber)
    expect(daoMetadataDB.network).to.eq(NetworksEnum.mainnet)
    expect(daoMetadataDB.event).to.eq(IEventLogPluginType.InstallationApplied)
    expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
    expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
    expect(daoMetadataDB.appliedSetupId).to.eq(fakeEvent.args.appliedSetupId)
    expect(daoMetadataDB.plugin).to.eq(fakeEvent.args.plugin)
  })

  it('processError', async () => {
    const error = new Error('Test error')
    const loggerStub = sandbox.stub(logger, 'error')

    await PluginLogsInstallationApplied.processError(error, NetworksEnum.mainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error PluginLogsInstallationApplied' as any))
  })
})
