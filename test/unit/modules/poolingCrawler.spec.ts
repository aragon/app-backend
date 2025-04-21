import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Interface } from 'ethers'
import { Models } from '@dbModels'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { NetworksEnum } from '@types'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import PoolingCrawler from '@modules/poolingCrawler'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { DAO } from '@artifacts/dao'
import utils from '@helpers/utils'
describe('Module: PoolingCrawler', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
    PoolingCrawler.instances.clear()
  })

  describe('start', () => {
    it('should reuse existing crawler instance if available', async () => {
      const crawlStub = sandbox.stub().resolves()
      const mockCrawler = { crawl: crawlStub }

      PoolingCrawler.instances.set(NetworksEnum.ethereumMainnet, mockCrawler as any)

      await PoolingCrawler.start({
        logService: 'test-service',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(crawlStub.calledOnce).to.be.true
      expect(PoolingCrawler.instances.size).to.equal(1)
    })

    it('should create a new crawler instance if none exists', async () => {
      const crawlStub = sandbox.stub().resolves()
      const BlockchainLogCrawlerStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(crawlStub)

      await PoolingCrawler.start({
        logService: 'test-service',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(PoolingCrawler.instances.size).to.equal(1)
      expect(PoolingCrawler.instances.has(NetworksEnum.ethereumMainnet)).to.be.true
      expect(BlockchainLogCrawlerStub.calledOnce).to.be.true
    })

    it('should initialize BlockchainLogCrawler with correct parameters', async () => {
      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()

      await PoolingCrawler.start({
        logService: 'test-service',
        network: NetworksEnum.ethereumMainnet,
      })

      const crawlerInstance = PoolingCrawler.instances.get(NetworksEnum.ethereumMainnet)
      expect(crawlerInstance).to.exist

      expect(crawlerInstance).to.have.property('crawlParams')
    })
  })

  describe('filterLogs', () => {
    const govTokenInterface = new Interface(GovernanceERC20.abi)
    const transferTopic = govTokenInterface.getEvent('Transfer')?.topicHash!
    const daoInterface = new Interface(DAO.abi)
    const nativeTokenDepositedTopic = daoInterface.getEvent('NativeTokenDeposited')?.topicHash!

    it('should filter logs based on topics', async () => {
      const mockLogs = [
        { topics: [transferTopic], address: '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f95' },
        { topics: [nativeTokenDepositedTopic], address: '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f94' },
        { topics: [transferTopic], address: '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f93' },
        { topics: ['0xDelegateVotesChangedTopic'], address: '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f92' },
        { topics: ['0xDelegateVotesChangedTopi'], address: '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f91' }, // Empty topics
      ]

      sandbox.stub(PoolingCrawler, '_getReceiverAddress').returns('0xDecodedAddress')

      sandbox.stub(Models.Dao, 'distinct').resolves(['0x4838b106fce9647bdf1e7877bf73ce8b0bad5f94'])
      sandbox.stub(Models.Plugin, 'distinct').resolves(['0x4838b106fce9647bdf1e7877bf73ce8b0bad5f95'])

      const nativeTransferStub = sandbox.stub(DaoRegistryHandler, 'nativeTransfer').resolves()

      sandbox.stub(utils, 'wait')

      const result = await PoolingCrawler.filterLogs(mockLogs as any, NetworksEnum.ethereumMainnet)

      await new Promise(resolve => setTimeout(resolve, 1000))

      expect(nativeTransferStub.calledOnce).to.be.true

      expect(result).to.have.lengthOf(4)
      expect(result).to.not.include(mockLogs[2])
    })

    it('should handle empty logs array', async () => {
      const result = await PoolingCrawler.filterLogs([], NetworksEnum.ethereumMainnet)
      expect(result).to.be.an('array').that.is.empty
    })
  })

  describe.only('_getToAddress', () => {
    const govTokenInterface = new Interface(GovernanceERC20.abi)
    const transferTopic = govTokenInterface.getEvent('Transfer')?.topicHash!

    it('should properly decode transfer logs', () => {
      const mockLog = {
        topics: [transferTopic, '0xTopic2', '0x00000000000000000000000074b7da0c6d1c063ab31c09a1d899abbafba2612b'],
        data: '0xData',
      }

      const result = PoolingCrawler._getReceiverAddress(mockLog as any)
      expect(result).to.be.a('string')
      expect(result).to.equal('0x74B7da0c6D1C063aB31c09A1D899AbbAFbA2612b')
    })

    it('should return null if log is has not proper topics', () => {
      const mockLog = {
        topics: ['0xInvalidTopic'],
        data: '0xData',
      }

      const result = PoolingCrawler._getReceiverAddress(mockLog as any)
      expect(result).to.be.null
    })

    it('should catch error when the eth gethAddress fails', async () => {
      const mockLog = {
        topics: [transferTopic, '0xTopic2', '0x000000000000000000000000InvalidAddress'],
        data: '0xData',
      }

      const result = PoolingCrawler._getReceiverAddress(mockLog as any)
      expect(result).to.be.null
    })
  })
})
