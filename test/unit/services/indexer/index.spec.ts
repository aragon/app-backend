import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import IndexerService from '@services/indexer/index'
import { LogDao } from '@services/indexer/logDao'
import { LogDaoRegistry } from '@services/indexer/logDaoRegistry'
import { LogPluginRepoRegistry } from '@services/indexer/logPluginRepoRegistry'
import { LogPluginSetupProcessor } from '@services/indexer/logPluginSetupProcessor'
import { LogProposal } from '@services/indexer/logProposal'
import config from '@config'
import utils from '@helpers/utils'
import { EnumConnection } from '@types'
import logger from '@logger'
import { LogPluginSetting } from '@services/indexer/logPluginSetting'
import { LogMember } from '@services/indexer/logMember'

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

    const stubDaoLogs = sandbox.stub(LogDao, 'start').resolves()
    const stubMetadataLogs = sandbox.stub(LogDaoRegistry, 'start').resolves()
    const stubPluginRepoLogs = sandbox.stub(LogPluginRepoRegistry, 'start').resolves()
    const stubPluginSetupProcessorLogs = sandbox.stub(LogPluginSetupProcessor, 'start').resolves()
    const stubProposalLogs = sandbox.stub(LogProposal, 'start').resolves()
    const stubPluginSettingLogs = sandbox.stub(LogPluginSetting, 'start').resolves()
    const stubDaoMemberLogs = sandbox.stub(LogMember, 'start').resolves()

    await IndexerService.start()
    await utils.wait(100)

    expect(typeof IndexerService.repeaters.dao).to.eq('function')
    expect(typeof IndexerService.repeaters.daoRegistry).to.eq('function')
    expect(typeof IndexerService.repeaters.pluginRepoRegistry).to.eq('function')
    expect(typeof IndexerService.repeaters.pluginSetupProcessor).to.eq('function')
    expect(typeof IndexerService.repeaters.proposal).to.eq('function')
    expect(typeof IndexerService.repeaters.pluginSetting).to.eq('function')
    expect(typeof IndexerService.repeaters.member).to.eq('function')

    await utils.wait(200)

    expect(stubDaoLogs.calledTwice).to.be.true
    expect(stubMetadataLogs.calledTwice).to.be.true
    expect(stubPluginRepoLogs.calledTwice).to.be.true
    expect(stubPluginSetupProcessorLogs.calledTwice).to.be.true
    expect(stubProposalLogs.calledTwice).to.be.true
    expect(stubPluginSettingLogs.calledTwice).to.be.true
    expect(stubDaoMemberLogs.calledTwice).to.be.true

    await IndexerService.stop()
    await utils.wait(200)

    expect(IndexerService.repeaters.dao).not.to.exist
    expect(IndexerService.repeaters.daoRegistry).not.to.exist
    expect(IndexerService.repeaters.pluginRepoRegistry).not.to.exist
    expect(IndexerService.repeaters.pluginSetupProcessor).not.to.exist
    expect(IndexerService.repeaters.proposal).not.to.exist
    expect(IndexerService.repeaters.pluginSetting).not.to.exist
    expect(IndexerService.repeaters.member).not.to.exist

    expect(stubDaoLogs.calledTwice).to.be.true
    expect(stubMetadataLogs.calledTwice).to.be.true
    expect(stubPluginRepoLogs.calledTwice).to.be.true
    expect(stubPluginSetupProcessorLogs.calledTwice).to.be.true
    expect(stubProposalLogs.calledTwice).to.be.true
    expect(stubPluginSettingLogs.calledTwice).to.be.true
    expect(stubDaoMemberLogs.calledTwice).to.be.true

    config.SERVICES.SYNC_DATA.DAO_INTERVAL = configBk
  })

  it('Should handle errors', async () => {
    const configBk = config.SERVICES.SYNC_DATA.DAO_INTERVAL
    config.SERVICES.SYNC_DATA.DAO_INTERVAL = 100

    const stubLogger = sandbox.stub(logger, 'error')
    const stubLoggerInfo = sandbox.stub(logger, 'info')
    const testError = new Error('Test fetchAll error')

    sandbox.stub(LogDao, 'start').rejects(testError)
    sandbox.stub(LogDaoRegistry, 'start').rejects(testError)
    sandbox.stub(LogPluginRepoRegistry, 'start').rejects(testError)
    sandbox.stub(LogPluginSetupProcessor, 'start').rejects(testError)
    sandbox.stub(LogProposal, 'start').rejects(testError)
    sandbox.stub(LogPluginSetting, 'start').rejects(testError)
    sandbox.stub(LogMember, 'start').rejects(testError)

    await IndexerService.start()

    expect(stubLogger.callCount).to.eq(7)
    expect(stubLogger.getCall(0).calledWith('Indexer DaoRegistry error' as any)).to.be.true
    expect(stubLogger.getCall(1).calledWith('Indexer Dao error' as any)).to.be.true
    expect(stubLogger.getCall(2).calledWith('Indexer PluginRepoRegistry error' as any)).to.be.true
    expect(stubLogger.getCall(3).calledWith('Indexer PluginSetupProcessor error' as any)).to.be.true
    expect(stubLogger.getCall(4).calledWith('Indexer member error' as any)).to.be.true
    expect(stubLogger.getCall(5).calledWith('Indexer LogProposal error' as any)).to.be.true
    expect(stubLogger.getCall(6).calledWith('Indexer LogPluginSetting error' as any)).to.be.true

    await IndexerService.stop()

    config.SERVICES.SYNC_DATA.DAO_INTERVAL = configBk
    expect(stubLoggerInfo.calledWith('IndexerService service start' as any)).to.be.true
    expect(stubLoggerInfo.calledWith('IndexerService service stopped' as any)).to.be.true
  })
})
