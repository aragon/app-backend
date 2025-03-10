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
import Logger from '@logger'
import ProxyContractHelper from '@helpers/proxyContract'
import Web3Helper from '@helpers/web3'
import PluginDetector from '@helpers/pluginDetector'
import { PluginSlug } from '@helpers/pluginSlug'
import DbTx from '@modules/dbTx'

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
    it('should preInstallPlugin SPP', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const spyFindExistingLog = sandbox.spy(Models.Plugin, 'findExistingLog')

      sandbox.stub(Models.PluginRepo, 'findSubdomain').resolves({ subdomain: 'token-voting' })
      const detectPluginTypeStub = sandbox.stub(PluginDetector, 'detectPluginType').resolves({
        type: IPluginInterfaceType.spp,
        proxy: true,
        implementationAddress: '0x00',
        hasTarget: true,
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

    it('should preInstallPlugin not SPP', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const spyFindExistingLog = sandbox.spy(Models.Plugin, 'findExistingLog')
      sandbox.stub(Models.PluginRepo, 'findSubdomain').resolves({ subdomain: 'token-voting' })
      const detectPluginTypeStub = sandbox.stub(PluginDetector, 'detectPluginType').resolves({
        type: IPluginInterfaceType.tokenVoting,
        proxy: true,
        implementationAddress: '0x00',
        hasTarget: false,
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

    it('should not update if dao does not exist', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')

      const pluginLog = { daoAddress: '0x00', network: NetworksEnum.ethereumMainnet }
      await PluginHandler.preInstallPlugin(pluginLog as any)

      expect(stubLogger.calledOnceWith('Create Plugin - dao not found' as any)).to.be.true
    })

    it('should skip if log already exists', async () => {
      sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      sandbox.stub(Models.Plugin, 'findExistingLog').resolves(true)
      const stubFindSubdomain = sandbox.stub(Models.PluginRepo, 'findSubdomain')

      const logPlugin = { daoAddress: '0x00', network: NetworksEnum.ethereumMainnet }
      await PluginHandler.preInstallPlugin(logPlugin as any)

      expect(stubFindSubdomain.notCalled).to.be.true
    })

    it('should throw error', async () => {
      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      sandbox.stub(Models.Plugin, 'findExistingLog').rejects(new Error('Error'))

      const logPlugin = { daoAddress: '0x00', network: NetworksEnum.ethereumMainnet }
      await PluginHandler.preInstallPlugin(logPlugin as any)

      expect(stubLogger.calledOnce).to.be.true
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
        hasTarget: false,
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
        hasTarget: false,
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
    it('should log an error when an exception occurs', async () => {
      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(PluginHandler, '_queryGetPlugin').resolves(null as any)
      sandbox.stub(DbTx, 'executeTxFn').rejects(new Error('Database transaction failed'))

      const pluginLog = await Models.LogPluginSetupProcessor.findOne({ pluginAddress: rawPlugin.address })

      await PluginHandler.installPlugin(pluginLog)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubLogger.calledWith('Error Install Plugin' as any)).to.be.true
    })

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

      const verboseStub = sandbox.stub(logger, 'verbose')

      const logPlugin = await Models.LogPluginSetupProcessor.findOne({ pluginAddress: rawPlugin.address })

      await PluginHandler.installPlugin(logPlugin)

      const createdPlugin = await Models.Plugin.findOne({
        address: ListLogPluginSetupProcessor[3].pluginAddress,
        status: IPluginStatus.installed,
      })
      expect(createdPlugin).to.exist
      expect(createdPlugin.status).to.eq(IPluginStatus.installed)
      expect(verboseStub.calledWith('Updated document - Installed plugin' as any)).to.be.true
    })
  })

  describe('updatePlugin', () => {
    it('should updatePlugin', async () => {
      rawPlugin.tokenAddress = '0x00'
      sandbox.stub(PluginDetector, 'detectPluginType').resolves({
        type: IPluginInterfaceType.tokenVoting,
        proxy: true,
        implementationAddress: '0x00',
        hasTarget: false,
      })
      sandbox.stub(logger, 'verbose')
      await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[2])
      const eventUpdateApplied = await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[3])
      await PluginHandler._createPlugin(rawPlugin as any)
      const spyCreatePlugin = sandbox.spy(PluginHandler, '_createPlugin')

      await PluginHandler.updatePlugin(eventUpdateApplied as any)

      expect(spyCreatePlugin.calledOnce).to.be.true

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
      expect(deprecatedPlugin.uninstalled.status).to.be.true
    })

    it('should not update a plugin if dao does not exist', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')
      await PluginHandler.updatePlugin(ListLogPluginSetupProcessor[1] as any)

      expect(stubLogger.calledOnce).to.be.true
    })

    it('should not update a plugin if plugin does not exist', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')
      const stubQueryGetPlugin = sandbox.stub(PluginHandler, '_queryGetPlugin').resolves(rawPlugin)
      const stubCreatePlugin = sandbox.stub(PluginHandler, '_createPlugin').resolves(undefined)
      const stubExecuteTxFn = sandbox.stub(DbTx, 'executeTxFn')

      const pluginLog = await Models.LogPluginSetupProcessor.findOne({ pluginAddress: rawPlugin.address })

      await PluginHandler.updatePlugin(pluginLog)

      expect(stubQueryGetPlugin.calledOnce).to.be.true
      expect(stubCreatePlugin.calledOnceWith(rawPlugin)).to.be.true
      expect(stubLogger.notCalled).to.be.true
      expect(stubExecuteTxFn.notCalled).to.be.true
    })

    it('should throw error', async () => {
      rawPlugin.tokenAddress = '0x00'
      sandbox.stub(PluginDetector, 'detectPluginType').resolves({
        type: IPluginInterfaceType.tokenVoting,
        proxy: true,
        implementationAddress: '0x00',
        hasTarget: false,
      })
      await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[2])
      const eventUpdateApplied = await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[3])
      sandbox.stub(logger, 'verbose')
      await PluginHandler._createPlugin(rawPlugin as any)
      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(PluginHandler, '_createPlugin').rejects(new Error('Error'))

      await PluginHandler.updatePlugin(eventUpdateApplied as any)

      expect(stubLogger.calledOnce).to.be.true
    })
  })

  describe('uninstallPlugin', () => {
    it('should uninstallPlugin', async () => {
      sandbox.stub(PluginDetector, 'detectPluginType').resolves({
        type: IPluginInterfaceType.tokenVoting,
        proxy: true,
        implementationAddress: '0x00',
        hasTarget: false,
      })
      sandbox.stub(logger, 'verbose')

      await PluginHandler._createPlugin(rawPlugin as any)
      await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[4])
      const eventUninstallApplied = await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[5])

      const spyDbOperations = sandbox.spy(DbOperations, 'updateDocument')

      await PluginHandler.uninstallPlugin(eventUninstallApplied as any)

      expect(spyDbOperations.calledOnce).to.be.true

      const createdPlugin = await Models.Plugin.findOne({
        address: ListLogPluginSetupProcessor[5].pluginAddress,
        status: IPluginStatus.uninstalled,
      })
      expect(createdPlugin).to.not.be.null
      expect(createdPlugin.uninstalled.status).to.be.true
    })

    it('should not uninstall a plugin if plugin not exist', async () => {
      const stubLogger = sandbox.stub(logger, 'warn')
      await PluginHandler.uninstallPlugin(ListLogPluginSetupProcessor[1] as any)

      expect(stubLogger.calledOnce).to.be.true
    })

    it('should skip is existingPlugin not found', async () => {
      sandbox.stub(PluginDetector, 'detectPluginType').resolves({
        type: IPluginInterfaceType.tokenVoting,
        proxy: true,
        implementationAddress: '0x00',
        hasTarget: false,
      })
      sandbox.stub(logger, 'verbose')

      await PluginHandler._createPlugin(rawPlugin as any)
      await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[4])
      const eventUninstallApplied = await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[5])

      sandbox.stub(Models.Plugin, 'findOne').resolves(null)
      const stubUpdate = sandbox.stub(DbOperations, 'updateDocument')

      await PluginHandler.uninstallPlugin(eventUninstallApplied as any)
      expect(stubUpdate.notCalled).to.be.true
    })

    it('should throw error', async () => {
      sandbox.stub(PluginDetector, 'detectPluginType').resolves({
        type: IPluginInterfaceType.tokenVoting,
        proxy: true,
        implementationAddress: '0x00',
        hasTarget: false,
      })
      sandbox.stub(logger, 'verbose')
      await PluginHandler._createPlugin(rawPlugin as any)
      await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[4])
      const eventUninstallApplied = await Models.LogPluginSetupProcessor.create(ListLogPluginSetupProcessor[5])

      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(PluginHandler, '_queryGetPlugin').rejects(new Error('Error'))
      await PluginHandler.uninstallPlugin(eventUninstallApplied as any)

      expect(stubLogger.calledOnce).to.be.true
    })
  })

  describe('uninstallPluginWithPermissionRevoke', () => {
    it('should not uninstall a plugin if it does not exist', async () => {
      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)
      const findOneSpy = sandbox.spy(Models.Plugin, 'findOne')
      await PluginHandler.uninstallPluginWithPermissionRevoke('0xPlugin', '0xdao', NetworksEnum.ethereumSepolia, {
        transactionHash: '0x0123',
      } as any)
      expect(getTransactionReceiptStub.calledOnce).to.be.false
      expect(findOneSpy.calledOnce).to.be.true
      expect(findOneSpy.args[0][0]).to.be.deep.eq({
        address: '0xPlugin',
        daoAddress: '0xdao',
        network: NetworksEnum.ethereumSepolia,
      })
    })

    it('should not uninstall if the plugin has target config and its not the dao', async () => {
      const plugin = {
        status: 'active',
        address: '0xpluginAddr',
        id: 'pluginId',
        network: NetworksEnum.ethereumSepolia,
        build: 5,
        daoAddress: '0xdao',
      }
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin)

      const pluginDetectorStub = sandbox.stub(PluginDetector, 'detectPluginType').resolves({
        type: IPluginInterfaceType.tokenVoting,
        proxy: true,
        implementationAddress: '0x00',
        hasTarget: true,
      })

      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()

      const targetConfigStub = sandbox.stub(Web3Helper, 'getTargetConfig').resolves('0xtarget')

      const getTransactionReceiptSpy = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves({
        logs: [],
      } as any)
      await PluginHandler.uninstallPluginWithPermissionRevoke('0xdao', '0xPlugin', NetworksEnum.ethereumSepolia, {
        transactionHash: '0x0123',
      } as any)
      expect(getTransactionReceiptSpy.called).to.be.true
      expect(targetConfigStub.calledOnce).to.be.true
      expect(targetConfigStub.args[0][0]).to.be.eq(NetworksEnum.ethereumSepolia)
      expect(targetConfigStub.args[0][1]).to.be.eq('0xpluginAddr')
      expect(updateDocumentStub.called).to.be.false
      expect(pluginDetectorStub.calledOnce).to.be.true
    })

    it('should not uninstall a plugin if it is already uninstalled', async () => {
      const plugin = { status: IPluginStatus.uninstalled }
      const findOneStub = sandbox.stub(Models.Plugin, 'findOne').resolves(plugin)
      sandbox.stub(PluginDetector, 'detectPluginType').resolves({
        type: IPluginInterfaceType.tokenVoting,
        proxy: true,
        implementationAddress: '0x00',
        hasTarget: true,
      })
      const getTransactionReceiptSpy = sandbox.spy(Web3Helper, 'getTransactionReceipt')
      await PluginHandler.uninstallPluginWithPermissionRevoke('0xdao', '0xPlugin', NetworksEnum.ethereumSepolia, {
        transactionHash: '0x0123',
      } as any)
      expect(findOneStub.calledOnce).to.be.true
      expect(getTransactionReceiptSpy.called).to.be.false
    })

    it('should not uninstall if UninstallationApplied logs are present', async () => {
      const plugin = { status: 'active', id: 'pluginId' }
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin)
      const txReceipt = { logs: ['log1', 'log2'] }
      sandbox.stub(PluginDetector, 'detectPluginType').resolves({
        type: IPluginInterfaceType.tokenVoting,
        proxy: true,
        implementationAddress: '0x00',
        hasTarget: false,
      })
      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(txReceipt as any)
      const findLogsStub = sandbox.stub(Web3Helper, 'findLogsByName').returns([
        {
          parsed: { name: 'UninstallationApplied', txLog: { pluginId: 'pluginId' } },
        } as any,
      ])
      await PluginHandler.uninstallPluginWithPermissionRevoke('0xdao', '0xPlugin', NetworksEnum.ethereumSepolia, {
        transactionHash: '0x0123',
        blockNumber: 12345,
      } as any)
      expect(findLogsStub.calledOnce).to.be.true
      expect(getTransactionReceiptStub.calledOnce).to.be.true
      const updateStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      expect(updateStub.called).to.be.false
    })

    it('should proceed to uninstall when no UninstallationApplied logs are found', async () => {
      const plugin = { status: 'active', id: 'pluginId' }
      sandbox.stub(Models.Plugin, 'findOne').resolves(plugin)
      const txReceipt = { logs: [] }
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(txReceipt as any)
      const findLogsStub = sandbox.stub(Web3Helper, 'findLogsByName').returns([])
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()
      sandbox.stub(PluginSlug, 'deleteSlug')

      sandbox.stub(PluginDetector, 'detectPluginType').resolves({
        type: IPluginInterfaceType.tokenVoting,
        proxy: true,
        implementationAddress: '0x00',
        hasTarget: false,
      })

      await PluginHandler.uninstallPluginWithPermissionRevoke('0xdao', '0xPlugin', NetworksEnum.ethereumSepolia, {
        transactionHash: '0x0123',
        blockNumber: 12345,
        daoAddress: '0xdao',
      } as any)

      expect(findLogsStub.calledOnce).to.be.true
      expect(updateDocumentStub.calledOnce).to.be.true

      const expectedUpdate = {
        status: IPluginStatus.uninstalled,
        uninstalled: {
          status: true,
          transactionHash: '0x0123',
          blockNumber: 12345,
          blockTimestamp: 1620000000,
        },
      }
      expect(updateDocumentStub.args[0][1]).to.deep.equal(expectedUpdate)
    })

    it('should throw error', async () => {
      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(null)
      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'findOne').rejects(new Error('Error'))

      await PluginHandler.uninstallPluginWithPermissionRevoke('0xPlugin', '0xdao', NetworksEnum.ethereumSepolia, {
        transactionHash: '0x0123',
      } as any)

      expect(getTransactionReceiptStub.notCalled).to.be.true
      expect(stubLogger.calledOnce).to.be.true
    })
  })
})
