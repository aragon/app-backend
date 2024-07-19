import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { LogPluginRepoRegistry } from '@services/aragon-indexer/logPluginRepoRegistry'
import logger from '@logger'
import Logger from '@logger'
import { NetworksEnum } from '@types'
import Utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import { PluginRepoRegistryHandler } from '@services/aragon-indexer/handlers/pluginRepoRegistryHandler'
import { NetworkHelper } from '@helpers/network'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { UnitTestUtils } from '@test/lib/utils'
import ProviderModule from '@modules/provider'

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
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)
      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(
        Object.values(NetworksEnum).map(networkName => ({
          networkName,
          provider: fakeProviders[networkName] as any,
        })),
      )

      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onLog(true)
      })

      await LogPluginRepoRegistry.start()

      expect(stubLogger.calledWith('End LogPluginRepoRegistry' as any)).to.be.true
      expect(crawlerStub.callCount).to.eq(Object.values(NetworksEnum).length)
    })

    it('should start handle error', async () => {
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)
      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(
        Object.values(NetworksEnum).map(networkName => ({
          networkName,
          provider: fakeProviders[networkName] as any,
        })),
      )

      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await LogPluginRepoRegistry.start()

      expect(stubLogger.calledWith('End LogPluginRepoRegistry' as any)).to.be.true
      expect(crawlerStub.callCount).to.eq(Object.values(NetworksEnum).length)
    })
  })

  describe('processLog', () => {
    it('should process pluginRepoLog', async () => {
      const network = NetworksEnum.ethereumMainnet
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
      const network = NetworksEnum.ethereumMainnet
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
      const network = NetworksEnum.ethereumMainnet
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

    await LogPluginRepoRegistry.processError(error, NetworksEnum.ethereumMainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error PluginRepoRegistered' as any)).to.be.true
  })
})
