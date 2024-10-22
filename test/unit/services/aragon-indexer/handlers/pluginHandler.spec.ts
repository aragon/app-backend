import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { PluginHandler } from '@indexer/handlers/pluginHandler'
import { Models } from '@dbModels'
import { IEventLogPluginType, IPluginRawStatus, IPluginStatus } from '@types'
import { ListLogPluginSetupProcessor } from '@test/mock/fakeLogPluginSetupProcessor'
import { ListLogPluginRepo } from '@test/mock/fakeLogPluginRepo'
import DbOperations from '@models/utils/dbOperations'
import logger from '@logger'
import ProxyContractHelper from '@helpers/proxyContract'
import Web3Helper from '@helpers/web3'

describe('Indexer:Plugin', () => {
  let sandbox: SinonSandbox
  let rawPlugin: any
  let eventPluginRepo: any
  let eventInstallationPrepared: any
  let eventInstallationApplied: any

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    sandbox.stub(ProxyContractHelper, 'getImplementationAddress').resolves('0x17366cae2b9c6c3055e9e3c78936a69006be5404')
    sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1620000000)

    eventPluginRepo = await Models.PluginRepo.create(ListLogPluginRepo[0])
    eventInstallationPrepared = await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[0])
    eventInstallationApplied = await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[1])

    rawPlugin = await PluginHandler._queryGetPlugin({
      daoAddress: eventInstallationPrepared.daoAddress,
      pluginAddress: eventInstallationPrepared.pluginAddress,
      network: eventInstallationPrepared.network,
      ...{ events: [IEventLogPluginType.InstallationPrepared, IEventLogPluginType.InstallationApplied] },
    })
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('_queryGetPlugin', async () => {
    expect(rawPlugin).to.be.not.null
    expect(rawPlugin?.action).to.equal(IPluginRawStatus.install)
    expect(rawPlugin?.transactionHash).to.equal(eventInstallationApplied.transactionHash)
    expect(rawPlugin?.blockNumber).to.equal(eventInstallationApplied.blockNumber)
    expect(rawPlugin?.network).to.equal(eventInstallationApplied.network)
    expect(rawPlugin?.address).to.equal(eventInstallationApplied.pluginAddress)
    expect(rawPlugin?.daoAddress).to.equal(eventInstallationApplied.daoAddress)
    expect(rawPlugin?.preparedSetupId).to.equal(eventInstallationApplied.preparedSetupId)
    expect(rawPlugin?.appliedSetupId).to.equal(eventInstallationApplied.appliedSetupId)
    expect(rawPlugin?.pluginSetupRepoAddress).to.equal(eventInstallationPrepared.pluginSetupRepo)
    expect(rawPlugin?.release).to.equal(eventInstallationPrepared.release)
    expect(rawPlugin?.build).to.equal(eventInstallationPrepared.build)
    expect(rawPlugin?.subdomain).to.equal(eventPluginRepo.subdomain)
    expect(rawPlugin?.sender).to.equal(eventInstallationPrepared.sender)
  })

  describe('_createPlugin', () => {
    it('should not update a plugin if it does not exist', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')
      await PluginHandler._createPlugin(ListLogPluginSetupProcessor[2] as any)

      expect(stubLogger.calledOnce).to.be.true
    })

    it('_createPlugin', async () => {
      const spyFindExistingLog = sandbox.spy(Models.Plugin, 'findExistingLog')
      const spyCreateDocument = sandbox.spy(DbOperations, 'createDocument')

      await PluginHandler._createPlugin(rawPlugin as any)

      expect(spyFindExistingLog.calledOnce).to.be.true
      expect(
        spyFindExistingLog.calledWith({
          network: ListLogPluginSetupProcessor[0].network,
          transactionHash: ListLogPluginSetupProcessor[1].transactionHash,
          address: ListLogPluginSetupProcessor[0].pluginAddress,
        }),
      ).to.be.true
      expect(spyCreateDocument.calledOnce).to.be.true

      const createdPlugin = await Models.Plugin.findOne({
        address: ListLogPluginSetupProcessor[1].pluginAddress,
        status: IPluginStatus.installed,
      })
      expect(createdPlugin).to.not.be.null
    })
  })

  describe('updatePlugin', () => {
    it('should not update a plugin if it does not exist', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')
      await PluginHandler.updatePlugin(ListLogPluginSetupProcessor[1] as any)

      expect(stubLogger.calledOnce).to.be.true
    })

    it('updatePlugin', async () => {
      await PluginHandler._createPlugin(rawPlugin as any)
      const eventUpdatePrepared = await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[2])
      const eventUpdateApplied = await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[3])

      const spyCreatePlugin = sandbox.spy(PluginHandler, '_createPlugin')
      const spyDbOperations = sandbox.spy(DbOperations, 'updateDocument')

      await PluginHandler.updatePlugin(eventUpdateApplied as any)

      expect(spyCreatePlugin.calledOnce).to.be.true
      expect(spyDbOperations.calledOnce).to.be.true

      const createdPlugin = await Models.Plugin.findOne({
        address: ListLogPluginSetupProcessor[3].pluginAddress,
        status: IPluginStatus.installed,
      })
      expect(createdPlugin).to.not.be.null

      const deprecatedPlugin = await Models.Plugin.findOne({
        address: rawPlugin.address,
        status: IPluginStatus.deprecated,
      })
      expect(deprecatedPlugin).to.not.be.null
    })
  })

  describe('uninstallPlugin', () => {
    it('should not uninstall a plugin if it does not exist', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')
      await PluginHandler.uninstallPlugin(ListLogPluginSetupProcessor[1] as any)

      expect(stubLogger.calledOnce).to.be.true
    })

    it('uninstallPlugin', async () => {
      await PluginHandler._createPlugin(rawPlugin as any)
      const eventUninstallPrepared = await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[4])
      const eventUninstallApplied = await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[5])

      const spyDbOperations = sandbox.spy(DbOperations, 'updateDocument')

      await PluginHandler.uninstallPlugin(eventUninstallApplied as any)

      expect(spyDbOperations.calledOnce).to.be.true

      const createdPlugin = await Models.Plugin.findOne({
        address: ListLogPluginSetupProcessor[5].pluginAddress,
        status: IPluginStatus.uninstalled,
      })
      expect(createdPlugin).to.not.be.null
    })
  })
})
