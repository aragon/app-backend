import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { LogDaoRegistry } from '@services/aragon-indexer/logDaoRegistry'
import logger from '@logger'
import Logger from '@logger'
import { NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import Provider from '@modules/provider'
import { DaoRegistryHandler } from '@services/aragon-indexer/handlers/daoRegistryHandler'
import { UnitTestUtils } from '@test/lib/utils'
import Web3Helper from '@helpers/web3'
import { NetworkHelper } from '@helpers/network'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'

describe('Indexer: LogDaoRegistry', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('events', async () => {
    expect(LogDaoRegistry.events.length).to.eq(1)
  })

  describe('start', () => {
    it('should start', async () => {
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(Provider.configState, 'getConfigItem').callsFake(network => fakeProviders[network])
      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(
        Object.values(NetworksEnum).map(networkName => ({
          networkName,
          provider: {} as any,
        })),
      )

      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onLog(true)
      })

      await LogDaoRegistry.start()

      expect(stubLogger.calledWith('End LogDaoRegistry' as any)).to.be.true
      expect(crawlerStub.callCount).to.eq(Object.values(NetworksEnum).length)
    })

    it('should start handle error', async () => {
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(Provider.configState, 'getConfigItem').callsFake(network => fakeProviders[network])
      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(
        Object.values(NetworksEnum).map(networkName => ({
          networkName,
          provider: {} as any,
        })),
      )

      const stubLogger = sandbox.stub(Logger, 'verbose')
      const crawlerStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        await this.onError(true)
      })

      await LogDaoRegistry.start()

      expect(stubLogger.calledWith('End LogDaoRegistry' as any)).to.be.true
      expect(crawlerStub.callCount).to.eq(Object.values(NetworksEnum).length)
    })
  })

  describe('processLog', () => {
    it('should processLog DAORegistered', async () => {
      const network = NetworksEnum.ethereumMainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }
      const fakeEvent = {
        name: 'DAORegistered',
        args: true,
      }
      const fakeInfo = 'test-info'

      const stubDaoRegistered = sandbox.stub(DaoRegistryHandler, 'daoRegistered')
      const loggerStub = sandbox.stub(logger, 'verbose')
      const stubParseLog = sandbox.stub(Web3Helper, 'parseLog').returns(fakeEvent as any)
      const stubParseInfoLog = sandbox.stub(Web3Helper, 'parseInfoLog').returns(fakeInfo as any)

      await LogDaoRegistry.processLog(txLog as any, network)

      expect(stubParseLog.calledOnceWith(txLog)).to.be.true
      expect(stubParseInfoLog.calledOnceWith(txLog, fakeEvent.name, network)).to.be.true
      expect(loggerStub.calledOnceWith('DAORegistered' as any)).to.be.true
      expect(stubDaoRegistered.calledOnceWith(fakeEvent as any, fakeInfo as any)).to.be.true
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

      await LogDaoRegistry.processLog(txLog, network)

      expect(stubParseLog.calledOnce).to.be.true
      expect(loggerStub.notCalled).to.be.true
    })

    it('should not processLog unknown event', async () => {
      const network = NetworksEnum.ethereumMainnet
      const txLog = {
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

      await LogDaoRegistry.processLog(txLog as any, network)

      expect(stubParseLog.calledOnceWith(txLog)).to.be.true
      expect(stubParseInfoLog.calledOnceWith(txLog, fakeEvent.name, network)).to.be.true
      expect(loggerStub.calledOnceWith('Unhandled event' as any)).to.be.true
    })
  })

  it('processError', async () => {
    const error = new Error('Test error')
    const loggerStub = sandbox.stub(logger, 'error')

    await LogDaoRegistry.processError(error, NetworksEnum.ethereumMainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error LogDaoRegistry' as any)).to.be.true
  })
})
