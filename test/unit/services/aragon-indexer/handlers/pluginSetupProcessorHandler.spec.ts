import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { IEventLogPluginType, IPluginInterfaceType, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import {
  IPluginActionType,
  PluginSetupProcessorHandler,
} from '@services/aragon-indexer/handlers/pluginSetupProcessorHandler'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import { PluginHandler } from '@indexer/handlers/pluginHandler'
import { PluginSettingHandler } from '@src/services/aragon-indexer/handlers/pluginSettingHandler'
import { LogTokenVoting } from '@indexer/logTokenVoting'
import { LogMultiSig } from '@indexer/logMultisig'
import { LogAdmin } from '@indexer/logAdmin'
import { LogSpp } from '@indexer/logSPP'

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
      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const stubFindExistingLog = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')
      const PluginSetupProcessorHandlerAggLogStub = sandbox.stub(PluginSetupProcessorHandler, 'pluginHandler')
      const findByAddressStub = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        interfaceType: IPluginInterfaceType.admin,
      })

      const logAdminStartStub = sandbox.stub(LogAdmin, 'start')
      const isSupportedStub = sandbox.stub(PluginSettingHandler, 'isSupported')

      await PluginSetupProcessorHandler.installationApplied(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubFindDao.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(PluginSetupProcessorHandlerAggLogStub.calledOnce).to.be.true

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
      expect(logAdminStartStub.calledOnce).to.be.true
      expect(isSupportedStub.calledOnce).to.be.true
      expect(findByAddressStub.calledOnce).to.be.true
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

      const logSppStartStub = sandbox.stub(LogSpp, 'start')
      const isSupportedStub = sandbox.stub(PluginSettingHandler, 'handleFromReceipt')
      const getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(true as any)
      await PluginSetupProcessorHandler.installationApplied(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnce).to.be.true
      expect(stubFindDao.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(PluginSetupProcessorHandlerAggLogStub.calledOnce).to.be.true

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
      expect(logSppStartStub.calledOnce).to.be.true
      expect(isSupportedStub.calledOnce).to.be.true
      expect(findByAddressStub.calledOnce).to.be.true
      expect(getTransactionReceiptStub.calledOnce).to.be.true
    })
  })

  describe('installationPrepared', () => {
    it('should installationPrepared', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 5,
        logIndex: 5,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          preparedSetupData: {
            helpers: ['0x27366cae2b9c6c3055e9e3c78936a69006be5400'],
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

      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      const receiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(true as any)
      const findLogsByNameStub = sandbox
        .stub(Web3Helper, 'findLogsByName')
        .onFirstCall()
        .returns([
          {
            txLog: {
              ...logInfo,
            },
            parsed: { args: ['0x00'] },
          },
        ] as any)
        .onSecondCall()
        .returns([
          {
            txLog: { address: '0x27366cae2b9c6c3055e9e3c78936a69006be5400' },
            parsed: { args: ['0x00'] },
          },
        ] as any)

      const findExistingLogStub = sandbox.stub(Models.LogPluginSetupProcessor, 'findExistingLog').resolves(false)
      const parseLogInfoStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns(logInfo)
      const handleSingleInstallationPreparedStub = sandbox.stub(
        PluginSetupProcessorHandler,
        'handleSingleInstallationPrepared',
      )

      const handleFromReceiptStub = sandbox.stub(PluginSettingHandler, 'handleFromReceipt').returns([
        {
          interfaceType: IPluginInterfaceType.tokenVoting,
        },
        {
          interfaceType: IPluginInterfaceType.multisig,
        },
      ] as any)

      const logTokenVotingStartStub = sandbox.stub(LogTokenVoting, 'start')
      const logMultiSigStartStub = sandbox.stub(LogMultiSig, 'start')

      await PluginSetupProcessorHandler.installationPrepared(fakeEvent as any, logInfo)

      expect(stubFindDao.calledOnceWith(fakeEvent.args.dao, NetworksEnum.ethereumMainnet)).to.be.true
      expect(receiptStub.calledOnceWith(logInfo.transactionHash, NetworksEnum.ethereumMainnet)).to.be.true
      expect(findLogsByNameStub.calledTwice).to.be.true
      expect(parseLogInfoStub.calledOnce).to.be.true
      expect(handleSingleInstallationPreparedStub.calledOnce).to.be.true
      expect(handleSingleInstallationPreparedStub.args[0][0].parsed.args[0]).to.be.eq('0x00')
      expect(handleFromReceiptStub.calledOnce).to.be.true
      expect(logTokenVotingStartStub.calledOnce).to.be.true
      expect(logMultiSigStartStub.calledOnce).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
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

      await PluginSetupProcessorHandler.installationPrepared(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Dao not found' as any)).to.be.true
    })

    it('should return if existingLog', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionIndex: 5,
        logIndex: 5,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          preparedSetupData: {
            helpers: ['0x27366cae2b9c6c3055e9e3c78936a69006be5400'],
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

      const stubFindDao = sandbox.stub(Models.Dao, 'findByAddress').resolves(true)
      sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(true as any)
      sandbox
        .stub(Web3Helper, 'findLogsByName')
        .onFirstCall()
        .returns([
          {
            txLog: {
              ...logInfo,
            },
            parsed: { args: ['0x00'] },
          },
        ] as any)
        .onSecondCall()
        .returns([
          {
            txLog: { address: '0x27366cae2b9c6c3055e9e3c78936a69006be5400' },
            parsed: { args: ['0x00'] },
          },
        ] as any)

      const findExistingLogStub = sandbox.stub(Models.LogPluginSetupProcessor, 'findExistingLog').resolves(true)
      const returnValue = await PluginSetupProcessorHandler.installationPrepared(fakeEvent as any, logInfo)
      expect(stubFindDao.calledOnce).to.be.true
      expect(findExistingLogStub.calledOnce).to.be.true
      expect(returnValue).to.be.undefined
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

      const pluginDb = await Models.LogPluginSetupProcessor.findExistingLog({
        network: logInfo.network,
        transactionHash: logInfo.transactionHash,
        transactionIndex: logInfo.transactionIndex,
        logIndex: logInfo.logIndex,
        event: IEventLogPluginType.UninstallationApplied,
      })
      expect(pluginDb.transactionHash).to.eq(logInfo.transactionHash)
      expect(pluginDb.blockNumber).to.eq(logInfo.blockNumber)
      expect(pluginDb.network).to.eq(logInfo.network)
      expect(pluginDb.event).to.eq(IEventLogPluginType.UninstallationApplied)
      expect(pluginDb.daoAddress).to.eq(fakeEvent.args.dao)
      expect(pluginDb.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(pluginDb.pluginAddress).to.eq(fakeEvent.args.plugin)
      expect(PluginSetupProcessorHandlerAggLogStub.calledOnce).to.be.true
      expect(PluginSetupProcessorHandlerAggLogStub.calledWith(IPluginActionType.uninstalled)).to.be.true
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

      await PluginSetupProcessorHandler.updateApplied(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Dao not found' as any)).to.be.true
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
  })
})
