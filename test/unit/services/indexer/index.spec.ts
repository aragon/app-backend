import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import IndexerService from '@services/indexer/index'
import { DaoLogs } from '@services/indexer/daoLogs'
import { MetadataLogs } from '@services/indexer/metadataLogs'
import { PluginRepoLogs } from '@services/indexer/pluginRepoLogs'
import { PluginSetupProcessorLogs } from '@services/indexer/pluginSetupProcessorLogs'
import config from '@config'
import utils from '@helpers/utils'
import { EnumConnection } from '@types'
import logger from '@logger'

describe('Indexer: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  it('Should start, repeat & stop', async () => {
    expect(IndexerService.NEED_CONNECTIONS).to.be.deep.eq([EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN])

    const configBk = config.SERVICES.SYNC_DATA.DAO_INTERVAL
    config.SERVICES.SYNC_DATA.DAO_INTERVAL = 200

    const stubDaoLogs = sandbox.stub(DaoLogs, 'start').resolves()
    const stubMetadataLogs = sandbox.stub(MetadataLogs, 'start').resolves()
    const stubPluginRepoLogs = sandbox.stub(PluginRepoLogs, 'start').resolves()
    const stubPluginSetupProcessorLogs = sandbox.stub(PluginSetupProcessorLogs, 'start').resolves()

    await IndexerService.start()
    await utils.wait(100)

    expect(typeof IndexerService.repeaters.daos).to.eq('function')
    expect(typeof IndexerService.repeaters.metadata).to.eq('function')
    expect(typeof IndexerService.repeaters.pluginRepo).to.eq('function')
    expect(typeof IndexerService.repeaters.pluginSetupProcessor).to.eq('function')

    await utils.wait(200)

    expect(stubDaoLogs.calledTwice).to.be.true
    expect(stubMetadataLogs.calledTwice).to.be.true
    expect(stubPluginRepoLogs.calledTwice).to.be.true
    expect(stubPluginSetupProcessorLogs.calledTwice).to.be.true

    await IndexerService.stop()
    await utils.wait(200)

    expect(IndexerService.repeaters.daos).not.to.exist
    expect(IndexerService.repeaters.metadata).not.to.exist
    expect(IndexerService.repeaters.pluginRepo).not.to.exist
    expect(IndexerService.repeaters.pluginSetupProcessor).not.to.exist

    expect(stubDaoLogs.calledTwice).to.be.true
    expect(stubMetadataLogs.calledTwice).to.be.true
    expect(stubPluginRepoLogs.calledTwice).to.be.true
    expect(stubPluginSetupProcessorLogs.calledTwice).to.be.true

    config.SERVICES.SYNC_DATA.DAO_INTERVAL = configBk
  })

  it('Should handle errors', async () => {
    const configBk = config.SERVICES.SYNC_DATA.DAO_INTERVAL
    config.SERVICES.SYNC_DATA.DAO_INTERVAL = 100

    const stubLogger = sandbox.stub(logger, 'error')
    const testError = new Error('Test fetchAll error')

    sandbox.stub(DaoLogs, 'start').rejects(testError)
    sandbox.stub(MetadataLogs, 'start').rejects(testError)
    sandbox.stub(PluginRepoLogs, 'start').rejects(testError)
    sandbox.stub(PluginSetupProcessorLogs, 'start').rejects(testError)

    await IndexerService.start()

    expect(stubLogger.callCount).to.eq(4)
    expect(stubLogger.getCall(0).calledWith('Indexer DaoLogs error' as any)).to.be.true
    expect(stubLogger.getCall(1).calledWith('Indexer MetadataLogs error' as any)).to.be.true
    expect(stubLogger.getCall(2).calledWith('Indexer PluginRepoLogs error' as any)).to.be.true
    expect(stubLogger.getCall(3).calledWith('Indexer PluginSetupProcessorLogs' as any)).to.be.true

    await IndexerService.stop()

    config.SERVICES.SYNC_DATA.DAO_INTERVAL = configBk
  })
})
