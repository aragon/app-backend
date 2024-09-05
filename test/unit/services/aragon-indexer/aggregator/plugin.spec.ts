import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { PluginHandler } from '@indexer/handlers/pluginHandler'
import { Models } from '@dbModels'
import { IEventLogPluginType, IPluginRawStatus } from '@types'
import { ListLogPluginSetupProcessor } from '@test/mock/fakeLogPluginSetupProcessor'
import { ListLogPluginRepo } from '@test/mock/fakeLogPluginRepo'

describe('Indexer:Aggregator:Plugin', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('should query plugin from logPluginSetupProcessor', async () => {
    const eventPluginRepo = await Models.PluginRepo.create(ListLogPluginRepo[0])
    const eventInstallationPrepared = await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[0])
    const eventInstallationApplied = await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[1])

    const plugin = await PluginHandler._queryGetPlugin({
      daoAddress: eventInstallationPrepared.daoAddress,
      pluginAddress: eventInstallationPrepared.pluginAddress,
      network: eventInstallationPrepared.network,
      ...{ events: [IEventLogPluginType.InstallationPrepared, IEventLogPluginType.InstallationApplied] },
    })

    expect(plugin).to.be.not.null
    expect(plugin?.action).to.equal(IPluginRawStatus.install)
    expect(plugin?.transactionHash).to.equal(eventInstallationApplied.transactionHash)
    expect(plugin?.blockNumber).to.equal(eventInstallationApplied.blockNumber)
    expect(plugin?.network).to.equal(eventInstallationApplied.network)
    expect(plugin?.address).to.equal(eventInstallationApplied.pluginAddress)
    expect(plugin?.daoAddress).to.equal(eventInstallationApplied.daoAddress)
    expect(plugin?.preparedSetupId).to.equal(eventInstallationApplied.preparedSetupId)
    expect(plugin?.appliedSetupId).to.equal(eventInstallationApplied.appliedSetupId)
    expect(plugin?.pluginSetupRepoAddress).to.equal(eventInstallationPrepared.pluginSetupRepo)
    expect(plugin?.release).to.equal(eventInstallationPrepared.release)
    expect(plugin?.build).to.equal(eventInstallationPrepared.build)
    expect(plugin?.subdomain).to.equal(eventPluginRepo.subdomain)
    expect(plugin?.sender).to.equal(eventInstallationPrepared.sender)
  })
})
