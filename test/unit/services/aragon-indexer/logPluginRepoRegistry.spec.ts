import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { LogPluginRepoRegistry } from '@services/aragon-indexer/logPluginRepoRegistry'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { UtilsIndexer } from '@models/utils/indexer'
import Network from '@models/schema/network'
import Provider from '@modules/provider'
import Utils from '@helpers/utils'
import { UnitTestUtils } from '@test/lib/utils'
import Web3Helper from '@helpers/web3'
import { PluginRepoRegistryHandler } from '@services/aragon-indexer/handlers/pluginRepoRegistryHandler'

describe('Indexer: LogPluginRepoRegistry', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('events', async () => {
    expect(LogPluginRepoRegistry.events.length).to.eq(1)
  })

  describe('start', () => {
    it('should start', async () => {
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)

      sandbox.stub(Provider.configState, 'getConfigItem').callsFake(network => fakeProviders[network])
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves({ lastBlockMetadataLog: 123 })

      const processMetadataStub = sandbox.stub(LogPluginRepoRegistry, 'processLog').resolves()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()

      await LogPluginRepoRegistry.start()

      expect(loggerVerboseStub.callCount).to.eq(15)
      expect(processMetadataStub.callCount).to.eq(2)
      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(saveSyncStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
    })

    it('should start handle error', async () => {
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)

      sandbox.stub(Provider.configState, 'getConfigItem').callsFake(network => fakeProviders[network])
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves({ lastBlockMetadataLog: 123 })

      const processMetadataStub = sandbox.stub(LogPluginRepoRegistry, 'processLog').rejects()
      const errorStub = sandbox.stub(LogPluginRepoRegistry, 'processError').resolves()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()

      await LogPluginRepoRegistry.start()

      expect(errorStub.callCount).to.eq(2)
      expect(loggerVerboseStub.callCount).to.eq(15)
      expect(processMetadataStub.callCount).to.eq(2)
      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(saveSyncStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
    })

    it('should skip unsupported networks', async () => {
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves(null)
      const stubLogger = sandbox.stub(logger, 'warn')
      await LogPluginRepoRegistry.start()

      expect(stubLogger.calledWith('Unsupported Network' as any)).to.be.true
      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
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

      for (const event of LogPluginRepoRegistry.events) {
        const fakeEvent = {
          name: event,
          args: true,
        }
        const fakeInfo = 'test-info'

        const loggerStub = sandbox.stub(logger, 'verbose')
        const stubParseLog = sandbox.stub(Web3Helper, 'parseLog').returns(fakeEvent as any)
        const stubParseInfoLog = sandbox.stub(Web3Helper, 'parseInfoLog').returns(fakeInfo as any)
        const stubProcessHandler = sandbox.stub(PluginRepoRegistryHandler, Utils.lowercaseFirstLetter(event))

        await LogPluginRepoRegistry.processLog(txLog as any, network)

        expect(stubParseLog.calledOnceWith(txLog)).to.be.true
        expect(stubParseInfoLog.calledOnceWith(txLog, fakeEvent.name, network)).to.be.true
        expect(loggerStub.calledOnceWith(event as any)).to.be.true
        expect(stubProcessHandler.calledOnceWith(fakeEvent as any, fakeInfo)).to.be.true

        loggerStub.restore()
        stubParseLog.restore()
        stubParseInfoLog.restore()
        stubProcessHandler.restore()
      }
    })

    it('should ignore not parsed event', async () => {
      const network = NetworksEnum.mainnet
      const txLog: any = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const loggerStub = sandbox.stub(logger, 'error')
      const stubParseLog = sandbox.stub(Web3Helper, 'parseLog').returns(false as any)

      await LogPluginRepoRegistry.processLog(txLog, network)

      expect(stubParseLog.calledOnce).to.be.true
      expect(loggerStub.notCalled).to.be.true
    })

    it('should not processLog unknown event', async () => {
      const network = NetworksEnum.mainnet
      const txLog: any = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        name: 'Unknown',
        args: true,
      }
      const fakeInfo = 'test-info'

      const loggerStub = sandbox.stub(logger, 'error')
      const stubParseLog = sandbox.stub(Web3Helper, 'parseLog').returns(fakeEvent as any)
      const stubParseInfoLog = sandbox.stub(Web3Helper, 'parseInfoLog').returns(fakeInfo as any)

      await LogPluginRepoRegistry.processLog(txLog, network)

      expect(stubParseLog.calledOnceWith(txLog)).to.be.true
      expect(stubParseInfoLog.calledOnceWith(txLog, fakeEvent.name, network)).to.be.true
      expect(loggerStub.calledOnceWith('Unhandled event' as any)).to.be.true
    })
  })

  it('processError', async () => {
    const error = new Error('Test error')
    const loggerStub = sandbox.stub(logger, 'error')

    await LogPluginRepoRegistry.processError(error, NetworksEnum.mainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error PluginRepoRegistered' as any)).to.be.true
  })
})
