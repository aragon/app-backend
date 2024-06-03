import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { LogMember } from '@services/indexer/logMember'
import Provider from '@modules/provider'
import { Models } from '@dbModels'
import { UtilsIndexer } from '@models/utils/indexer'
import logger from '@logger'
import { NetworksEnum } from '@types'
import Utils from '@helpers/utils'
import { MemberHandler } from '@services/indexer/handlers/memberHandler'
import Network from '@models/schema/network'
import { UnitTestUtils } from '@test/lib/utils'
import Web3Helper from '@helpers/web3'

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
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves({ lastBlockMetadataLog: 123 })
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()
      const processLogStub = sandbox.stub(LogMember, 'processLog').resolves()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      await LogMember.start()

      expect(networkFindStub.callCount).to.eq(5)
      expect(saveSyncStub.callCount).to.eq(5)
      expect(processLogStub.callCount).to.eq(2)
      expect(loggerVerboseStub.callCount).to.eq(10)
    })

    it('should start handle error', async () => {
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)

      sandbox.stub(Provider.configState, 'getConfigItem').callsFake(network => fakeProviders[network])
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves({ lastBlockMetadataLog: 123 })
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()
      const processLogStub = sandbox.stub(LogMember, 'processLog').throws()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      await LogMember.start()

      expect(networkFindStub.callCount).to.eq(5)
      expect(saveSyncStub.callCount).to.eq(5)
      expect(processLogStub.callCount).to.eq(2)
      expect(loggerVerboseStub.callCount).to.eq(10)
    })

    it('should skip unsupported networks', async () => {
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves(null)
      const stubLogger = sandbox.stub(logger, 'warn')
      await LogMember.start()

      expect(stubLogger.calledWith('Unsupported Network' as any)).to.be.true
      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
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

      await LogMember.processLog(txLog, network)

      expect(stubParseLog.calledOnceWith(txLog)).to.be.true
      expect(stubParseInfoLog.calledOnceWith(txLog, fakeEvent.name, network)).to.be.true
      expect(loggerStub.calledOnceWith('Unhandled event' as any)).to.be.true
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

      await LogMember.processLog(txLog, network)

      expect(stubParseLog.calledOnce).to.be.true
      expect(loggerStub.notCalled).to.be.true
    })
  })

  it('processError', async () => {
    const error = new Error('Test error')
    const loggerStub = sandbox.stub(logger, 'error')

    await LogMember.processError(error, NetworksEnum.mainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error LogMember' as any)).to.be.true
  })
})
