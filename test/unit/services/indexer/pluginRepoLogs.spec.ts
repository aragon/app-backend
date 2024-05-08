import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { PluginRepoLogs } from '@services/indexer/pluginRepoLogs'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { UtilsIndexer } from '@models/utils/indexer'
import Network from '@models/schema/network'
import Provider from '@modules/provider'
import { Interface } from 'ethers'

describe('Indexer: PluginRepoLogs', () => {
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

      const processMetadataStub = sandbox.stub(PluginRepoLogs, 'processLog').resolves()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()

      await PluginRepoLogs.start()

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

      const processMetadataStub = sandbox.stub(PluginRepoLogs, 'processLog').rejects()
      const errorStub = sandbox.stub(PluginRepoLogs, 'processError').resolves()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()

      await PluginRepoLogs.start()

      expect(errorStub.callCount).to.eq(2)
      expect(loggerVerboseStub.callCount).to.eq(6)
      expect(processMetadataStub.callCount).to.eq(2)
      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(saveSyncStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
    })

    it('should skip unsupported networks', async () => {
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves(null)
      const stubLogger = sandbox.stub(logger, 'verbose')
      await PluginRepoLogs.start()

      expect(stubLogger.calledWith('Unsupported Network' as any)).to.be.true
      expect(networkFindStub.calledOnce).to.be.true
    })
  })

  describe('processLog', () => {
    it('should process pluginRepoLog', async () => {
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
          pluginRepo: '0x456',
          subdomain: 'test',
        },
      }

      const findTxHashSpy = sandbox.spy(Models.LogPluginRepo, 'findTxHash')
      const loggerStub = sandbox.stub(logger, 'verbose')
      const stubParseLog = sandbox.stub(Interface.prototype, 'parseLog').returns(fakeEvent as any)

      await PluginRepoLogs.processLog(txLog as any, network)

      expect(stubParseLog.calledOnce).to.be.true
      expect(stubParseLog.calledWith(txLog)).to.be.true
      expect(findTxHashSpy.calledOnce).to.be.true
      expect(findTxHashSpy.calledWith(txLog.transactionHash)).to.be.true
      expect(loggerStub.calledWith('New PluginRepoLog' as any)).to.be.true

      const savedPluginRepoLog = await Models.LogPluginRepo.findTxHash(txLog.transactionHash)
      expect(!!savedPluginRepoLog).to.be.true

      expect(savedPluginRepoLog.network).to.eq(network)
      expect(savedPluginRepoLog.pluginRepo).to.eq(fakeEvent.args.pluginRepo)
      expect(savedPluginRepoLog.subdomain).to.eq(fakeEvent.args.subdomain)
      expect(savedPluginRepoLog.blockNumber).to.eq(txLog.blockNumber)
      expect(savedPluginRepoLog.transactionHash).to.eq(txLog.transactionHash)
    })

    it('should not process existing pluginRepoLog', async () => {
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
          pluginRepo: '0x456',
          subdomain: 'test',
        },
      }
      const stubParseLog = sandbox.stub(Interface.prototype, 'parseLog').returns(fakeEvent as any)
      const findTxHashStub = sandbox.stub(Models.LogPluginRepo, 'findTxHash').resolves({ transactionHash: '0x00' })

      const createStub = sandbox.stub(Models.LogPluginRepo, 'create')

      await PluginRepoLogs.processLog(txLog, network)

      expect(findTxHashStub.calledOnceWith(txLog.transactionHash)).to.be.true
      expect(createStub.notCalled).to.be.true
      expect(stubParseLog.calledOnce).to.be.true
    })
  })

  it('processError', async () => {
    const error = new Error('Test error')
    const loggerStub = sandbox.stub(logger, 'error')

    await PluginRepoLogs.processError(error, NetworksEnum.mainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error PluginRepoLogs' as any))
  })
})
