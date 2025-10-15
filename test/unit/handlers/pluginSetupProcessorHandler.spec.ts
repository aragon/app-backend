import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { IEventLogPluginType, ILogInfo, IPluginInterfaceType, IPluginStatus, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { PluginSetupProcessorHandler } from '@handlers/pluginSetupProcessorHandler'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import { PluginHandler } from '@handlers/pluginHandler'
import { PluginSettingHandler } from '@handlers/pluginSettingHandler'
import { LogAdmin } from '@plugins/logAdmin'
import { LogSpp } from '@plugins/logSPP'
import RabbitMQHelper from '@helpers/rabbitMQ'
import { ProxyToken } from '@modules/proxyToken'
import { IPluginActionType } from '@types'
import DbOperations from '@models/utils/dbOperations'
import GaugeHelper from '@helpers/gauge'
import { PluginList } from '@test/mock/fakePlugins'
import { Interface } from 'ethers'
import { StagedProposalProcessor } from '@artifacts/stagedProposalProcessor'
import { MetadataHandler } from '@handlers/metadataHandler'
import Web3Utils from '@helpers/web3Utils'
import VotingEscrowDetector from '@helpers/votingEscrowDetector'
import GovernanceVeHelper from '@helpers/governanceVe'
import LockToVoteHelper from '@helpers/lockToVoteHelper'

describe('Indexer: PluginSetupProcessorHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('aggregateLog', () => {
    it('should aggregateLog', async () => {
      const logDb = {
        transactionHash: '0x123',
        event: IEventLogPluginType.InstallationApplied,
      }

      const preInstallSpy = sandbox.stub(PluginHandler, 'preInstallPlugin')
      const installPlugin = sandbox.stub(PluginHandler, 'installPlugin')
      const updatePluginSpy = sandbox.stub(PluginHandler, 'updatePlugin')
      const uninstallPluginSpy = sandbox.stub(PluginHandler, 'uninstallPlugin')

      await PluginSetupProcessorHandler.pluginHandler(IPluginActionType.preInstall, logDb as any)
      expect(preInstallSpy.calledOnce).to.be.true

      await PluginSetupProcessorHandler.pluginHandler(IPluginActionType.installed, logDb as any)
      expect(installPlugin.calledOnce).to.be.true

      await PluginSetupProcessorHandler.pluginHandler(IPluginActionType.updated, logDb as any)
      expect(updatePluginSpy.calledOnce).to.be.true

      await PluginSetupProcessorHandler.pluginHandler(IPluginActionType.uninstalled, logDb as any)
      expect(uninstallPluginSpy.calledOnce).to.be.true
    })

    it('should throw error', async () => {
      const logDb = {
        transactionHash: '0x123',
        event: IEventLogPluginType.InstallationApplied,
      }
      const stubLogger = sandbox.stub(logger, 'error')

      await PluginSetupProcessorHandler.pluginHandler('invalid' as any, logDb as any)
      expect(stubLogger.calledOnce).to.be.true
    })
  })

  describe('installationApplied', () => {
    it('should return when dao not found', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
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
      const stubLogger = sandbox.stub(logger, 'warn')
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(false)
      await PluginSetupProcessorHandler.installationApplied(fakeEvent as any, logInfo)
      expect(stubLogger.calledOnce).to.be.true
      expect(stubFindDao.calledOnce).to.be.true
      expect(stubLogger.calledWith('Dao not found' as any)).to.be.true
    })

    it('should return when existingLog', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
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
      const stubLogger = sandbox.stub(logger, 'warn')
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const stubFindExistingLog = sandbox.stub(Models.LogPluginSetupProcessor, 'findExistingLog').resolves(true)
      await PluginSetupProcessorHandler.installationApplied(fakeEvent as any, logInfo)
      expect(stubLogger.calledOnce).to.be.false
      expect(stubFindDao.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
    })

    it('should create new log installationApplied', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 2,
        logIndex: 2,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
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
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubGetTransactionReceipt = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(true as any)
      const stuHandleFromReceipt = sandbox
        .stub(PluginSettingHandler, 'handlePluginSettingByType')
        .resolves(undefined as any)
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const stubFindExistingLog = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')
      const PluginSetupProcessorHandlerAggLogStub = sandbox.stub(PluginSetupProcessorHandler, 'pluginHandler')
      const findByAddressStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.admin,
      })

      sandbox.stub(LogAdmin, 'start')
      const isSupportedStub = sandbox.stub(PluginSettingHandler, 'isSupported')

      const rabbiMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage')

      await PluginSetupProcessorHandler.installationApplied(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Created new document - New InstallationApplied' as any)).to.be.true
      expect(stubFindDao.calledOnceWith(fakeEvent.args.dao, logInfo.network)).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(stubFindExistingLog.args[0][0].network).to.eq(NetworksEnum.ethereumMainnet)
      expect(stubFindExistingLog.args[0][0].event).to.eq(IEventLogPluginType.InstallationApplied)
      expect(PluginSetupProcessorHandlerAggLogStub.calledOnce).to.be.true
      expect(PluginSetupProcessorHandlerAggLogStub.args[0][0]).to.eq(IPluginActionType.installed)
      expect(stubGetTransactionReceipt.calledOnceWith(logInfo.transactionHash, logInfo.network)).to.be.true
      expect(stuHandleFromReceipt.calledOnce).to.be.true
      const args = stuHandleFromReceipt.args[0]
      expect(args[0].interfaceType).to.eq(IPluginInterfaceType.admin)
      expect(args[1]).to.be.true
      expect(args[2].network).to.eq(logInfo.network)

      const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        transactionIndex: logInfo.transactionIndex,
        logIndex: logInfo.logIndex,
        event: IEventLogPluginType.InstallationApplied,
      })

      expect(existingLog.transactionHash).to.eq(logInfo.transactionHash)
      expect(existingLog.transactionIndex).to.eq(logInfo.transactionIndex)
      expect(existingLog.logIndex).to.eq(logInfo.logIndex)
      expect(existingLog.blockNumber).to.eq(logInfo.blockNumber)
      expect(existingLog.network).to.eq(logInfo.network)
      expect(existingLog.event).to.eq(IEventLogPluginType.InstallationApplied)
      expect(existingLog.daoAddress).to.eq(fakeEvent.args.dao)
      expect(existingLog.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(existingLog.appliedSetupId).to.eq(fakeEvent.args.appliedSetupId)
      expect(existingLog.pluginAddress).to.eq(fakeEvent.args.plugin)
      expect(isSupportedStub.calledOnce).to.be.true
      expect(findByAddressStub.calledOnce).to.be.true
      expect(rabbiMqStub.calledOnce).to.be.true
    })

    it('should create new log installationApplied when spp plugin', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 2,
        logIndex: 2,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
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
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const stubFindExistingLog = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')
      const PluginSetupProcessorHandlerAggLogStub = sandbox.stub(PluginSetupProcessorHandler, 'pluginHandler')
      const findByAddressStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.spp,
      })

      const fakePlugin = {}
      const stuHandleFromReceipt = sandbox
        .stub(PluginSettingHandler, 'handlePluginSettingByType')
        .resolves(fakePlugin as any)
      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(true as any)

      const rabbiMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage')

      await PluginSetupProcessorHandler.installationApplied(fakeEvent as any, logInfo, true)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubFindDao.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(PluginSetupProcessorHandlerAggLogStub.calledOnce).to.be.true
      expect(getTransactionReceiptStub.calledOnceWith(logInfo.transactionHash, logInfo.network)).to.be.true
      expect(stuHandleFromReceipt.calledOnce).to.be.true
      const args = stuHandleFromReceipt.args[0]
      expect(args[0].interfaceType).to.eq(IPluginInterfaceType.spp)
      expect(args[1]).to.be.true
      expect(args[2].network).to.eq(logInfo.network)
      const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        transactionIndex: logInfo.transactionIndex,
        logIndex: logInfo.logIndex,
        event: IEventLogPluginType.InstallationApplied,
      })

      expect(existingLog.transactionHash).to.eq(logInfo.transactionHash)
      expect(existingLog.transactionIndex).to.eq(logInfo.transactionIndex)
      expect(existingLog.logIndex).to.eq(logInfo.logIndex)
      expect(existingLog.blockNumber).to.eq(logInfo.blockNumber)
      expect(existingLog.network).to.eq(logInfo.network)
      expect(existingLog.event).to.eq(IEventLogPluginType.InstallationApplied)
      expect(existingLog.daoAddress).to.eq(fakeEvent.args.dao)
      expect(existingLog.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(existingLog.appliedSetupId).to.eq(fakeEvent.args.appliedSetupId)
      expect(existingLog.pluginAddress).to.eq(fakeEvent.args.plugin)
      expect(findByAddressStub.calledOnce).to.be.true
      expect(rabbiMqStub.calledOnce).to.be.true
    })

    it('should create new log installationApplied when admin plugin', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 2,
        logIndex: 2,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
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
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const stubFindExistingLog = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')
      const PluginSetupProcessorHandlerAggLogStub = sandbox.stub(PluginSetupProcessorHandler, 'pluginHandler')
      const findByAddressStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.admin,
      })

      const isSupportedStub = sandbox.stub(PluginSettingHandler, 'isSupported')
      const handleFromReceiptStub = sandbox.stub(PluginSettingHandler, 'handlePluginSettingByType').resolves([] as any)
      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(true as any)

      const rabbiMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage')

      await PluginSetupProcessorHandler.installationApplied(fakeEvent as any, logInfo, true)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubFindDao.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(PluginSetupProcessorHandlerAggLogStub.calledOnce).to.be.true
      expect(getTransactionReceiptStub.calledOnceWith(logInfo.transactionHash, logInfo.network)).to.be.true
      expect(handleFromReceiptStub.calledOnce).to.be.true
      const args = handleFromReceiptStub.args[0]
      expect(args[0].interfaceType).to.eq(IPluginInterfaceType.admin)
      expect(args[1]).to.be.true
      expect(args[2].network).to.eq(logInfo.network)
      const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        transactionIndex: logInfo.transactionIndex,
        logIndex: logInfo.logIndex,
        event: IEventLogPluginType.InstallationApplied,
      })

      expect(existingLog.transactionHash).to.eq(logInfo.transactionHash)
      expect(existingLog.transactionIndex).to.eq(logInfo.transactionIndex)
      expect(existingLog.logIndex).to.eq(logInfo.logIndex)
      expect(existingLog.blockNumber).to.eq(logInfo.blockNumber)
      expect(existingLog.network).to.eq(logInfo.network)
      expect(existingLog.event).to.eq(IEventLogPluginType.InstallationApplied)
      expect(existingLog.daoAddress).to.eq(fakeEvent.args.dao)
      expect(existingLog.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(existingLog.appliedSetupId).to.eq(fakeEvent.args.appliedSetupId)
      expect(existingLog.pluginAddress).to.eq(fakeEvent.args.plugin)
      expect(isSupportedStub.calledOnce).to.be.true
      expect(findByAddressStub.calledOnce).to.be.true
      expect(rabbiMqStub.calledOnce).to.be.true
    })

    it('should create new log installationApplied when gauge plugin', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 2,
        logIndex: 2,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
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
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const stubFindExistingLog = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')
      const PluginSetupProcessorHandlerAggLogStub = sandbox.stub(PluginSetupProcessorHandler, 'pluginHandler')
      const findByAddressStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.gauge,
      })

      sandbox.stub(LogSpp, 'start')
      const isSupportedStub = sandbox.stub(PluginSettingHandler, 'isSupported')
      const handleFromReceiptStub = sandbox.stub(PluginSettingHandler, 'handlePluginSettingByType').resolves([] as any)
      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(true as any)

      const rabbiMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage')

      await PluginSetupProcessorHandler.installationApplied(fakeEvent as any, logInfo, true)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubFindDao.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(PluginSetupProcessorHandlerAggLogStub.calledOnce).to.be.true
      expect(getTransactionReceiptStub.calledOnceWith(logInfo.transactionHash, logInfo.network)).to.be.true
      expect(handleFromReceiptStub.calledOnce).to.be.true
      const args = handleFromReceiptStub.args[0]
      expect(args[0].interfaceType).to.eq(IPluginInterfaceType.gauge)
      expect(args[1]).to.be.true
      expect(args[2].network).to.eq(logInfo.network)

      const existingLog = await Models.LogPluginSetupProcessor.findExistingLog({
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        transactionIndex: logInfo.transactionIndex,
        logIndex: logInfo.logIndex,
        event: IEventLogPluginType.InstallationApplied,
      })

      expect(existingLog.transactionHash).to.eq(logInfo.transactionHash)
      expect(existingLog.transactionIndex).to.eq(logInfo.transactionIndex)
      expect(existingLog.logIndex).to.eq(logInfo.logIndex)
      expect(existingLog.blockNumber).to.eq(logInfo.blockNumber)
      expect(existingLog.network).to.eq(logInfo.network)
      expect(existingLog.event).to.eq(IEventLogPluginType.InstallationApplied)
      expect(existingLog.daoAddress).to.eq(fakeEvent.args.dao)
      expect(existingLog.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(existingLog.appliedSetupId).to.eq(fakeEvent.args.appliedSetupId)
      expect(existingLog.pluginAddress).to.eq(fakeEvent.args.plugin)
      expect(isSupportedStub.calledOnce).to.be.true
      expect(findByAddressStub.calledOnce).to.be.true
      expect(rabbiMqStub.calledOnce).to.be.true
    })

    it('should return when plugin not found', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 2,
        logIndex: 2,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
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
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const stubFindExistingLog = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')
      const PluginSetupProcessorHandlerAggLogStub = sandbox
        .stub(PluginSetupProcessorHandler, 'pluginHandler')
        .resolves()
      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(true as any)
      const findByAddressStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves(false)
      const stubLogger = sandbox.stub(logger, 'error')

      await PluginSetupProcessorHandler.installationApplied(fakeEvent as any, logInfo, true)

      expect(stubLogger.calledOnceWith('Plugin preInstall error' as any)).to.be.true
      expect(findByAddressStub.calledOnce).to.be.true
      expect(stubFindDao.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(PluginSetupProcessorHandlerAggLogStub.calledOnce).to.be.true
      expect(getTransactionReceiptStub.calledOnceWith(logInfo.transactionHash, logInfo.network)).to.be.true
    })
  })

  describe('installationPrepared', () => {
    it('should return when dao not found', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 1,
        logIndex: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          dao: '0x456',
          sender: '0xSender',
          preparedSetupId: '0x453',
          pluginSetupRepo: '0xRepo',
          plugin: '0x450',
          versionTag: { release: '1', build: '1' },
          preparedSetupData: {
            permissions: [],
          },
        },
      }
      const stubLogger = sandbox.stub(logger, 'warn')
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(false)

      await PluginSetupProcessorHandler.installationPrepared(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Dao not found' as any)).to.be.true
      expect(stubFindDao.calledOnce).to.be.true
    })

    it('should create new log installationPrepared with token', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 2,
        logIndex: 2,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          dao: '0x456',
          sender: '0xSender',
          preparedSetupId: '0x453',
          pluginSetupRepo: '0xRepo',
          plugin: '0x450',
          versionTag: { release: '1', build: '1' },
          preparedSetupData: {
            permissions: [],
          },
        },
      }
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const stubFindPlugin = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        address: '0x450',
      })
      const findTokenAndUpdateStub = sandbox.stub(PluginSetupProcessorHandler, 'findAndUpdateTokenAddress')
      const handleMetadataStub = sandbox.stub(PluginSetupProcessorHandler, 'updateMetadataOnPreInstall')
      const pluginHandlerStub = sandbox.stub(PluginSetupProcessorHandler, 'pluginHandler')
      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(true as any)
      const handleFromReceiptStub = sandbox
        .stub(PluginSettingHandler, 'handlePluginSettingByType')
        .resolves(undefined as any)

      await PluginSetupProcessorHandler.installationPrepared(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Created new document - New InstallationPrepared' as any)).to.be.true
      expect(stubFindDao.calledOnceWith(fakeEvent.args.dao, logInfo.network)).to.be.true
      expect(stubFindPlugin.calledOnceWith(fakeEvent.args.plugin, logInfo.network)).to.be.true
      expect(pluginHandlerStub.calledOnceWith(IPluginActionType.preInstall)).to.be.true
      expect(getTransactionReceiptStub.calledOnceWith(logInfo.transactionHash, logInfo.network)).to.be.true
      expect(handleFromReceiptStub.calledOnce).to.be.true
      expect(handleMetadataStub.calledOnce).to.be.true
      expect(
        findTokenAndUpdateStub.calledOnceWith({
          address: '0x450',
        }),
      ).to.be.true
    })

    it('should create new log installationPrepared with no token address', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 2,
        logIndex: 2,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          dao: '0x456',
          sender: '0xSender',
          preparedSetupId: '0x453',
          pluginSetupRepo: '0xRepo',
          plugin: '0x450',
          versionTag: { release: '1', build: '1' },
          preparedSetupData: {
            permissions: [],
          },
        },
      }
      const stubLogger = sandbox.stub(logger, 'verbose')
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const stubFindPlugin = sandbox.stub(Models.Plugin, 'findByAddress').resolves(true)
      const findTokenStub = sandbox.stub(PluginSetupProcessorHandler, 'findAndUpdateTokenAddress')
      const handleMetadataStub = sandbox.stub(PluginSetupProcessorHandler, 'updateMetadataOnPreInstall')
      const pluginHandlerStub = sandbox.stub(PluginSetupProcessorHandler, 'pluginHandler')
      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(true as any)
      const handleFromReceiptStub = sandbox
        .stub(PluginSettingHandler, 'handlePluginSettingByType')
        .resolves(undefined as any)

      await PluginSetupProcessorHandler.installationPrepared(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Created new document - New InstallationPrepared' as any)).to.be.true
      expect(stubFindDao.calledOnceWith(fakeEvent.args.dao, logInfo.network)).to.be.true
      expect(stubFindPlugin.calledOnceWith(fakeEvent.args.plugin, logInfo.network)).to.be.true
      expect(findTokenStub.calledOnce).to.be.true
      expect(pluginHandlerStub.calledOnceWith(IPluginActionType.preInstall)).to.be.true
      expect(getTransactionReceiptStub.calledOnceWith(logInfo.transactionHash, logInfo.network)).to.be.true
      expect(handleFromReceiptStub.calledOnce).to.be.true
      expect(handleMetadataStub.calledOnce).to.be.true
    })

    it('should return when plugin not found', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 2,
        logIndex: 2,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          dao: '0x456',
          sender: '0xSender',
          preparedSetupId: '0x453',
          pluginSetupRepo: '0xRepo',
          plugin: '0x450',
          versionTag: { release: '1', build: '1' },
          preparedSetupData: {
            permissions: [],
          },
        },
      }

      const stubPluginProcessor = sandbox.stub(PluginSetupProcessorHandler, 'pluginHandler').resolves()
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const stubFindPlugin = sandbox.stub(Models.Plugin, 'findByAddress').resolves(false)
      const stubLogger = sandbox.stub(logger, 'error')

      await PluginSetupProcessorHandler.installationPrepared(fakeEvent as any, logInfo)

      expect(stubPluginProcessor.calledOnce).to.be.true
      expect(stubFindDao.calledOnceWith(fakeEvent.args.dao, logInfo.network)).to.be.true
      expect(stubFindPlugin.calledOnceWith(fakeEvent.args.plugin, logInfo.network)).to.be.true
      expect(stubLogger.calledOnceWith('Plugin preInstall error' as any)).to.be.true
    })

    it('should throw error', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 2,
        logIndex: 2,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          dao: '0x456',
          sender: '0xSender',
          preparedSetupId: '0x453',
          pluginSetupRepo: '0xRepo',
          plugin: '0x450',
          versionTag: { release: '1', build: '1' },
          preparedSetupData: {
            permissions: [],
          },
        },
      }

      const stubPluginProcessor = sandbox.stub(PluginSetupProcessorHandler, 'pluginHandler').resolves()
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await PluginSetupProcessorHandler.installationPrepared(fakeEvent as any, logInfo)

      expect(stubPluginProcessor.notCalled).to.be.true
      expect(stubFindDao.calledOnceWith(fakeEvent.args.dao, logInfo.network)).to.be.true
      expect(stubLogger.calledOnceWith('Error in installationPrepared' as any)).to.be.true
    })
  })

  describe('updateMetadataOnPreInstall', () => {
    it('should updateMetadataOnPreInstall', async () => {
      const logDb = {
        address: '0xmetadataPlugin',
      } as any

      const txInfo = {
        address: '0xPluginProcessor',
        transactionHash: '0xtxHash',
      } as any

      const log = {
        address: '0xmetadataPlugin',
        data: '0xData',
        topics: [new Interface(StagedProposalProcessor.abi).getEvent('MetadataSet')?.topicHash!],
      }

      const txReceipt = {
        status: '0x1',
        logs: [log],
      } as any

      const metadataHandlerStub = sandbox.stub(MetadataHandler, 'metadataSet')
      const web3HelperStub = sandbox.stub(Web3Utils, 'parseLog').returns(log as any)
      const parseLogInfo = sandbox.stub(Web3Utils, 'parseInfoLog').returns({
        ...txInfo,
        address: '0xmetadataPlugin',
      })

      await PluginSetupProcessorHandler.updateMetadataOnPreInstall(logDb, txReceipt)

      expect(metadataHandlerStub.calledOnce).to.be.true
      expect(parseLogInfo.calledOnce).to.be.true
      expect(
        metadataHandlerStub.calledWith(log as any, {
          ...txInfo,
          address: '0xmetadataPlugin',
        }),
      ).to.be.true
      expect(web3HelperStub.calledOnce).to.be.true
    })

    it('should throw updateMetadataOnPreInstall', async () => {
      const logDb = {
        address: '0xPlugin',
      } as any

      const log = {
        address: '0xPlugin',
        data: '0xData',
        topics: [new Interface(StagedProposalProcessor.abi).getEvent('MetadataSet')?.topicHash!],
      }

      const txReceipt = {
        status: '0x1',
        logs: [log],
      } as any

      const metadataHandlerStub = sandbox.stub(MetadataHandler, 'metadataSet')
      const stubLogger = sandbox.stub(logger, 'error')
      const web3HelperStub = sandbox.stub(Web3Utils, 'parseLog').throws(new Error('Handler error'))

      await PluginSetupProcessorHandler.updateMetadataOnPreInstall(logDb, txReceipt)

      expect(metadataHandlerStub.notCalled).to.be.true
      expect(stubLogger.calledOnceWith('Error parsing metadata log' as any)).to.be.true
      expect(web3HelperStub.calledOnce).to.be.true
    })
  })

  describe('findAndUpdateTokenAddress', () => {
    it('should return when plugin does not carry token info', async () => {
      const plugin = await Models.Plugin.create({
        ...PluginList[0],
        tokenAddress: null,
        interfaceType: IPluginInterfaceType.admin,
      })

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 2,
        logIndex: 2,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }

      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(true as any)

      await PluginSetupProcessorHandler.findAndUpdateTokenAddress(plugin, logInfo)

      expect(saveAndGetTokenStub.notCalled).to.be.true
    })

    it('should handle when plugin is token voting', async () => {
      const plugin = await Models.Plugin.create({
        ...PluginList[0],
        tokenAddress: null,
        interfaceType: IPluginInterfaceType.tokenVoting,
      })

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 2,
        logIndex: 2,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }

      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(true as any)
      const getVotingTokenStub = sandbox.stub(Web3Helper, 'getVotingToken').resolves('0xToken')
      const getLockManagerStub = sandbox.stub(LockToVoteHelper, 'getLockManager').resolves('0xLockManager')
      const findVotingEscrowStub = sandbox.stub(PluginSetupProcessorHandler, 'findVotingEscrow').resolves(null)
      await PluginSetupProcessorHandler.findAndUpdateTokenAddress(plugin, logInfo)

      expect(proxyTokenStub.calledOnce).to.be.true
      const reloadedPlugin = await Models.Plugin.findOne({ address: plugin.address })
      expect(reloadedPlugin.tokenAddress).to.eq('0xToken')
      expect(reloadedPlugin.lockManagerAddress).to.eq('0xLockManager')
      expect(findVotingEscrowStub.calledOnce).to.be.true
      expect(getVotingTokenStub.calledOnce).to.be.true
      expect(getLockManagerStub.calledOnce).to.be.true
      expect(getVotingTokenStub.calledWith(plugin.address, logInfo.network)).to.be.true
      expect(getLockManagerStub.calledWith(logInfo.network, plugin.address)).to.be.true
      expect(proxyTokenStub.calledWith('0xToken', logInfo.network)).to.be.true
    })

    it('should handle when plugin is gauge', async () => {
      const plugin = await Models.Plugin.create({
        ...PluginList[0],
        tokenAddress: null,
        interfaceType: IPluginInterfaceType.gauge,
      })

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 2,
        logIndex: 2,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }

      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(true as any)
      const findVotingEscrowStub = sandbox.stub(PluginSetupProcessorHandler, 'findVotingEscrow').resolves(null)
      const getGaugeTokenStub = sandbox.stub(GaugeHelper, 'getTokenAddress').resolves('0xToken')
      const getLockManagerStub = sandbox.stub(LockToVoteHelper, 'getLockManager').resolves('0xGaugeLockManager')
      await PluginSetupProcessorHandler.findAndUpdateTokenAddress(plugin, logInfo)

      expect(proxyTokenStub.calledOnce).to.be.true
      const reloadedPlugin = await Models.Plugin.findOne({ address: plugin.address })
      expect(reloadedPlugin.tokenAddress).to.eq('0xToken')
      expect(reloadedPlugin.lockManagerAddress).to.eq('0xGaugeLockManager')
      expect(findVotingEscrowStub.calledOnce).to.be.true
      expect(getGaugeTokenStub.calledOnce).to.be.true
      expect(getLockManagerStub.calledOnce).to.be.true
      expect(getGaugeTokenStub.calledWith(plugin.address, logInfo.network)).to.be.true
      expect(getLockManagerStub.calledWith(logInfo.network, plugin.address)).to.be.true
      expect(proxyTokenStub.calledWith('0xToken', logInfo.network)).to.be.true
    })

    it('should handle when plugin is lockToVote', async () => {
      const plugin = await Models.Plugin.create({
        ...PluginList[0],
        tokenAddress: null,
        lockManagerAddress: null,
        interfaceType: IPluginInterfaceType.lockToVote,
      })

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 2,
        logIndex: 2,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }

      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(true as any)
      const getLockToVoteTokenStub = sandbox.stub(LockToVoteHelper, 'getVotingToken').resolves('0xLockToVoteToken')
      const getLockManagerStub = sandbox.stub(LockToVoteHelper, 'getLockManager').resolves('0xLockManager')
      const findVotingEscrowStub = sandbox.stub(PluginSetupProcessorHandler, 'findVotingEscrow').resolves(null)

      await PluginSetupProcessorHandler.findAndUpdateTokenAddress(plugin, logInfo)

      expect(proxyTokenStub.calledOnce).to.be.true
      const reloadedPlugin = await Models.Plugin.findOne({ address: plugin.address })
      expect(reloadedPlugin.tokenAddress).to.eq('0xLockToVoteToken')
      expect(reloadedPlugin.lockManagerAddress).to.eq('0xLockManager')
      expect(findVotingEscrowStub.calledOnce).to.be.true
      expect(getLockToVoteTokenStub.calledOnce).to.be.true
      expect(getLockManagerStub.calledOnce).to.be.true
      expect(getLockToVoteTokenStub.calledWith(logInfo.network, plugin.address)).to.be.true
      expect(getLockManagerStub.calledWith(logInfo.network, plugin.address)).to.be.true
      expect(proxyTokenStub.calledWith('0xLockToVoteToken', logInfo.network)).to.be.true
    })

    it('should handle when plugin is lockToVote with voting escrow', async () => {
      const plugin = await Models.Plugin.create({
        ...PluginList[0],
        tokenAddress: null,
        lockManagerAddress: null,
        votingEscrow: null,
        interfaceType: IPluginInterfaceType.lockToVote,
      })

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 2,
        logIndex: 2,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }

      const mockVotingEscrow = {
        curveAddress: '0xCurve',
        exitQueueAddress: '0xExitQueue',
        escrowAddress: '0xEscrow',
        clockAddress: '0xClock',
        nftLockAddress: '0xNftLock',
        underlying: '0xUnderlying',
      }

      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(true as any)
      const getLockToVoteTokenStub = sandbox.stub(LockToVoteHelper, 'getVotingToken').resolves('0xLockToVoteToken')
      const getLockManagerStub = sandbox.stub(LockToVoteHelper, 'getLockManager').resolves('0xLockManager')
      const findVotingEscrowStub = sandbox
        .stub(PluginSetupProcessorHandler, 'findVotingEscrow')
        .resolves(mockVotingEscrow)

      await PluginSetupProcessorHandler.findAndUpdateTokenAddress(plugin, logInfo)

      expect(proxyTokenStub.calledOnce).to.be.true
      const reloadedPlugin = await Models.Plugin.findOne({ address: plugin.address })
      expect(reloadedPlugin.tokenAddress).to.eq('0xLockToVoteToken')
      expect(reloadedPlugin.lockManagerAddress).to.eq('0xLockManager')
      expect(reloadedPlugin.votingEscrow).to.deep.include(mockVotingEscrow)
      expect(findVotingEscrowStub.calledOnce).to.be.true
      expect(getLockToVoteTokenStub.calledOnce).to.be.true
      expect(getLockManagerStub.calledOnce).to.be.true
      expect(getLockToVoteTokenStub.calledWith(logInfo.network, plugin.address)).to.be.true
      expect(getLockManagerStub.calledWith(logInfo.network, plugin.address)).to.be.true
      expect(proxyTokenStub.calledWith('0xLockToVoteToken', logInfo.network)).to.be.true
    })

    it('should handle when plugin is lockToVote but no token found', async () => {
      const plugin = await Models.Plugin.create({
        ...PluginList[0],
        tokenAddress: null,
        lockManagerAddress: null,
        interfaceType: IPluginInterfaceType.lockToVote,
      })

      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 2,
        logIndex: 2,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }

      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves(true as any)
      const getLockToVoteTokenStub = sandbox.stub(LockToVoteHelper, 'getVotingToken').resolves(null)
      const getLockManagerStub = sandbox.stub(LockToVoteHelper, 'getLockManager').resolves(null)
      const findVotingEscrowStub = sandbox.stub(PluginSetupProcessorHandler, 'findVotingEscrow')

      await PluginSetupProcessorHandler.findAndUpdateTokenAddress(plugin, logInfo)

      expect(proxyTokenStub.notCalled).to.be.true
      const reloadedPlugin = await Models.Plugin.findOne({ address: plugin.address })
      expect(reloadedPlugin.tokenAddress).to.be.null
      expect(reloadedPlugin.lockManagerAddress).to.be.null
      expect(findVotingEscrowStub.notCalled).to.be.true
      expect(getLockToVoteTokenStub.calledOnce).to.be.true
      expect(getLockManagerStub.notCalled).to.be.true
      expect(getLockToVoteTokenStub.calledWith(logInfo.network, plugin.address)).to.be.true
    })
  })

  describe('uninstallationApplied', () => {
    it('should uninstallationApplied', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 2,
        logIndex: 2,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          metadata: 'fake-metadata',
          dao: '0x456',
          preparedSetupId: '0x453',
          plugin: '0x450',
        },
      }

      const subPlugin = await Models.Plugin.create({
        id: 'test-plugin-1',
        address: '0xsubplugin-1',
        daoAddress: fakeEvent.args.dao,
        tokenAddress: '0xTokenAddress',
        network: logInfo.network,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: 'installed',
        transactionHash: '0xhash',
        blockNumber: 1000,
      })

      const plugin = await Models.Plugin.create({
        id: 'test-plugin',
        address: fakeEvent.args.plugin,
        daoAddress: fakeEvent.args.dao,
        tokenAddress: '0xTokenAddress',
        network: logInfo.network,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: 'uninstalled',
        transactionHash: '0xhash',
        blockNumber: 1000,
        subPlugins: [{ addresses: [subPlugin.address] }],
      })

      const loggerStub = sandbox.stub(logger, 'verbose')
      const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)

      const PluginSetupProcessorHandlerAggLogStub = sandbox.stub(PluginSetupProcessorHandler, 'pluginHandler')

      await PluginSetupProcessorHandler.uninstallationApplied(fakeEvent as any, logInfo)

      expect(stubFindDao.calledOnce).to.be.true
      expect(
        findTxSpy.calledWith({
          network: logInfo.network,
          transactionHash: logInfo.transactionHash,
          transactionIndex: logInfo.transactionIndex,
          logIndex: logInfo.logIndex,
          event: IEventLogPluginType.UninstallationApplied,
        }),
      ).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const logPluginDb = await Models.LogPluginSetupProcessor.findExistingLog({
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        transactionIndex: logInfo.transactionIndex,
        logIndex: logInfo.logIndex,
        event: IEventLogPluginType.UninstallationApplied,
      })
      expect(logPluginDb.transactionHash).to.eq(logInfo.transactionHash)
      expect(logPluginDb.blockNumber).to.eq(logInfo.blockNumber)
      expect(logPluginDb.network).to.eq(logInfo.network)
      expect(logPluginDb.event).to.eq(IEventLogPluginType.UninstallationApplied)
      expect(logPluginDb.daoAddress).to.eq(fakeEvent.args.dao)
      expect(logPluginDb.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(logPluginDb.pluginAddress).to.eq(fakeEvent.args.plugin)
      expect(PluginSetupProcessorHandlerAggLogStub.calledOnce).to.be.true
      expect(PluginSetupProcessorHandlerAggLogStub.calledWith(IPluginActionType.uninstalled)).to.be.true

      const updatedSubPlugin = await subPlugin.reload()
      expect(updatedSubPlugin.status).to.eq(IPluginStatus.abandoned)
    })

    it('dao not found error', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 2,
        logIndex: 2,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      const stubLogger = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Dao, 'findByAddress').resolves(false)

      await PluginSetupProcessorHandler.uninstallationApplied(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Dao not found' as any)).to.be.true
    })

    it('should skip if log already exists', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 2,
        logIndex: 2,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      const stubLogger = sandbox.stub(logger, 'warn')
      const stubLogPluginSetupProcessor = sandbox.stub(Models.LogPluginSetupProcessor, 'findExistingLog').resolves(true)
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)

      await PluginSetupProcessorHandler.uninstallationApplied(fakeEvent as any, logInfo)

      expect(stubFindDao.calledOnce).to.be.true
      expect(stubLogPluginSetupProcessor.calledOnce).to.be.true
      expect(stubLogger.notCalled).to.be.true
    })

    it('should NOT uninstall subplugin when it is used by multiple plugins', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 2,
        logIndex: 2,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          metadata: 'fake-metadata',
          dao: '0x456',
          preparedSetupId: '0x453',
          plugin: '0x450', // plugin1 address
        },
      }

      // Create the shared subplugin
      const subPlugin1 = await Models.Plugin.create({
        id: 'test-subplugin-1',
        address: '0xsubplugin-1',
        daoAddress: fakeEvent.args.dao,
        tokenAddress: '0xTokenAddress',
        network: logInfo.network,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: 'installed',
        transactionHash: '0xhash',
        blockNumber: 1000,
      })

      // Create plugin1 (the one being uninstalled)
      const plugin1 = await Models.Plugin.create({
        id: 'test-plugin-1',
        address: fakeEvent.args.plugin,
        daoAddress: fakeEvent.args.dao,
        tokenAddress: '0xTokenAddress',
        network: logInfo.network,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: 'uninstalled',
        transactionHash: '0xhash',
        blockNumber: 1000,
        subPlugins: [{ addresses: [subPlugin1.address], stageIndex: 0 }],
      })

      // Create plugin2 (still using the same subplugin)
      const plugin2 = await Models.Plugin.create({
        id: 'test-plugin-2',
        address: '0x451', // different address from plugin1
        daoAddress: fakeEvent.args.dao,
        tokenAddress: '0xTokenAddress',
        network: logInfo.network,
        interfaceType: IPluginInterfaceType.tokenVoting,
        status: 'installed', // still installed
        transactionHash: '0xhash2',
        blockNumber: 1001,
        subPlugins: [{ addresses: [subPlugin1.address], stageIndex: 0 }],
      })

      const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const PluginSetupProcessorHandlerAggLogStub = sandbox.stub(PluginSetupProcessorHandler, 'pluginHandler')

      await PluginSetupProcessorHandler.uninstallationApplied(fakeEvent as any, logInfo)

      expect(stubFindDao.calledOnce).to.be.true
      expect(
        findTxSpy.calledWith({
          network: logInfo.network,
          transactionHash: logInfo.transactionHash,
          transactionIndex: logInfo.transactionIndex,
          logIndex: logInfo.logIndex,
          event: IEventLogPluginType.UninstallationApplied,
        }),
      ).to.be.true

      const logPluginDb = await Models.LogPluginSetupProcessor.findExistingLog({
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        transactionIndex: logInfo.transactionIndex,
        logIndex: logInfo.logIndex,
        event: IEventLogPluginType.UninstallationApplied,
      })
      expect(logPluginDb.transactionHash).to.eq(logInfo.transactionHash)
      expect(logPluginDb.blockNumber).to.eq(logInfo.blockNumber)
      expect(logPluginDb.network).to.eq(logInfo.network)
      expect(logPluginDb.event).to.eq(IEventLogPluginType.UninstallationApplied)
      expect(logPluginDb.daoAddress).to.eq(fakeEvent.args.dao)
      expect(logPluginDb.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(logPluginDb.pluginAddress).to.eq(fakeEvent.args.plugin)
      expect(PluginSetupProcessorHandlerAggLogStub.calledOnce).to.be.true
      expect(PluginSetupProcessorHandlerAggLogStub.calledWith(IPluginActionType.uninstalled)).to.be.true

      // Verify subplugin1 is NOT marked as abandoned because it's still used by plugin2
      const updatedSubPlugin1 = await subPlugin1.reload()
      expect(updatedSubPlugin1.status).to.eq('installed') // Should remain installed

      // Verify plugin2 is still installed and untouched
      const updatedPlugin2 = await plugin2.reload()
      expect(updatedPlugin2.status).to.eq('installed')
    })
  })

  describe('uninstallationPrepared', () => {
    it('should uninstallationPrepared', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 2,
        logIndex: 2,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          preparedSetupData: {
            permissions: [
              {
                operation: 1,
                where: 'some-where',
                who: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
                condition: 'some-conditions',
                permissionId: 'xxx',
              },
            ],
          },
          dao: '0x456',
          sender: '0x450',
          preparedSetupId: '0x453',
          pluginSetupRepo: '0x452',
          plugin: '0x450',
          versionTag: {
            release: '1',
            build: '1',
          },
        },
      }

      const loggerStub = sandbox.stub(logger, 'verbose')
      const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)

      await PluginSetupProcessorHandler.uninstallationPrepared(fakeEvent as any, logInfo)

      expect(stubFindDao.calledOnce).to.be.true
      expect(
        findTxSpy.calledWith({
          network: logInfo.network,
          transactionHash: logInfo.transactionHash,
          transactionIndex: logInfo.transactionIndex,
          logIndex: logInfo.logIndex,
          event: IEventLogPluginType.UninstallationPrepared,
        }),
      ).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog({
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        transactionIndex: logInfo.transactionIndex,
        logIndex: logInfo.logIndex,
        event: IEventLogPluginType.UninstallationPrepared,
      })
      expect(daoMetadataDB.transactionHash).to.eq(logInfo.transactionHash)
      expect(daoMetadataDB.transactionIndex).to.eq(logInfo.transactionIndex)
      expect(daoMetadataDB.logIndex).to.eq(logInfo.logIndex)
      expect(daoMetadataDB.blockNumber).to.eq(logInfo.blockNumber)
      expect(daoMetadataDB.network).to.eq(logInfo.network)
      expect(daoMetadataDB.event).to.eq(IEventLogPluginType.UninstallationPrepared)
      expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
      expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(daoMetadataDB.pluginSetupRepo).to.eq(fakeEvent.args.pluginSetupRepo)
      expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.plugin)
      expect(daoMetadataDB.release).to.eq(fakeEvent.args.versionTag.release)
      expect(daoMetadataDB.build).to.eq(fakeEvent.args.versionTag.release)
    })

    it('dao not found error', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 2,
        logIndex: 2,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      const stubLogger = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Dao, 'findByAddress').resolves(false)

      await PluginSetupProcessorHandler.uninstallationPrepared(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Dao not found' as any)).to.be.true
    })

    it('should skip if log already exists', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 2,
        logIndex: 2,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      const stubLogger = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      sandbox.stub(Models.LogPluginSetupProcessor, 'findExistingLog').resolves(true)

      await PluginSetupProcessorHandler.uninstallationPrepared(fakeEvent as any, logInfo)

      expect(stubLogger.notCalled).to.be.true
    })
  })

  describe('updateApplied', () => {
    it('should updateApplied', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 2,
        logIndex: 2,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          metadata: 'fake-metadata',
          dao: '0x456',
          preparedSetupId: '0x453',
          appliedSetupId: '0x451',
          plugin: '0x450',
        },
      }

      const loggerStub = sandbox.stub(logger, 'verbose')
      const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const PluginSetupProcessorHandlerAggLogStub = sandbox.stub(PluginSetupProcessorHandler, 'pluginHandler')

      await PluginSetupProcessorHandler.updateApplied(fakeEvent as any, logInfo)

      expect(stubFindDao.calledOnce).to.be.true
      expect(
        findTxSpy.calledWith({
          network: logInfo.network,
          transactionHash: logInfo.transactionHash,
          transactionIndex: logInfo.transactionIndex,
          logIndex: logInfo.logIndex,
          event: IEventLogPluginType.UpdateApplied,
        }),
      ).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog({
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        transactionIndex: logInfo.transactionIndex,
        logIndex: logInfo.logIndex,
        event: IEventLogPluginType.UpdateApplied,
      })
      expect(daoMetadataDB.transactionHash).to.eq(logInfo.transactionHash)
      expect(daoMetadataDB.blockNumber).to.eq(logInfo.blockNumber)
      expect(daoMetadataDB.network).to.eq(logInfo.network)
      expect(daoMetadataDB.event).to.eq(IEventLogPluginType.UpdateApplied)
      expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
      expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(daoMetadataDB.appliedSetupId).to.eq(fakeEvent.args.appliedSetupId)
      expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.plugin)
      expect(PluginSetupProcessorHandlerAggLogStub.calledOnce).to.be.true
      expect(PluginSetupProcessorHandlerAggLogStub.calledWith(IPluginActionType.updated)).to.be.true
    })

    it('dao not found warn', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 2,
        logIndex: 2,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      const stubLogger = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Dao, 'findByAddress').resolves(false)

      await PluginSetupProcessorHandler.updateApplied(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Dao not found' as any)).to.be.true
    })

    it('skip if log already exists', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 2,
        logIndex: 2,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      sandbox.stub(Models.LogPluginSetupProcessor, 'findExistingLog').resolves(true)
      const createDocument = sandbox.stub(DbOperations, 'createDocument')

      await PluginSetupProcessorHandler.updateApplied(fakeEvent as any, logInfo)

      expect(createDocument.notCalled).to.be.true
    })
  })

  describe('updatePrepared', () => {
    it('should updatePrepared', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 2,
        logIndex: 2,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          preparedSetupData: {
            permissions: [
              {
                operation: 1,
                where: 'some-where',
                who: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
                condition: 'some-conditions',
                permissionId: 'xxx',
              },
            ],
          },
          dao: '0x456',
          sender: '0x450',
          preparedSetupId: '0x453',
          pluginSetupRepo: '0x452',
          setupPayload: {
            plugin: '0x450',
          },
          versionTag: {
            release: '1',
            build: '1',
          },
        },
      }

      const loggerStub = sandbox.stub(logger, 'verbose')
      const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)

      await PluginSetupProcessorHandler.updatePrepared(fakeEvent as any, logInfo)

      expect(stubFindDao.calledOnce).to.be.true
      expect(
        findTxSpy.calledWith({
          network: logInfo.network,
          transactionHash: logInfo.transactionHash,
          transactionIndex: logInfo.transactionIndex,
          logIndex: logInfo.logIndex,
          event: IEventLogPluginType.UpdatePrepared,
        }),
      ).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog({
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        transactionIndex: logInfo.transactionIndex,
        logIndex: logInfo.logIndex,
        event: IEventLogPluginType.UpdatePrepared,
      })
      expect(daoMetadataDB.transactionHash).to.eq(logInfo.transactionHash)
      expect(daoMetadataDB.blockNumber).to.eq(logInfo.blockNumber)
      expect(daoMetadataDB.network).to.eq(logInfo.network)
      expect(daoMetadataDB.event).to.eq(IEventLogPluginType.UpdatePrepared)
      expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
      expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(daoMetadataDB.pluginSetupRepo).to.eq(fakeEvent.args.pluginSetupRepo)
      expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.setupPayload.plugin)
      expect(daoMetadataDB.release).to.eq(fakeEvent.args.versionTag.release)
      expect(daoMetadataDB.build).to.eq(fakeEvent.args.versionTag.release)
    })

    it('dao not found error', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 2,
        logIndex: 2,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      const stubLogger = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Dao, 'findByAddress').resolves(false)

      await PluginSetupProcessorHandler.updatePrepared(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Dao not found' as any)).to.be.true
    })

    it('should skip if dao not exists', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 2,
        logIndex: 2,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          preparedSetupData: {
            permissions: [
              {
                operation: 1,
                where: 'some-where',
                who: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
                condition: 'some-conditions',
                permissionId: 'xxx',
              },
            ],
          },
          dao: '0x456',
          sender: '0x450',
          preparedSetupId: '0x453',
          pluginSetupRepo: '0x452',
          setupPayload: {
            plugin: '0x450',
          },
          versionTag: {
            release: '1',
            build: '1',
          },
        },
      }

      const loggerStub = sandbox.stub(logger, 'warn')
      const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(false)

      await PluginSetupProcessorHandler.updatePrepared(fakeEvent as any, logInfo)

      expect(stubFindDao.calledOnce).to.be.true
      expect(findTxSpy.notCalled).to.be.true
      expect(loggerStub.calledOnce).to.be.true
    })

    it('should skip if log already exists', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 2,
        logIndex: 2,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          preparedSetupData: {
            permissions: [
              {
                operation: 1,
                where: 'some-where',
                who: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
                condition: 'some-conditions',
                permissionId: 'xxx',
              },
            ],
          },
          dao: '0x456',
          sender: '0x450',
          preparedSetupId: '0x453',
          pluginSetupRepo: '0x452',
          setupPayload: {
            plugin: '0x450',
          },
          versionTag: {
            release: '1',
            build: '1',
          },
        },
      }

      const loggerStub = sandbox.stub(logger, 'warn')
      const stubLogPluginSetupProcessor = sandbox.stub(Models.LogPluginSetupProcessor, 'findExistingLog').resolves(true)
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)

      await PluginSetupProcessorHandler.updatePrepared(fakeEvent as any, logInfo)

      expect(stubFindDao.calledOnce).to.be.true
      expect(stubLogPluginSetupProcessor.calledOnce).to.be.true
      expect(loggerStub.notCalled).to.be.true
    })
  })

  describe('findVotingEscrow', () => {
    it('should return voting escrow object when all addresses are valid and escrow is valid', async () => {
      const tokenAddress = '0x1111111111111111111111111111111111111111' // This is the IVoterAdapter
      const info = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionHash: '0x123',
      } as ILogInfo

      const escrowAddress = '0x3333333333333333333333333333333333333333'
      const curveAddress = '0x4444444444444444444444444444444444444444'
      const exitQueueAddress = '0x5555555555555555555555555555555555555555'
      const clockAddress = '0x6666666666666666666666666666666666666666'
      const nftLockAddress = '0x7777777777777777777777777777777777777777'
      const underlyingAddress = '0x8888888888888888888888888888888888888888'

      const getEscrowAddressStub = sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(escrowAddress)
      const votingEscrowDetectorStub = sandbox.stub(VotingEscrowDetector, 'isVotingEscrow').resolves({
        status: true,
      } as any)
      const getClockAddressStub = sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(clockAddress)
      const getCurveAddressStub = sandbox.stub(GovernanceVeHelper, 'getCurveAddress').resolves(curveAddress)
      const getExitQueueAddressStub = sandbox.stub(GovernanceVeHelper, 'getExitQueueAddress').resolves(exitQueueAddress)
      const getNftLockAddressStub = sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(nftLockAddress)
      const getErc20TokenAddressStub = sandbox
        .stub(GovernanceVeHelper, 'getErc20TokenAddress')
        .resolves(underlyingAddress)
      const fetchLockTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()

      const result = await PluginSetupProcessorHandler.findVotingEscrow(tokenAddress, info)

      expect(fetchLockTokenStub.calledOnceWith(nftLockAddress, info.network)).to.be.true
      expect(getEscrowAddressStub.calledOnceWith(tokenAddress, info.network)).to.be.true
      expect(votingEscrowDetectorStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getClockAddressStub.calledOnceWith(tokenAddress, info.network)).to.be.true
      expect(getCurveAddressStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getExitQueueAddressStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getNftLockAddressStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getErc20TokenAddressStub.calledOnceWith(escrowAddress, info.network)).to.be.true

      expect(result).to.deep.equal({
        curveAddress,
        exitQueueAddress,
        escrowAddress,
        clockAddress,
        nftLockAddress,
        underlying: underlyingAddress, // The real ERC20 token
      })
    })

    it('should return null when escrow address is not found', async () => {
      const tokenAddress = '0x1111111111111111111111111111111111111111'
      const info = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionHash: '0x123',
      } as ILogInfo

      const getEscrowAddressStub = sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(null)
      const votingEscrowDetectorStub = sandbox.stub(VotingEscrowDetector, 'isVotingEscrow')

      const result = await PluginSetupProcessorHandler.findVotingEscrow(tokenAddress, info)

      expect(getEscrowAddressStub.calledOnceWith(tokenAddress, info.network)).to.be.true
      expect(votingEscrowDetectorStub.notCalled).to.be.true
      expect(result).to.be.null
    })

    it('should return null when escrow is not valid', async () => {
      const tokenAddress = '0x1111111111111111111111111111111111111111'
      const escrowAddress = '0x3333333333333333333333333333333333333333'
      const info = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionHash: '0x123',
      } as ILogInfo

      const getEscrowAddressStub = sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(escrowAddress)
      const votingEscrowDetectorStub = sandbox.stub(VotingEscrowDetector, 'isVotingEscrow').resolves({
        status: false,
      } as any)
      const getClockAddressStub = sandbox.stub(GovernanceVeHelper, 'getClockAddress')

      const result = await PluginSetupProcessorHandler.findVotingEscrow(tokenAddress, info)

      expect(getEscrowAddressStub.calledOnceWith(tokenAddress, info.network)).to.be.true
      expect(votingEscrowDetectorStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getClockAddressStub.notCalled).to.be.true
      expect(result).to.be.null
    })

    it('should return null when one of the required addresses is missing', async () => {
      const tokenAddress = '0x1111111111111111111111111111111111111111'
      const escrowAddress = '0x3333333333333333333333333333333333333333'
      const info = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionHash: '0x123',
      } as ILogInfo

      const curveAddress = '0x4444444444444444444444444444444444444444'
      const exitQueueAddress = '0x5555555555555555555555555555555555555555'
      const clockAddress = '0x6666666666666666666666666666666666666666'
      const underlyingAddress = '0x8888888888888888888888888888888888888888'
      // nftLockAddress will be null

      const getEscrowAddressStub = sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(escrowAddress)
      const votingEscrowDetectorStub = sandbox.stub(VotingEscrowDetector, 'isVotingEscrow').resolves({
        status: true,
      } as any)
      const getClockAddressStub = sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(clockAddress)
      const getCurveAddressStub = sandbox.stub(GovernanceVeHelper, 'getCurveAddress').resolves(curveAddress)
      const getExitQueueAddressStub = sandbox.stub(GovernanceVeHelper, 'getExitQueueAddress').resolves(exitQueueAddress)
      const getNftLockAddressStub = sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(null) // Missing address
      const getErc20TokenAddressStub = sandbox
        .stub(GovernanceVeHelper, 'getErc20TokenAddress')
        .resolves(underlyingAddress)

      const result = await PluginSetupProcessorHandler.findVotingEscrow(tokenAddress, info)

      expect(getEscrowAddressStub.calledOnceWith(tokenAddress, info.network)).to.be.true
      expect(votingEscrowDetectorStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getClockAddressStub.calledOnceWith(tokenAddress, info.network)).to.be.true
      expect(getCurveAddressStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getExitQueueAddressStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getNftLockAddressStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getErc20TokenAddressStub.calledOnceWith(escrowAddress, info.network)).to.be.true

      expect(result).to.be.null
    })

    it('should return null when clockAddress is missing', async () => {
      const tokenAddress = '0x1111111111111111111111111111111111111111'
      const escrowAddress = '0x3333333333333333333333333333333333333333'
      const info = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionHash: '0x123',
      } as ILogInfo

      const curveAddress = '0x4444444444444444444444444444444444444444'
      const exitQueueAddress = '0x5555555555555555555555555555555555555555'
      const nftLockAddress = '0x7777777777777777777777777777777777777777'
      const underlyingAddress = '0x8888888888888888888888888888888888888888'

      const getEscrowAddressStub = sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(escrowAddress)
      const votingEscrowDetectorStub = sandbox.stub(VotingEscrowDetector, 'isVotingEscrow').resolves({
        status: true,
      } as any)
      const getClockAddressStub = sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(null) // Missing clockAddress
      const getCurveAddressStub = sandbox.stub(GovernanceVeHelper, 'getCurveAddress').resolves(curveAddress)
      const getExitQueueAddressStub = sandbox.stub(GovernanceVeHelper, 'getExitQueueAddress').resolves(exitQueueAddress)
      const getNftLockAddressStub = sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(nftLockAddress)
      const getErc20TokenAddressStub = sandbox
        .stub(GovernanceVeHelper, 'getErc20TokenAddress')
        .resolves(underlyingAddress)
      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()

      const result = await PluginSetupProcessorHandler.findVotingEscrow(tokenAddress, info)

      // All address getters should be called
      expect(getEscrowAddressStub.calledOnceWith(tokenAddress, info.network)).to.be.true
      expect(votingEscrowDetectorStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getClockAddressStub.calledOnceWith(tokenAddress, info.network)).to.be.true
      expect(getCurveAddressStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getExitQueueAddressStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getNftLockAddressStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getErc20TokenAddressStub.calledOnceWith(escrowAddress, info.network)).to.be.true

      // But saveAndGetToken should NOT be called because clockAddress is missing
      expect(saveAndGetTokenStub.notCalled).to.be.true

      expect(result).to.be.null
    })

    it('should return null when erc20TokenAddress is missing', async () => {
      const tokenAddress = '0x1111111111111111111111111111111111111111'
      const escrowAddress = '0x3333333333333333333333333333333333333333'
      const info = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionHash: '0x123',
      } as ILogInfo

      const curveAddress = '0x4444444444444444444444444444444444444444'
      const exitQueueAddress = '0x5555555555555555555555555555555555555555'
      const clockAddress = '0x6666666666666666666666666666666666666666'
      const nftLockAddress = '0x7777777777777777777777777777777777777777'

      const getEscrowAddressStub = sandbox.stub(GovernanceVeHelper, 'getEscrowAddress').resolves(escrowAddress)
      const votingEscrowDetectorStub = sandbox.stub(VotingEscrowDetector, 'isVotingEscrow').resolves({
        status: true,
      } as any)
      const getClockAddressStub = sandbox.stub(GovernanceVeHelper, 'getClockAddress').resolves(clockAddress)
      const getCurveAddressStub = sandbox.stub(GovernanceVeHelper, 'getCurveAddress').resolves(curveAddress)
      const getExitQueueAddressStub = sandbox.stub(GovernanceVeHelper, 'getExitQueueAddress').resolves(exitQueueAddress)
      const getNftLockAddressStub = sandbox.stub(GovernanceVeHelper, 'getNftLockAddress').resolves(nftLockAddress)
      const getErc20TokenAddressStub = sandbox.stub(GovernanceVeHelper, 'getErc20TokenAddress').resolves(null) // Missing erc20TokenAddress

      const result = await PluginSetupProcessorHandler.findVotingEscrow(tokenAddress, info)

      expect(getEscrowAddressStub.calledOnceWith(tokenAddress, info.network)).to.be.true
      expect(votingEscrowDetectorStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getClockAddressStub.calledOnceWith(tokenAddress, info.network)).to.be.true
      expect(getCurveAddressStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getExitQueueAddressStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getNftLockAddressStub.calledOnceWith(escrowAddress, info.network)).to.be.true
      expect(getErc20TokenAddressStub.calledOnceWith(escrowAddress, info.network)).to.be.true

      expect(result).to.be.null
    })
  })
})
