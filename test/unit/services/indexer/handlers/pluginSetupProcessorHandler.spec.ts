import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { IEventLogPluginType, ITokenType, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { PluginSetupProcessorHandler } from '@services/indexer/handlers/pluginSetupProcessorHandler'
import { Models } from '@dbModels'
import { UtilsIndexer } from '@models/utils/indexer'

describe('Indexer: PluginSetupProcessorHandler', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('installationApplied', () => {
    it('should installationApplied', async () => {
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

      const loggerStub = sandbox.stub(logger, 'verbose')
      const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')

      await PluginSetupProcessorHandler.installationApplied(fakeEvent as any, txLog, NetworksEnum.mainnet)

      expect(findTxSpy.calledWith(txLog.transactionHash, IEventLogPluginType.InstallationApplied)).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog(
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
      expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.plugin)
    })

    it('InstallationApplied throw error', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.LogTransaction, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await PluginSetupProcessorHandler.installationApplied(fakeEvent as any, txLog, network)

      expect(stubLogger.calledOnceWith('Error InstallationApplied' as any)).to.be.true
    })
  })

  describe('installationPrepared', () => {
    it('should installationPrepared', async () => {
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
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

      const loggerStub = sandbox.stub(logger, 'verbose')
      const stubToken = sandbox.stub(UtilsIndexer, 'saveAndGetToken').resolves({
        address: '0x27366cae2b9c6c3055e9e3c78936a69006be5400',
        name: 'FakeToken',
        symbol: 'FTK',
        decimals: 18,
        totalSupply: 100,
        type: ITokenType.GovernanceERC20,
      } as any)
      const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')

      await PluginSetupProcessorHandler.installationPrepared(fakeEvent as any, txLog, NetworksEnum.mainnet)

      expect(findTxSpy.calledWith(txLog.transactionHash, IEventLogPluginType.InstallationPrepared)).to.be.true
      expect(loggerStub.calledWith('New InstallationPrepared' as any)).to.be.true

      const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog(
        txLog.transactionHash,
        IEventLogPluginType.InstallationPrepared,
      )
      expect(stubToken.calledOnce).to.be.true
      expect(daoMetadataDB.transactionHash).to.eq(txLog.transactionHash)
      expect(daoMetadataDB.blockNumber).to.eq(txLog.blockNumber)
      expect(daoMetadataDB.network).to.eq(NetworksEnum.mainnet)
      expect(daoMetadataDB.event).to.eq(IEventLogPluginType.InstallationPrepared)
      expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
      expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(daoMetadataDB.pluginSetupRepo).to.eq(fakeEvent.args.pluginSetupRepo)
      expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.plugin)
      expect(daoMetadataDB.release).to.eq(fakeEvent.args.versionTag.release)
      expect(daoMetadataDB.build).to.eq(fakeEvent.args.versionTag.release)
      expect(daoMetadataDB.tokenAddress).to.eq('0x27366cae2b9c6c3055e9e3c78936a69006be5400')
    })

    it('installationPrepared throw error', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.LogTransaction, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await PluginSetupProcessorHandler.installationPrepared(fakeEvent as any, txLog, network)

      expect(stubLogger.calledOnceWith('Error InstallationPrepared' as any)).to.be.true
    })
  })

  describe('uninstallationApplied', () => {
    it('should uninstallationApplied', async () => {
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
          plugin: '0x450',
        },
      }

      const loggerStub = sandbox.stub(logger, 'verbose')
      const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')

      await PluginSetupProcessorHandler.uninstallationApplied(fakeEvent as any, txLog, NetworksEnum.mainnet)

      expect(findTxSpy.calledWith(txLog.transactionHash, IEventLogPluginType.UninstallationApplied)).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog(
        txLog.transactionHash,
        IEventLogPluginType.UninstallationApplied,
      )
      expect(daoMetadataDB.transactionHash).to.eq(txLog.transactionHash)
      expect(daoMetadataDB.blockNumber).to.eq(txLog.blockNumber)
      expect(daoMetadataDB.network).to.eq(NetworksEnum.mainnet)
      expect(daoMetadataDB.event).to.eq(IEventLogPluginType.UninstallationApplied)
      expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
      expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.plugin)
    })

    it('uninstallationApplied throw error', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.LogTransaction, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await PluginSetupProcessorHandler.uninstallationApplied(fakeEvent as any, txLog, network)

      expect(stubLogger.calledOnceWith('Error UninstallationApplied' as any)).to.be.true
    })
  })

  describe('uninstallationPrepared', () => {
    it('should uninstallationPrepared', async () => {
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
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

      await PluginSetupProcessorHandler.uninstallationPrepared(fakeEvent as any, txLog, NetworksEnum.mainnet)

      expect(findTxSpy.calledWith(txLog.transactionHash, IEventLogPluginType.UninstallationPrepared)).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog(
        txLog.transactionHash,
        IEventLogPluginType.UninstallationPrepared,
      )
      expect(daoMetadataDB.transactionHash).to.eq(txLog.transactionHash)
      expect(daoMetadataDB.blockNumber).to.eq(txLog.blockNumber)
      expect(daoMetadataDB.network).to.eq(NetworksEnum.mainnet)
      expect(daoMetadataDB.event).to.eq(IEventLogPluginType.UninstallationPrepared)
      expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
      expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(daoMetadataDB.pluginSetupRepo).to.eq(fakeEvent.args.pluginSetupRepo)
      expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.plugin)
      expect(daoMetadataDB.release).to.eq(fakeEvent.args.versionTag.release)
      expect(daoMetadataDB.build).to.eq(fakeEvent.args.versionTag.release)
    })

    it('uninstallationPrepared throw error', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.LogTransaction, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await PluginSetupProcessorHandler.uninstallationPrepared(fakeEvent as any, txLog, network)

      expect(stubLogger.calledOnceWith('Error UninstallationPrepared' as any)).to.be.true
    })
  })

  describe('updateApplied', () => {
    it('should updateApplied', async () => {
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
          appliedSetupId: '0x451',
          plugin: '0x450',
        },
      }

      const loggerStub = sandbox.stub(logger, 'verbose')
      const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')

      await PluginSetupProcessorHandler.updateApplied(fakeEvent as any, txLog, NetworksEnum.mainnet)

      expect(findTxSpy.calledWith(txLog.transactionHash, IEventLogPluginType.UpdateApplied)).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog(
        txLog.transactionHash,
        IEventLogPluginType.UpdateApplied,
      )
      expect(daoMetadataDB.transactionHash).to.eq(txLog.transactionHash)
      expect(daoMetadataDB.blockNumber).to.eq(txLog.blockNumber)
      expect(daoMetadataDB.network).to.eq(NetworksEnum.mainnet)
      expect(daoMetadataDB.event).to.eq(IEventLogPluginType.UpdateApplied)
      expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
      expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(daoMetadataDB.appliedSetupId).to.eq(fakeEvent.args.appliedSetupId)
      expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.plugin)
    })

    it('updateApplied throw error', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.LogTransaction, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await PluginSetupProcessorHandler.updateApplied(fakeEvent as any, txLog, network)

      expect(stubLogger.calledOnceWith('Error UpdateApplied' as any)).to.be.true
    })
  })

  describe('updatePrepared', () => {
    it('should updatePrepared', async () => {
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
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

      await PluginSetupProcessorHandler.updatePrepared(fakeEvent as any, txLog, NetworksEnum.mainnet)

      expect(findTxSpy.calledWith(txLog.transactionHash, IEventLogPluginType.UpdatePrepared)).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog(
        txLog.transactionHash,
        IEventLogPluginType.UpdatePrepared,
      )
      expect(daoMetadataDB.transactionHash).to.eq(txLog.transactionHash)
      expect(daoMetadataDB.blockNumber).to.eq(txLog.blockNumber)
      expect(daoMetadataDB.network).to.eq(NetworksEnum.mainnet)
      expect(daoMetadataDB.event).to.eq(IEventLogPluginType.UpdatePrepared)
      expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
      expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(daoMetadataDB.pluginSetupRepo).to.eq(fakeEvent.args.pluginSetupRepo)
      expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.setupPayload.plugin)
      expect(daoMetadataDB.release).to.eq(fakeEvent.args.versionTag.release)
      expect(daoMetadataDB.build).to.eq(fakeEvent.args.versionTag.release)
    })

    it('updatePrepared throw error', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Models.LogTransaction, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')

      await PluginSetupProcessorHandler.updatePrepared(fakeEvent as any, txLog, network)

      expect(stubLogger.calledOnceWith('Error UpdatePrepared' as any)).to.be.true
    })
  })
})
