import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { DaoLogs } from '@services/indexer/daoLogs'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import Network from '@models/schema/network'
import { beforeEach } from 'mocha'
import { UtilsIndexer } from '@models/utils/indexer'
import { Interface } from 'ethers'

describe('Indexer: Dao Logs', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })
  describe('start', () => {
    it('should skip unsupported networks', async () => {
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves(null)
      const stubLogger = sandbox.stub(logger, 'verbose')
      const crawlerStub = { crawl: sandbox.stub().resolves() }
      await DaoLogs.start()

      expect(stubLogger.calledWith('Unsupported Network' as any)).to.be.true
      expect(crawlerStub.crawl.notCalled).to.be.true
      expect(networkFindStub.calledOnce).to.be.true
    })

    it('should process supported networks and run crawlers', async () => {
      const networkFindStub = sandbox.stub(Models.Network, 'findByName').resolves({ lastBlockDaoLog: 123 })
      const crawlerStub = { crawl: sandbox.stub().resolves() }
      const saveSyncStub = sandbox.stub(UtilsIndexer, 'saveSync').resolves()
      sandbox.stub(DaoLogs, 'createCrawler').returns(crawlerStub as any)
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      await DaoLogs.start()

      expect(networkFindStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(crawlerStub.crawl.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(saveSyncStub.callCount).to.eq(Object.values(Network.NETWORKS).length)
      expect(loggerVerboseStub.callCount).to.eq(Object.values(Network.NETWORKS).length + 1)
      expect(loggerVerboseStub.calledWith('Start DaoLogs' as any)).to.be.true
      expect(loggerVerboseStub.calledWith('Finish DaoLogs' as any)).to.be.true
    })
  })

  describe('processDAORegistered', () => {
    it('should process dao registered', async () => {
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
          dao: '0x123',
          creator: '0x456',
          subdomain: 'test',
        },
      }

      const findTxHashSpy = sandbox.spy(Models.LogDao, 'findTxHash')

      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const stubParseLog = sandbox.stub(Interface.prototype, 'parseLog').returns(fakeEvent as any)

      await DaoLogs.processDAORegistered(txLog as any, network)

      expect(stubParseLog.calledOnce).to.be.true
      expect(stubParseLog.calledWith(txLog)).to.be.true
      expect(findTxHashSpy.calledOnce).to.be.true
      expect(findTxHashSpy.calledWith(txLog.transactionHash)).to.be.true
      expect(loggerVerboseStub.calledOnce).to.be.true

      const savedDaoLog = await Models.LogDao.findTxHash(txLog.transactionHash)
      expect(!!savedDaoLog).to.be.true

      expect(savedDaoLog.network).to.eq(network)
      expect(savedDaoLog.address).to.eq(fakeEvent.args.dao)
      expect(savedDaoLog.creatorAddress).to.eq(fakeEvent.args.creator)
      expect(savedDaoLog.ens).to.eq(fakeEvent.args.subdomain)
      expect(savedDaoLog.blockNumber).to.eq(txLog.blockNumber)
      expect(savedDaoLog.transactionHash).to.eq(txLog.transactionHash)
    })

    it('should not process existing dao registered', async () => {
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
          dao: '0x123',
          creator: '0x456',
          subdomain: 'test',
        },
      }
      const stubParseLog = sandbox.stub(Interface.prototype, 'parseLog').returns(fakeEvent as any)
      const findTxHashStub = sandbox.stub(Models.LogDao, 'findTxHash').resolves({ transactionHash: '0x00' })

      const createStub = sandbox.stub(Models.LogDao, 'create')

      await DaoLogs.processDAORegistered(txLog, network)

      expect(findTxHashStub.calledOnceWith(txLog.transactionHash)).to.be.true
      expect(createStub.notCalled).to.be.true
      expect(stubParseLog.calledOnce).to.be.true
    })
  })

  it('_parseNetwork', async () => {
    const network = 'mainnet'
    expect(DaoLogs._parseNetwork(network)).to.eq('MAINNET')
  })

  it('processError', async () => {
    const error = new Error('Test error')
    const loggerStub = sandbox.stub(logger, 'error')

    await DaoLogs.processError(error, NetworksEnum.mainnet)

    expect(loggerStub.calledOnce).to.be.true
    expect(loggerStub.calledWith('Error processDAORegistered' as any))
  })
})
