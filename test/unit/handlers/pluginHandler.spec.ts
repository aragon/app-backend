import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { PluginHandler } from '@handlers/pluginHandler'
import { Models } from '@dbModels'
import { IEventLogPluginType, IPluginInterfaceType, IPluginRawStatus, IPluginStatus, NetworksEnum } from '@types'
import { ListLogPluginSetupProcessor } from '@test/mock/fakeLogPluginSetupProcessor'
import { ListLogPluginRepo } from '@test/mock/fakeLogPluginRepo'
import DbOperations from '@models/utils/dbOperations'
import logger from '@logger'
import ProxyContractHelper from '@helpers/proxyContract'
import Web3Helper from '@helpers/web3'
import PluginDetector from '@helpers/pluginDetector'
import LogPluginSetupProcessor from '@models/schema/logPluginSetupProcessor'
import type Plugin from '@models/schema/plugin'
import Logger from '@logger'

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

  describe('preInstallPlugin', () => {
    it('should not update if dao does not exist', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')

      const pluginLog = { daoAddress: '0x00', network: NetworksEnum.ethereumMainnet }
      await PluginHandler.preInstallPlugin(pluginLog as any)

      expect(stubLogger.calledOnceWith('Create Plugin - dao not found' as any)).to.be.true
    })

    it('preInstallPlugin not SPP', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const spyFindExistingLog = sandbox.spy(Models.Plugin, 'findExistingLog')
      const spyCreateDocument = sandbox.spy(DbOperations, 'createDocument')

      sandbox.stub(Models.PluginRepo, 'findSubdomain').resolves({ subdomain: 'token-voting' })
      const detectPluginTypeStub = sandbox.stub(PluginDetector, 'detectPluginType').resolves({
        type: IPluginInterfaceType.tokenVoting,
        proxy: true,
        implementationAddress: '0x00',
      })

      const logVersboseStub = sandbox.stub(logger, 'verbose')

      const logPlugin = await Models.LogPluginSetupProcessor.findOne({ pluginAddress: rawPlugin.address })
      await PluginHandler.preInstallPlugin(logPlugin)

      expect(detectPluginTypeStub.calledOnce).to.be.true
      expect(spyFindExistingLog.calledOnce).to.be.true
      expect(
        spyFindExistingLog.calledWith({
          network: ListLogPluginSetupProcessor[0].network,
          transactionHash: ListLogPluginSetupProcessor[1].transactionHash,
          address: ListLogPluginSetupProcessor[0].pluginAddress,
        }),
      ).to.be.true
      expect(spyCreateDocument.calledOnce).to.be.true
      expect(logVersboseStub.calledOnceWith('Created new document - New PreInstall Plugin' as any)).to.be.true

      const createdPlugin = await Models.Plugin.findOne({
        address: ListLogPluginSetupProcessor[1].pluginAddress,
        status: IPluginStatus.preInstall,
      })
      expect(createdPlugin).to.not.be.null
      expect(createdPlugin.isProcess).to.be.true
      expect(createdPlugin.isBody).to.be.true
      expect(createdPlugin.isSubPlugin).to.be.false
    })

    it('preInstallPlugin SPP', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const spyFindExistingLog = sandbox.spy(Models.Plugin, 'findExistingLog')
      const spyCreateDocument = sandbox.spy(DbOperations, 'createDocument')

      sandbox.stub(Models.PluginRepo, 'findSubdomain').resolves({ subdomain: 'token-voting' })
      const detectPluginTypeStub = sandbox.stub(PluginDetector, 'detectPluginType').resolves({
        type: IPluginInterfaceType.spp,
        proxy: true,
        implementationAddress: '0x00',
      })

      const logVersboseStub = sandbox.stub(logger, 'verbose')

      const logPlugin = await Models.LogPluginSetupProcessor.findOne({ pluginAddress: rawPlugin.address })
      await PluginHandler.preInstallPlugin(logPlugin)

      expect(detectPluginTypeStub.calledOnce).to.be.true
      expect(spyFindExistingLog.calledOnce).to.be.true
      expect(
        spyFindExistingLog.calledWith({
          network: ListLogPluginSetupProcessor[0].network,
          transactionHash: ListLogPluginSetupProcessor[1].transactionHash,
          address: ListLogPluginSetupProcessor[0].pluginAddress,
        }),
      ).to.be.true
      expect(spyCreateDocument.calledOnce).to.be.true
      expect(logVersboseStub.calledOnceWith('Created new document - New PreInstall Plugin' as any)).to.be.true

      const createdPlugin = await Models.Plugin.findOne({
        address: ListLogPluginSetupProcessor[1].pluginAddress,
        status: IPluginStatus.preInstall,
      })
      expect(createdPlugin).to.not.be.null
      expect(createdPlugin.isProcess).to.be.true
      expect(createdPlugin.isBody).to.be.false
      expect(createdPlugin.isSubPlugin).to.be.false
    })
  })

  describe('_createPlugin', () => {
    it('should not update a plugin if it does not exist', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')
      const findExistingLogStub = sandbox.stub(Models.Plugin, 'findExistingLog').resolves(true)
      await PluginHandler._createPlugin({
        ...ListLogPluginSetupProcessor[2],
        address: '0x00',
      } as any)
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(stubLogger.calledOnce).to.be.false
    })

    it('_createPlugin not SPP', async () => {
      const spyFindExistingLog = sandbox.spy(Models.Plugin, 'findExistingLog')
      const spyCreateDocument = sandbox.spy(DbOperations, 'createDocument')

      const detectPluginTypeStub = sandbox.stub(PluginDetector, 'detectPluginType').resolves({
        type: IPluginInterfaceType.tokenVoting,
        proxy: true,
        implementationAddress: '0x00',
      })

      const logVersboseStub = sandbox.stub(logger, 'verbose')

      await PluginHandler._createPlugin(rawPlugin as any)

      expect(detectPluginTypeStub.calledOnce).to.be.true
      expect(spyFindExistingLog.calledOnce).to.be.true
      expect(
        spyFindExistingLog.calledWith({
          network: ListLogPluginSetupProcessor[0].network,
          transactionHash: ListLogPluginSetupProcessor[1].transactionHash,
          address: ListLogPluginSetupProcessor[0].pluginAddress,
        }),
      ).to.be.true
      expect(spyCreateDocument.calledOnce).to.be.true
      expect(logVersboseStub.calledOnceWith('Created new document - New Create Plugin' as any)).to.be.true

      const createdPlugin = await Models.Plugin.findOne({
        address: ListLogPluginSetupProcessor[1].pluginAddress,
        status: IPluginStatus.installed,
      })
      expect(createdPlugin).to.not.be.null
      expect(createdPlugin.isProcess).to.be.true
      expect(createdPlugin.isBody).to.be.true
      expect(createdPlugin.isSubPlugin).to.be.false
    })

    it('_createPlugin SPP', async () => {
      const spyFindExistingLog = sandbox.spy(Models.Plugin, 'findExistingLog')
      const spyCreateDocument = sandbox.spy(DbOperations, 'createDocument')

      const detectPluginTypeStub = sandbox.stub(PluginDetector, 'detectPluginType').resolves({
        type: IPluginInterfaceType.spp,
        proxy: true,
        implementationAddress: '0x00',
      })

      const logVersboseStub = sandbox.stub(logger, 'verbose')

      await PluginHandler._createPlugin(rawPlugin as any)

      expect(detectPluginTypeStub.calledOnce).to.be.true
      expect(spyFindExistingLog.calledOnce).to.be.true
      expect(
        spyFindExistingLog.calledWith({
          network: ListLogPluginSetupProcessor[0].network,
          transactionHash: ListLogPluginSetupProcessor[1].transactionHash,
          address: ListLogPluginSetupProcessor[0].pluginAddress,
        }),
      ).to.be.true
      expect(spyCreateDocument.calledOnce).to.be.true
      expect(logVersboseStub.calledOnceWith('Created new document - New Create Plugin' as any)).to.be.true

      const createdPlugin = await Models.Plugin.findOne({
        address: ListLogPluginSetupProcessor[1].pluginAddress,
        status: IPluginStatus.installed,
      })
      expect(createdPlugin).to.not.be.null
      expect(createdPlugin.isProcess).to.be.true
      expect(createdPlugin.isBody).to.be.false
      expect(createdPlugin.isSubPlugin).to.be.false
    })
  })

  describe('installPlugin', () => {
    it('should not install a plugin if it does not exist', async () => {
      const stubLogger = sandbox.stub(logger, 'error')
      const logPlugin = await Models.LogPluginSetupProcessor.findOne({ pluginAddress: rawPlugin.address })
      await PluginHandler.installPlugin(logPlugin)

      expect(stubLogger.calledOnce).to.be.true
    })

    it('should not install a plugin if not pre-installed', async () => {
      const stubError = sandbox.stub(Logger, 'error')
      const spyDbOperations = sandbox.spy(DbOperations, 'updateDocument')

      const logPlugin = await Models.LogPluginSetupProcessor.findOne({ pluginAddress: rawPlugin.address })

      await PluginHandler.installPlugin(logPlugin)

      expect(spyDbOperations.notCalled).to.be.true
      expect(stubError.calledOnce).to.be.true
    })

    it('installPlugin', async () => {
      const spyDbOperations = sandbox.spy(DbOperations, 'updateDocument')

      await Models.Plugin.create({
        status: IPluginStatus.preInstall,
        network: rawPlugin.network,
        blockNumber: rawPlugin.blockNumber,
        transactionHash: rawPlugin.transactionHash,
        address: rawPlugin.address,
        daoAddress: rawPlugin.daoAddress,
        pluginSetupRepoAddress: rawPlugin.pluginSetupRepoAddress,
        sender: rawPlugin.sender,
        release: rawPlugin.release,
        build: rawPlugin.build,
        permissions: rawPlugin.permissions,
        subdomain: rawPlugin?.subdomain,
        interfaceType: IPluginInterfaceType.tokenVoting,
      })

      const logPlugin = await Models.LogPluginSetupProcessor.findOne({ pluginAddress: rawPlugin.address })

      await PluginHandler.installPlugin(logPlugin)

      expect(spyDbOperations.calledOnce).to.be.true

      const createdPlugin = await Models.Plugin.findOne({
        address: ListLogPluginSetupProcessor[3].pluginAddress,
        status: IPluginStatus.installed,
      })
      expect(createdPlugin).to.not.be.null
      expect(createdPlugin.status).to.eq(IPluginStatus.installed)
    })
  })

  describe('updatePlugin', () => {
    it('should not update a plugin if it does not exist', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')
      await PluginHandler.updatePlugin(ListLogPluginSetupProcessor[1] as any)

      expect(stubLogger.calledOnce).to.be.true
    })

    it('updatePlugin', async () => {
      rawPlugin.tokenAddress = '0x00'
      sandbox.stub(PluginDetector, 'detectPluginType').resolves({
        type: IPluginInterfaceType.tokenVoting,
        proxy: true,
        implementationAddress: '0x00',
      })
      const eventUpdatePrepared = await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[2])
      const eventUpdateApplied = await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[3])
      await PluginHandler._createPlugin(rawPlugin as any)
      const spyCreatePlugin = sandbox.spy(PluginHandler, '_createPlugin')
      const spyDbOperations = sandbox.spy(DbOperations, 'updateDocument')

      await PluginHandler.updatePlugin(eventUpdateApplied as any)

      expect(spyCreatePlugin.calledOnce).to.be.true
      expect(spyDbOperations.calledTwice).to.be.true

      const createdPlugin = await Models.Plugin.findOne({
        address: ListLogPluginSetupProcessor[3].pluginAddress,
        status: IPluginStatus.installed,
      })
      expect(createdPlugin).to.not.be.null
      expect(createdPlugin.tokenAddress).to.eq(rawPlugin.tokenAddress)

      const deprecatedPlugin = await Models.Plugin.findOne({
        address: rawPlugin.address,
        status: IPluginStatus.deprecated,
      })
      expect(deprecatedPlugin).to.not.be.null
      expect(deprecatedPlugin.tokenAddress).to.eq(rawPlugin.tokenAddress)
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
