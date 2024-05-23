import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { LogMember } from '@services/indexer/logMember'
import Provider from '@modules/provider'
import { Models } from '@dbModels'
import { UtilsIndexer } from '@models/utils/indexer'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { Interface } from 'ethers'
import Utils from '@helpers/utils'
import { MemberHandler } from '@services/indexer/handlers/memberHandler'
import Network from '@models/schema/network'

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

        const loggerStub = sandbox.stub(logger, 'verbose')
        const stubParseLog = sandbox.stub(Interface.prototype, 'parseLog').returns(fakeEvent as any)
        const stubProcessHandler = sandbox.stub(MemberHandler, Utils.lowercaseFirstLetter(event))

        await LogMember.processLog(txLog as any, network)

        expect(stubParseLog.calledOnceWith(txLog)).to.be.true
        expect(loggerStub.calledOnceWith(event as any)).to.be.true
        expect(stubProcessHandler.calledOnceWith(fakeEvent as any, txLog, network)).to.be.true

        loggerStub.restore()
        stubParseLog.restore()
        stubProcessHandler.restore()
      }
    })

    it('should handle out-of-bounds error in processLog', async () => {
      const network = NetworksEnum.mainnet
      const txLog = {
        transactionHash: '0x123',
        address: '0x456',
        data: '0x789',
        topics: ['0xabc'],
        blockNumber: 1,
      }

      const stubParseLog = sandbox.stub(Interface.prototype, 'parseLog').throws(new Error('out-of-bounds'))
      const loggerStub = sandbox.stub(logger, 'error')

      await LogMember.processLog(txLog, network)

      expect(stubParseLog.calledOnceWith(txLog)).to.be.true
      expect(loggerStub.called).to.be.false // ensure no error logged for out-of-bounds
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

      const loggerStub = sandbox.stub(logger, 'error')
      const stubParseLog = sandbox.stub(Interface.prototype, 'parseLog').returns(fakeEvent as any)

      await LogMember.processLog(txLog, network)

      expect(stubParseLog.calledOnceWith(txLog)).to.be.true
      expect(loggerStub.calledOnceWith('Unhandled event' as any)).to.be.true
    })

    it('processError', async () => {
      const error = new Error('Test error')
      const loggerStub = sandbox.stub(logger, 'error')

      await LogMember.processError(error, NetworksEnum.mainnet)

      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('Error LogMember' as any)).to.be.true
    })
  })
})
