import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { PluginLogsUninstallationPrepared } from '@services/indexer/pluginSetupProcessorLogs/uninstallationPrepared'
import logger from '@logger'
import { IEventLogPluginType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { UtilsIndexer } from '@models/utils/indexer'
import Network from '@models/schema/network'
import { Interface } from 'ethers'
import Provider from '@modules/provider'

describe('Indexer: PluginLogsUninstallationPrepared', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should start', async () => {
      let callCount = 0
      const getBlockNumber = sandbox.stub().callsFake(() => {
        callCount++
        return Promise.resolve(callCount % 2 === 0 ? 2000 : 0)
      })

      const fakeProviders = {
        mainnet: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0x123', blockNumber: 1 }]),
          destroy: sandbox.stub().resolves(),
        },
        sepolia: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0x456', blockNumber: 2 }]),
          destroy: sandbox.stub().resolves(),
        },
        polygon: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0x789', blockNumber: 3 }]),
          destroy: sandbox.stub().resolves(),
        },
        arbitrum: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0xabc', blockNumber: 4 }]),
          destroy: sandbox.stub().resolves(),
        },
        base: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0xdef', blockNumber: 5 }]),
          destroy: sandbox.stub().resolves(),
        },
      }
      sandbox.stub(Provider.configState, 'getConfigItem').callsFake(network => fakeProviders[network])
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves({ lastBlockMetadataLog: 123 })

      const processMetadataStub = sandbox.stub(PluginLogsUninstallationPrepared, 'processLog').resolves()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()

      await PluginLogsUninstallationPrepared.start()

      expect(loggerVerboseStub.callCount).to.eq(6)
      expect(processMetadataStub.callCount).to.eq(2)
      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(saveSyncStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
    })

    it('should start handle error', async () => {
      let callCount = 0
      const getBlockNumber = sandbox.stub().callsFake(() => {
        callCount++
        return Promise.resolve(callCount % 2 === 0 ? 2000 : 0)
      })

      const fakeProviders = {
        mainnet: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0x123', blockNumber: 1 }]),
          destroy: sandbox.stub().resolves(),
        },
        sepolia: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0x456', blockNumber: 2 }]),
          destroy: sandbox.stub().resolves(),
        },
        polygon: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0x789', blockNumber: 3 }]),
          destroy: sandbox.stub().resolves(),
        },
        arbitrum: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0xabc', blockNumber: 4 }]),
          destroy: sandbox.stub().resolves(),
        },
        base: {
          getBlockNumber,
          getLogs: sandbox.stub().resolves([{ transactionHash: '0xdef', blockNumber: 5 }]),
          destroy: sandbox.stub().resolves(),
        },
      }
      sandbox.stub(Provider.configState, 'getConfigItem').callsFake(network => fakeProviders[network])
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves({ lastBlockMetadataLog: 123 })

      const processMetadataStub = sandbox.stub(PluginLogsUninstallationPrepared, 'processLog').rejects()
      const errorStub = sandbox.stub(PluginLogsUninstallationPrepared, 'processError').resolves()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()

      await PluginLogsUninstallationPrepared.start()

      expect(errorStub.callCount).to.eq(2)
      expect(loggerVerboseStub.callCount).to.eq(6)
      expect(processMetadataStub.callCount).to.eq(2)
      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(saveSyncStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
    })

    it('should skip unsupported networks', async () => {
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves(null)
      const stubLogger = sandbox.stub(logger, 'verbose')
      await PluginLogsUninstallationPrepared.start()

      expect(stubLogger.calledWith('Unsupported Network' as any)).to.be.true
      expect(networkFindStub.calledOnce).to.be.true
    })
  })

  it('processLog', async () => {
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

    const stubParseLog = sandbox.stub(Interface.prototype, 'parseLog').returns(fakeEvent as any)
    const loggerStub = sandbox.stub(logger, 'verbose')
    const findTxSpy = sandbox.spy(Models.LogPluginSetupProcessor, 'findTxHashAndEvent')

    await PluginLogsUninstallationPrepared.processLog(txLog, NetworksEnum.mainnet)

    expect(stubParseLog.calledOnce).to.be.true
    expect(stubParseLog.calledWith(txLog)).to.be.true
    expect(findTxSpy.calledWith(txLog.transactionHash, IEventLogPluginType.UninstallationPrepared)).to.be.true
    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('New PluginLog - UninstallationPrepared' as any))

    const daoMetadataDB = await Models.LogPluginSetupProcessor.findTxHashAndEvent(
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
    expect(daoMetadataDB.plugin).to.eq(fakeEvent.args.plugin)
    expect(daoMetadataDB.release).to.eq(fakeEvent.args.versionTag.release)
    expect(daoMetadataDB.build).to.eq(fakeEvent.args.versionTag.release)
  })

  it('processError', async () => {
    const error = new Error('Test error')
    const loggerStub = sandbox.stub(logger, 'error')

    await PluginLogsUninstallationPrepared.processError(error, NetworksEnum.mainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error PluginLogsUninstallationPrepared' as any))
  })
})
