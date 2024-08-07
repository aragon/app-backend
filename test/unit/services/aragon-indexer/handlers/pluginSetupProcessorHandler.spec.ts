import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { IEventLogPluginType, ITokenType, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { PluginSetupProcessorHandler } from '@services/aragon-indexer/handlers/pluginSetupProcessorHandler'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import { TokenProxy } from '@modules/tokenProxy'

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
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
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

      const loggerStub = sandbox.stub(logger, 'verbose')
      const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')
      const stubFindDao = sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(true)

      await PluginSetupProcessorHandler.installationApplied(fakeEvent as any, logInfo)

      expect(stubFindDao.calledOnce).to.be.true
      expect(
        findTxSpy.calledWith({
          transactionHash: logInfo.transactionHash,
          event: IEventLogPluginType.InstallationApplied,
        }),
      ).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog({
        transactionHash: logInfo.transactionHash,
        event: IEventLogPluginType.InstallationApplied,
      })
      expect(daoMetadataDB.transactionHash).to.eq(logInfo.transactionHash)
      expect(daoMetadataDB.blockNumber).to.eq(logInfo.blockNumber)
      expect(daoMetadataDB.network).to.eq(logInfo.network)
      expect(daoMetadataDB.event).to.eq(IEventLogPluginType.InstallationApplied)
      expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
      expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(daoMetadataDB.appliedSetupId).to.eq(fakeEvent.args.appliedSetupId)
      expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.plugin)
    })

    it('dao not found error', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
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
      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(false)

      await PluginSetupProcessorHandler.installationApplied(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('dao not found' as any)).to.be.true
    })

    it('InstallationApplied throw error', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
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

      sandbox.stub(Models.LogPluginSetupProcessor, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(true)

      await PluginSetupProcessorHandler.installationApplied(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Error InstallationApplied' as any)).to.be.true
    })
  })

  describe('installationPrepared', () => {
    it('should installationPrepared', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
        transactionHash: '0x123',
        address: '0x456',
        eventName: 'test',
      }
      const fakeEvent = {
        args: {
          // only for supported dao the token address is in helpers
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

      const tokenAddress = '0x27366cae2b9c6c3055e9e3c78936a69006be5400'
      const loggerStub = sandbox.stub(logger, 'verbose')
      const receiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt').resolves(true as any)
      const logsStub = sandbox.stub(Web3Helper, 'findLogsByName').returns([
        {
          parsed: { args: [tokenAddress] },
        },
      ] as any)
      const stubToken = sandbox.stub(TokenProxy, 'saveAndGetToken').resolves({
        address: tokenAddress,
        name: 'FakeToken',
        symbol: 'FTK',
        decimals: 18,
        totalSupply: '100',
        type: ITokenType.GovernanceERC20,
      } as any)
      const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')
      const stubFindDao = sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(true)

      await PluginSetupProcessorHandler.installationPrepared(fakeEvent as any, logInfo)

      expect(stubFindDao.calledOnce).to.be.true
      expect(
        findTxSpy.calledWith({
          transactionHash: logInfo.transactionHash,
          event: IEventLogPluginType.InstallationPrepared,
        }),
      ).to.be.true
      expect(loggerStub.calledWith('New InstallationPrepared' as any)).to.be.true
      expect(receiptStub.calledWith(logInfo.transactionHash, logInfo.network)).to.be.true
      expect(logsStub.calledOnce).to.be.true

      const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog({
        transactionHash: logInfo.transactionHash,
        event: IEventLogPluginType.InstallationPrepared,
      })
      expect(stubToken.calledOnce).to.be.true
      expect(daoMetadataDB.transactionHash).to.eq(logInfo.transactionHash)
      expect(daoMetadataDB.blockNumber).to.eq(logInfo.blockNumber)
      expect(daoMetadataDB.network).to.eq(logInfo.network)
      expect(daoMetadataDB.event).to.eq(IEventLogPluginType.InstallationPrepared)
      expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
      expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(daoMetadataDB.pluginSetupRepo).to.eq(fakeEvent.args.pluginSetupRepo)
      expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.plugin)
      expect(daoMetadataDB.release).to.eq(fakeEvent.args.versionTag.release)
      expect(daoMetadataDB.build).to.eq(fakeEvent.args.versionTag.release)
      expect(daoMetadataDB.tokenAddress).to.eq(tokenAddress)
    })

    it('dao not found error', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
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
      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(false)

      await PluginSetupProcessorHandler.installationPrepared(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('dao not found' as any)).to.be.true
    })

    it('installationPrepared throw error', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
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

      sandbox.stub(Models.LogPluginSetupProcessor, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(true)

      await PluginSetupProcessorHandler.installationPrepared(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Error InstallationPrepared' as any)).to.be.true
    })
  })

  describe('uninstallationApplied', () => {
    it('should uninstallationApplied', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
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
          plugin: '0x450',
        },
      }

      const loggerStub = sandbox.stub(logger, 'verbose')
      const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')
      const stubFindDao = sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(true)

      await PluginSetupProcessorHandler.uninstallationApplied(fakeEvent as any, logInfo)

      expect(stubFindDao.calledOnce).to.be.true
      expect(
        findTxSpy.calledWith({
          transactionHash: logInfo.transactionHash,
          event: IEventLogPluginType.UninstallationApplied,
        }),
      ).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog({
        transactionHash: logInfo.transactionHash,
        event: IEventLogPluginType.UninstallationApplied,
      })
      expect(daoMetadataDB.transactionHash).to.eq(logInfo.transactionHash)
      expect(daoMetadataDB.blockNumber).to.eq(logInfo.blockNumber)
      expect(daoMetadataDB.network).to.eq(logInfo.network)
      expect(daoMetadataDB.event).to.eq(IEventLogPluginType.UninstallationApplied)
      expect(daoMetadataDB.daoAddress).to.eq(fakeEvent.args.dao)
      expect(daoMetadataDB.preparedSetupId).to.eq(fakeEvent.args.preparedSetupId)
      expect(daoMetadataDB.pluginAddress).to.eq(fakeEvent.args.plugin)
    })

    it('dao not found error', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
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
      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(false)

      await PluginSetupProcessorHandler.uninstallationApplied(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('dao not found' as any)).to.be.true
    })

    it('uninstallationApplied throw error', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
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

      sandbox.stub(Models.LogPluginSetupProcessor, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(true)

      await PluginSetupProcessorHandler.uninstallationApplied(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Error UninstallationApplied' as any)).to.be.true
    })
  })

  describe('uninstallationPrepared', () => {
    it('should uninstallationPrepared', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
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
      const stubFindDao = sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(true)

      await PluginSetupProcessorHandler.uninstallationPrepared(fakeEvent as any, logInfo)

      expect(stubFindDao.calledOnce).to.be.true
      expect(
        findTxSpy.calledWith({
          transactionHash: logInfo.transactionHash,
          event: IEventLogPluginType.UninstallationPrepared,
        }),
      ).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog({
        transactionHash: logInfo.transactionHash,
        event: IEventLogPluginType.UninstallationPrepared,
      })
      expect(daoMetadataDB.transactionHash).to.eq(logInfo.transactionHash)
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
      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(false)

      await PluginSetupProcessorHandler.uninstallationPrepared(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('dao not found' as any)).to.be.true
    })

    it('uninstallationPrepared throw error', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
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

      sandbox.stub(Models.LogPluginSetupProcessor, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(true)

      await PluginSetupProcessorHandler.uninstallationPrepared(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Error UninstallationPrepared' as any)).to.be.true
    })
  })

  describe('updateApplied', () => {
    it('should updateApplied', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
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
          appliedSetupId: '0x451',
          plugin: '0x450',
        },
      }

      const loggerStub = sandbox.stub(logger, 'verbose')
      const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findExistingLog')
      const stubFindDao = sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(true)

      await PluginSetupProcessorHandler.updateApplied(fakeEvent as any, logInfo)

      expect(stubFindDao.calledOnce).to.be.true
      expect(
        findTxSpy.calledWith({
          transactionHash: logInfo.transactionHash,
          event: IEventLogPluginType.UpdateApplied,
        }),
      ).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog({
        transactionHash: logInfo.transactionHash,
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
    })

    it('dao not found error', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
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
      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(false)

      await PluginSetupProcessorHandler.updateApplied(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('dao not found' as any)).to.be.true
    })

    it('updateApplied throw error', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
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

      sandbox.stub(Models.LogPluginSetupProcessor, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(true)

      await PluginSetupProcessorHandler.updateApplied(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Error UpdateApplied' as any)).to.be.true
    })
  })

  describe('updatePrepared', () => {
    it('should updatePrepared', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
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
      const stubFindDao = sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(true)

      await PluginSetupProcessorHandler.updatePrepared(fakeEvent as any, logInfo)

      expect(stubFindDao.calledOnce).to.be.true
      expect(
        findTxSpy.calledWith({
          transactionHash: logInfo.transactionHash,
          event: IEventLogPluginType.UpdatePrepared,
        }),
      ).to.be.true
      expect(loggerStub.calledOnce).to.be.true

      const daoMetadataDB = await Models.LogPluginSetupProcessor.findExistingLog({
        transactionHash: logInfo.transactionHash,
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
      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(false)

      await PluginSetupProcessorHandler.updatePrepared(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('dao not found' as any)).to.be.true
    })

    it('updatePrepared throw error', async () => {
      const logInfo = {
        network: NetworksEnum.ethereumMainnet,
        blockNumber: 1,
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

      sandbox.stub(Models.LogPluginSetupProcessor, 'findExistingLog').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(Models.LogDaoRegistry, 'findByAddress').resolves(true)

      await PluginSetupProcessorHandler.updatePrepared(fakeEvent as any, logInfo)

      expect(stubLogger.calledOnceWith('Error UpdatePrepared' as any)).to.be.true
    })
  })
})
