import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { LogPluginSetting } from '@services/aragon-indexer/logPluginSetting'
import logger from '@logger'
import Logger from '@logger'
import { NetworksEnum } from '@types'
import Provider from '@modules/provider'
import { ethers, Interface } from 'ethers'
import { PluginSettingHandler } from '@services/aragon-indexer/handlers/pluginSettingHandler'
import Utils from '@helpers/utils'
import { TokenVoting } from '@artifacts/TokenVoting'
import { Multisig } from '@artifacts/Multisig'
import { UnitTestUtils } from '@test/lib/utils'
import Web3Helper from '@helpers/web3'
import { NetworkHelper } from '@helpers/network'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'

describe('Indexer: LogPluginSetting', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('events', async () => {
    expect(LogPluginSetting.eventTokenVoting.length).to.eq(1)
    expect(LogPluginSetting.eventMultisig.length).to.eq(1)
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

      await LogPluginSetting.start()

      expect(stubLogger.calledWith('End LogPluginSetting' as any)).to.be.true
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
        await this.onLog({ topics: ['0x123'] } as any)
      })

      await LogPluginSetting.start()

      expect(stubLogger.calledWith('End LogPluginSetting' as any)).to.be.true
      expect(crawlerStub.callCount).to.eq(Object.values(NetworksEnum).length)
    })
  })

  describe('processLog', () => {
    it('should process', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      for (const event of [...LogPluginSetting.eventMultisig, ...LogPluginSetting.eventTokenVoting]) {
        const fakeEvent = {
          name: event,
          args: true,
        }
        const fakeInfo = 'test-info'

        const loggerStub = sandbox.stub(logger, 'verbose')
        const stubParseLog = sandbox.stub(Web3Helper, 'parseLog').returns(fakeEvent as any)
        const stubParseInfoLog = sandbox.stub(Web3Helper, 'parseInfoLog').returns(fakeInfo as any)
        const stubProcessHandler = sandbox.stub(PluginSettingHandler, Utils.lowercaseFirstLetter(event))

        await LogPluginSetting.processLog(txLog as any, network)

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

    it('should return based on plugin type', async () => {
      const eventTopic = ethers.id('VotingSettingsUpdated(uint8,uint32,uint32,uint64,uint256)')

      const interafce = LogPluginSetting.getInterface(eventTopic)

      const exist = interafce.fragments.find((e: any) => e.name === 'VotingSettingsUpdated')
      expect(!!exist).to.be.true
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

      await LogPluginSetting.processLog(txLog, network)

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

      await LogPluginSetting.processLog(txLog, network)

      expect(stubParseLog.calledOnceWith(txLog)).to.be.true
      expect(stubParseInfoLog.calledOnceWith(txLog, fakeEvent.name, network)).to.be.true
      expect(loggerStub.calledOnceWith('Unhandled event' as any)).to.be.true
    })
  })

  describe('getInterface', () => {
    it('should return TokenVoting interface for token voting event', () => {
      const topic = ethers.id('VotingSettingsUpdated(uint8,uint32,uint32,uint64,uint256)')
      const result = LogPluginSetting.getInterface(topic)

      expect(result).to.be.instanceOf(Interface)
      expect(result.format()).to.deep.equal(new Interface(TokenVoting.abi).format())
    })

    it('should return Multisig interface for other events', () => {
      const topic = '0xotherEventTopic'
      const result = LogPluginSetting.getInterface(topic)

      expect(result).to.be.instanceOf(Interface)
      expect(result.format()).to.deep.equal(new Interface(Multisig.abi).format())
    })
  })

  it('processError', async () => {
    const error = new Error('Test error')
    const loggerStub = sandbox.stub(logger, 'error')

    await LogPluginSetting.processError(error, NetworksEnum.mainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error LogPluginSetting' as any)).to.be.true
  })
})
