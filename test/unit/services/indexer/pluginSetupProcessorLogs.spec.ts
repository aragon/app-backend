import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { PluginSetupProcessorLogs } from '@services/indexer/pluginSetupProcessorLogs'
import { PluginLogsInstallationPrepared } from '@services/indexer/pluginSetupProcessorLogs/installationPrepared'
import { PluginLogsInstallationApplied } from '@services/indexer/pluginSetupProcessorLogs/installationApplied'
import { PluginLogsUninstallationPrepared } from '@services/indexer/pluginSetupProcessorLogs/uninstallationPrepared'
import { PluginLogsUninstallationApplied } from '@services/indexer/pluginSetupProcessorLogs/uninstallationApplied'
import { PluginLogsUpdatePrepared } from '@services/indexer/pluginSetupProcessorLogs/updatePrepared'
import { PluginLogsUpdateApplied } from '@services/indexer/pluginSetupProcessorLogs/updateApplied'

describe('Indexer: PluginSetupProcessorLogs', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('start', async () => {
    const stubPluginLogsInstallationPrepared = sandbox.stub(PluginLogsInstallationPrepared, 'start').resolves()
    const stubPluginLogsInstallationApplied = sandbox.stub(PluginLogsInstallationApplied, 'start').resolves()
    const stubPluginLogsUninstallationPrepared = sandbox.stub(PluginLogsUninstallationPrepared, 'start').resolves()
    const stubPluginLogsUninstallationApplied = sandbox.stub(PluginLogsUninstallationApplied, 'start').resolves()
    const stubPluginLogsUpdatePrepared = sandbox.stub(PluginLogsUpdatePrepared, 'start').resolves()
    const stubPluginLogsUpdateApplied = sandbox.stub(PluginLogsUpdateApplied, 'start').resolves()

    await PluginSetupProcessorLogs.start()

    expect(stubPluginLogsInstallationPrepared.calledOnce).to.be.true
    expect(stubPluginLogsInstallationApplied.calledOnce).to.be.true
    expect(stubPluginLogsUninstallationPrepared.calledOnce).to.be.true
    expect(stubPluginLogsUninstallationApplied.calledOnce).to.be.true
    expect(stubPluginLogsUpdatePrepared.calledOnce).to.be.true
    expect(stubPluginLogsUpdateApplied.calledOnce).to.be.true
  })
})
