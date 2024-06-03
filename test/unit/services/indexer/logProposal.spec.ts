import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { LogProposal } from '@services/indexer/logProposal'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import { UtilsIndexer } from '@models/utils/indexer'
import Network from '@models/schema/network'
import Provider from '@modules/provider'
import { ProposalHandler } from '@services/indexer/handlers/proposalHandler'
import Utils from '@helpers/utils'
import { UnitTestUtils } from '@test/lib/utils'
import Web3Helper from '@helpers/web3'

describe('Indexer: LogProposal', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  it('events', async () => {
    expect(LogProposal.events.length).to.eq(4)
  })

  describe('start', () => {
    it('should start', async () => {
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)

      sandbox.stub(Provider.configState, 'getConfigItem').callsFake(network => fakeProviders[network])
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves({ lastBlockMetadataLog: 123 })

      const processMetadataStub = sandbox.stub(LogProposal, 'processLog').resolves()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()

      await LogProposal.start()

      expect(loggerVerboseStub.callCount).to.eq(10)
      expect(processMetadataStub.callCount).to.eq(4)
      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(saveSyncStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
    })

    it('should start handle error', async () => {
      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)

      sandbox.stub(Provider.configState, 'getConfigItem').callsFake(network => fakeProviders[network])
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves({ lastBlockMetadataLog: 123 })

      const processMetadataStub = sandbox.stub(LogProposal, 'processLog').rejects()
      const errorStub = sandbox.stub(LogProposal, 'processError').resolves()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()

      await LogProposal.start()

      expect(errorStub.callCount).to.eq(4)
      expect(loggerVerboseStub.callCount).to.eq(10)
      expect(processMetadataStub.callCount).to.eq(4)
      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(saveSyncStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
    })

    it('should skip unsupported networks', async () => {
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves(null)
      const stubLogger = sandbox.stub(logger, 'warn')
      await LogProposal.start()

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

      for (const event of LogProposal.events) {
        const fakeEvent = {
          name: event,
          args: true,
        }
        const fakeInterface = {}
        const fakeInfo = 'test-info'

        const loggerStub = sandbox.stub(logger, 'verbose')
        const stubInterface = sandbox.stub(LogProposal, 'getInterface').returns(fakeInterface as any)
        const stubParseLog = sandbox.stub(Web3Helper, 'parseLog').returns(fakeEvent as any)
        const stubParseInfoLog = sandbox.stub(Web3Helper, 'parseInfoLog').returns(fakeInfo as any)

        const stubProcessHandler = sandbox.stub(ProposalHandler, Utils.lowercaseFirstLetter(event))

        await LogProposal.processLog(txLog as any, network)

        expect(stubInterface.calledOnceWith(txLog.topics[0] as any)).to.be.true
        expect(stubParseLog.calledOnceWith(txLog, fakeInterface)).to.be.true
        expect(stubParseInfoLog.calledOnceWith(txLog, fakeEvent.name, network)).to.be.true
        expect(loggerStub.calledOnceWith(event as any)).to.be.true
        expect(stubProcessHandler.calledOnceWith(fakeEvent as any, fakeInfo)).to.be.true

        loggerStub.restore()
        stubInterface.restore()
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

      await LogProposal.processLog(txLog, network)

      expect(stubParseLog.calledOnce).to.be.true
      expect(loggerStub.notCalled).to.be.true
    })

    it('should not processLog unknown event', async () => {
      const network = NetworksEnum.mainnet
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
      const fakeInterface = {}
      const fakeInfo = 'test-info'

      const loggerStub = sandbox.stub(logger, 'error')
      const stubInterface = sandbox.stub(LogProposal, 'getInterface').returns(fakeInterface as any)
      const stubParseLog = sandbox.stub(Web3Helper, 'parseLog').returns(fakeEvent as any)
      const stubParseInfoLog = sandbox.stub(Web3Helper, 'parseInfoLog').returns(fakeInfo as any)

      await LogProposal.processLog(txLog as any, network)

      expect(stubInterface.calledOnceWith(txLog.topics[0] as any)).to.be.true
      expect(stubParseLog.calledOnceWith(txLog, fakeInterface)).to.be.true
      expect(stubParseInfoLog.calledOnceWith(txLog, fakeEvent.name, network)).to.be.true
      expect(loggerStub.calledOnceWith('Unhandled event' as any)).to.be.true
    })
  })

  it('processError', async () => {
    const error = new Error('Test error')
    const loggerStub = sandbox.stub(logger, 'error')

    await LogProposal.processError(error, NetworksEnum.mainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error LogProposal' as any)).to.be.true
  })
})
