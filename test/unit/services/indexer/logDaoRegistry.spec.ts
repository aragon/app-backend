import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { LogDaoRegistry } from '@services/indexer/logDaoRegistry'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import Network from '@models/schema/network'
import { beforeEach } from 'mocha'
import { UtilsIndexer } from '@models/utils/indexer'
import { Interface } from 'ethers'
import Provider from '@modules/provider'
import { DaoRegistryHandler } from '@services/indexer/handlers/daoRegistryHandler'

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

      const processMetadataStub = sandbox.stub(LogDaoRegistry, 'processLog').resolves()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()

      await LogDaoRegistry.start()

      expect(loggerVerboseStub.callCount).to.eq(10)
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

      const processMetadataStub = sandbox.stub(LogDaoRegistry, 'processLog').rejects()
      const errorStub = sandbox.stub(LogDaoRegistry, 'processError').resolves()
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()

      await LogDaoRegistry.start()

      expect(errorStub.callCount).to.eq(2)
      expect(loggerVerboseStub.callCount).to.eq(10)
      expect(processMetadataStub.callCount).to.eq(2)
      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(saveSyncStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
    })

    it('should skip unsupported networks', async () => {
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves(null)
      const stubLogger = sandbox.stub(logger, 'warn')
      await LogDaoRegistry.start()

      expect(stubLogger.calledWith('Unsupported Network' as any)).to.be.true
      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
    })
  })

  describe('processLog', () => {
    it('should processLog DAORegistered', async () => {
      const network = NetworksEnum.mainnet

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

      const stubDaoRegistered = sandbox.stub(DaoRegistryHandler, 'daoRegistered')
      const loggerStub = sandbox.stub(logger, 'verbose')
      const stubParseLog = sandbox.stub(Interface.prototype, 'parseLog').returns(fakeEvent as any)

      await LogDaoRegistry.processLog(txLog as any, network)

      expect(stubParseLog.calledOnceWith(txLog)).to.be.true
      expect(loggerStub.calledOnceWith('DAORegistered' as any)).to.be.true
      expect(stubDaoRegistered.calledOnceWith(fakeEvent as any, txLog, network)).to.be.true
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

      await LogDaoRegistry.processLog(txLog, network)

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

      await LogDaoRegistry.processLog(txLog as any, network)

      expect(stubParseLog.calledOnceWith(txLog)).to.be.true
      expect(loggerStub.calledOnceWith('Unhandled event' as any)).to.be.true
    })
  })

  it('processError', async () => {
    const error = new Error('Test error')
    const loggerStub = sandbox.stub(logger, 'error')

    await LogDaoRegistry.processError(error, NetworksEnum.mainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error LogDaoRegistry' as any)).to.be.true
  })
})
