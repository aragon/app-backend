import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { LogMember } from '@services/aragon-indexer/logMember'
import Provider from '@modules/provider'
import logger from '@logger'
import Logger from '@logger'
import { NetworksEnum } from '@types'
import Utils from '@helpers/utils'
import { MemberHandler } from '@services/aragon-indexer/handlers/memberHandler'
import { UnitTestUtils } from '@test/lib/utils'
import Web3Helper from '@helpers/web3'
import { NetworkHelper } from '@helpers/network'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'

describe('Indexer: LogMember', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('events', async () => {
    expect(LogMember.events.length).to.eq(3)
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
        await this.onLog({ topics: ['0x123'] } as any)
      })

      await LogMember.start()

      expect(stubLogger.calledWith('End LogMember' as any)).to.be.true
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

      await LogMember.start()

      expect(stubLogger.calledWith('End LogMember' as any)).to.be.true
      expect(crawlerStub.callCount).to.eq(Object.values(NetworksEnum).length)
    })
  })

  describe('processLog', () => {
    it('should process', async () => {
      const network = NetworksEnum.ethereumMainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      for (const event of LogMember.events) {
        const fakeEvent = {
          name: event,
          args: true,
        }
        const fakeInfo = 'test-info'

        const loggerStub = sandbox.stub(logger, 'verbose')
        const stubParseLog = sandbox.stub(Web3Helper, 'parseLog').returns(fakeEvent as any)
        const stubParseInfoLog = sandbox.stub(Web3Helper, 'parseInfoLog').returns(fakeInfo as any)
        const stubProcessHandler = sandbox.stub(MemberHandler, Utils.lowercaseFirstLetter(event))

        await LogMember.processLog(txLog as any, network)

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

      await LogMember.processLog(txLog, network)

      expect(stubParseLog.calledOnceWith(txLog)).to.be.true
      expect(stubParseInfoLog.calledOnceWith(txLog, fakeEvent.name, network)).to.be.true
      expect(loggerStub.calledOnceWith('Unhandled event' as any)).to.be.true
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

      await LogMember.processLog(txLog, network)

      expect(stubParseLog.calledOnce).to.be.true
      expect(loggerStub.notCalled).to.be.true
    })
  })

  it('processError', async () => {
    const error = new Error('Test error')
    const loggerStub = sandbox.stub(logger, 'error')

    await LogMember.processError(error, NetworksEnum.ethereumMainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error LogMember' as any)).to.be.true
  })
})
