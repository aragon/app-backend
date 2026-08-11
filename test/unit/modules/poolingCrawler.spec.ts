import { DAO } from '@artifacts/dao'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { Models } from '@dbModels'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import utils from '@helpers/utils'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import DaoAddressCache from '@modules/daoAddressCache'
import PoolingCrawler from '@modules/poolingCrawler'
import TokenEligibilityCache from '@modules/tokenEligibilityCache'
import { DaoList } from '@test/mock/fakeDao'
import { PluginList } from '@test/mock/fakePlugins'
import { FakeToken } from '@test/mock/fakeToken'
import { IPluginInterfaceType, ITokenType, NetworksEnum } from '@types'
import { expect } from 'chai'
import { ethers, Interface, type Log } from 'ethers'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

describe('Module: PoolingCrawler', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    DaoAddressCache.clear()
    TokenEligibilityCache.clear()
  })

  afterEach(() => {
    sandbox.restore()
    PoolingCrawler.instances.clear()
    DaoAddressCache.clear()
    TokenEligibilityCache.clear()
  })

  describe('start', () => {
    it('should reuse existing crawler instance if available', async () => {
      const crawlStub = sandbox.stub().resolves()
      const mockCrawler = { crawl: crawlStub }

      PoolingCrawler.instances.set(`${NetworksEnum.ethereumMainnet}-main`, mockCrawler as any)

      await PoolingCrawler.start({
        logService: 'test-service' as any,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(crawlStub.calledOnce).to.be.true
      expect(PoolingCrawler.instances.size).to.equal(1)
    })

    it('should create a new crawler instance if none exists', async () => {
      const crawlStub = sandbox.stub().resolves()
      const BlockchainLogCrawlerStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(crawlStub)

      await PoolingCrawler.start({
        logService: 'test-service' as any,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(PoolingCrawler.instances.size).to.equal(1)
      expect(PoolingCrawler.instances.has(`${NetworksEnum.ethereumMainnet}-main`)).to.be.true
      expect(BlockchainLogCrawlerStub.calledOnce).to.be.true
    })

    it('should initialize BlockchainLogCrawler with correct parameters', async () => {
      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()

      await PoolingCrawler.start({
        logService: 'test-service' as any,
        network: NetworksEnum.ethereumMainnet,
      })

      const crawlerInstance = PoolingCrawler.instances.get(`${NetworksEnum.ethereumMainnet}-main`)
      expect(crawlerInstance).to.exist

      expect(crawlerInstance).to.have.property('crawlParams')
    })

    it('should handle errors during start', async () => {
      const error = new Error('Test error')

      const loggerStub = sandbox.stub(logger, 'error')

      // Stub the entire PoolingCrawler.start method to simulate error handling
      const originalStart = PoolingCrawler.start
      PoolingCrawler.start = async function () {
        try {
          throw error
        } catch (e) {
          logger.error('PoolingCrawler error', { error: e })
          return undefined
        }
      }

      const result = await PoolingCrawler.start({
        logService: 'test-service' as any,
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.be.undefined
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.firstCall.args[0]).to.equal('PoolingCrawler error')

      // Restore the original method
      PoolingCrawler.start = originalStart
    })
  })

  describe('filterLogs', () => {
    const govTokenInterface = new Interface(GovernanceERC20.abi)
    const transferTopic = govTokenInterface.getEvent('Transfer')?.topicHash!
    const daoInterface = new Interface(DAO.abi)
    const nativeTokenDepositedTopic = daoInterface.getEvent('NativeTokenDeposited')?.topicHash!

    it('should filter logs based on topics', async () => {
      const daoAddress = ethers.getAddress('0x4838b106fce9647bdf1e7877bf73ce8b0bad5f94')
      const { createdAt: _createdAt, ...daoFixture } = DaoList[0]
      await Models.Dao.create({ ...daoFixture, address: daoAddress, network: NetworksEnum.ethereumMainnet })

      const mockLogs = [
        { topics: [transferTopic], address: '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f95' },
        { topics: [nativeTokenDepositedTopic], address: '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f94' },
        { topics: [transferTopic], address: '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f93' },
        { topics: ['0xDelegateVotesChangedTopic'], address: '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f92' },
        { topics: ['0xDelegateVotesChangedTopi'], address: '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f91' },
      ]

      const nativeTransferStub = sandbox.stub(DaoRegistryHandler, 'nativeTransfer').resolves()

      sandbox.stub(utils, 'wait')

      const result = await PoolingCrawler.filterLogs(mockLogs as any, NetworksEnum.ethereumMainnet, true)

      await new Promise(resolve => process.nextTick(resolve))

      expect(nativeTransferStub.calledOnce).to.be.true
      expect(nativeTransferStub.firstCall.args[1].address).to.equal(daoAddress)

      expect(result).to.have.lengthOf(2)
    })

    it('should detect DAO transfer receivers from raw topic data', async () => {
      const daoAddress = ethers.getAddress('0x74b7da0c6d1c063ab31c09a1d899abbafba2612b')
      const { createdAt: _createdAt, ...daoFixture } = DaoList[0]
      await Models.Dao.create({ ...daoFixture, address: daoAddress, network: NetworksEnum.ethereumMainnet })

      const mockLogs = [
        {
          topics: [transferTopic, '0xTopic2', '0x00000000000000000000000074b7da0c6d1c063ab31c09a1d899abbafba2612b'],
          address: '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f95',
        },
      ]

      const nativeTransferStub = sandbox.stub(DaoRegistryHandler, 'nativeTransfer').resolves()

      sandbox.stub(utils, 'wait')

      const result = await PoolingCrawler.filterLogs(mockLogs as any, NetworksEnum.ethereumMainnet, true)

      await new Promise(resolve => process.nextTick(resolve))

      expect(nativeTransferStub.calledOnce).to.be.true
      expect(nativeTransferStub.firstCall.args[1].address).to.equal(daoAddress)

      expect(result).to.have.lengthOf(0)
    })

    it('should return only syncable tokens when filtering for transfer logs', async () => {
      const tokenAddress = ethers.getAddress('0x4838b106fce9647bdf1e7877bf73ce8b0bad5f95')

      const tokenDb = await Models.Token.create({
        ...FakeToken,
        address: tokenAddress,
        ignoreTransfer: false,
        type: ITokenType.ERC20,
        hasDelegate: true,
        network: NetworksEnum.ethereumMainnet,
      })

      await Models.Plugin.create({
        ...PluginList[0],
        interfaceType: IPluginInterfaceType.tokenVoting,
        tokenAddress,
        network: NetworksEnum.ethereumMainnet,
      })

      const mockLogs = [{ topics: [transferTopic], address: tokenAddress }]

      sandbox.stub(PoolingCrawler, '_getReceiverAddress').returns('0xDecodedAddress')

      sandbox.stub(Models.Dao, 'distinct').resolves([])

      sandbox.stub(utils, 'wait')

      const result = await PoolingCrawler.filterLogs(mockLogs as any, NetworksEnum.ethereumMainnet)

      expect(result).to.have.lengthOf(1)

      await tokenDb.update({
        ignoreTransfer: true,
      })

      const resultAfterUpdate = await PoolingCrawler.filterLogs(mockLogs as any, NetworksEnum.ethereumMainnet)
      expect(resultAfterUpdate).to.have.lengthOf(1)
    })

    it('should handle empty logs array', async () => {
      const result = await PoolingCrawler.filterLogs([], NetworksEnum.ethereumMainnet)
      expect(result).to.be.an('array').that.is.empty
    })

    it('should handle logs with empty topics array', async () => {
      const mockLogs = [
        { topics: [], address: '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f95' },
        { topics: [], address: '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f94' },
      ]

      sandbox.stub(Models.Dao, 'distinct').resolves([])
      sandbox.stub(Models.Plugin, 'distinct').resolves([])
      sandbox.stub(Models.Token, 'distinct').resolves([])

      const result = await PoolingCrawler.filterLogs(mockLogs as any, NetworksEnum.ethereumMainnet)

      expect(result).to.have.lengthOf(2)
      expect(result).to.include.members(mockLogs)
    })

    it('should filter delegateVotesChanged logs correctly', async () => {
      const govTokenInterface = new Interface(GovernanceERC20.abi)
      const delegateVotesChangedTopic = govTokenInterface.getEvent('DelegateVotesChanged')?.topicHash!

      const tokenAddress1 = ethers.getAddress('0x4838b106fce9647bdf1e7877bf73ce8b0bad5f95')
      const tokenAddress2 = ethers.getAddress('0x4838b106fce9647bdf1e7877bf73ce8b0bad5f94')

      const mockLogs = [
        { topics: [delegateVotesChangedTopic], address: tokenAddress1 },
        { topics: [delegateVotesChangedTopic], address: tokenAddress2 },
      ]

      sandbox.stub(PoolingCrawler, '_getReceiverAddress').returns(null)
      sandbox.stub(Models.Dao, 'distinct').resolves([])
      sandbox.stub(Models.Plugin, 'distinct').resolves([tokenAddress1]) // Only tokenAddress1 is valid
      sandbox.stub(Models.Token, 'distinct').resolves([tokenAddress1]) // Only tokenAddress1 is valid

      const result = await PoolingCrawler.filterLogs(mockLogs as any, NetworksEnum.ethereumMainnet)

      // tokenAddress2 should be filtered out because it's not in valid tokens
      expect(result).to.have.lengthOf(1)
      expect(result[0]).to.equal(mockLogs[0])
    })

    it('should handle errors in filterLogs and return original logs', async () => {
      const delegateVotesChangedTopic = govTokenInterface.getEvent('DelegateVotesChanged')?.topicHash!
      const mockLogs = [{ topics: [delegateVotesChangedTopic], address: '0x4838b106fce9647bdf1e7877bf73ce8b0bad5f95' }]

      sandbox.stub(Models.Plugin, 'distinct').rejects(new Error('Database error'))
      const loggerStub = sandbox.stub(logger, 'error')

      const result = await PoolingCrawler.filterLogs(mockLogs as any, NetworksEnum.ethereumMainnet)

      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.firstCall.args[0]).to.equal('PoolingCrawler filterLogs')
      expect(result).to.equal(mockLogs)
    })
  })

  describe('_filterVeLogs', () => {
    let processVeStub: sinon.SinonStub

    beforeEach(async () => {
      const { GovernanceVeBatchHandler } = await import('@handlers/governanceVeBatchHandler')
      processVeStub = sandbox.stub(GovernanceVeBatchHandler, 'processVeEventsBatch').resolves()
    })

    const getVeTopics = async () => {
      const { VE_TOPICS } = await import('@handlers/governanceVeBatchHandler')
      return [...VE_TOPICS]
    }

    const createMockLog = (topic: string, address = '0x1234567890abcdef1234567890abcdef12345678') =>
      ({
        topics: [topic],
        address,
        blockNumber: 100,
        transactionHash: '0xtx',
        transactionIndex: 0,
        index: 0,
        data: '0x',
        removed: false,
      }) as unknown as Log

    it('should return logs unchanged when no VE topics present', async () => {
      const logs = [createMockLog('0xnon_ve_topic_hash'), createMockLog('0xanother_non_ve_topic')]

      const result = await PoolingCrawler._filterVeLogs(logs, NetworksEnum.ethereumMainnet)

      expect(result).to.deep.equal(logs)
      expect(processVeStub.called).to.be.false
    })

    it('should intercept VE logs and process via batch handler', async () => {
      const veTopics = await getVeTopics()
      const veTopic = veTopics[0]

      const veLogs = [createMockLog(veTopic), createMockLog(veTopic)]

      const result = await PoolingCrawler._filterVeLogs(veLogs, NetworksEnum.ethereumMainnet)

      expect(processVeStub.calledOnce).to.be.true
      expect(processVeStub.firstCall.args[0]).to.have.lengthOf(2)
      expect(processVeStub.firstCall.args[1]).to.equal(NetworksEnum.ethereumMainnet)
      expect(result).to.have.lengthOf(0)
    })

    it('should return remaining non-VE logs', async () => {
      const veTopics = await getVeTopics()
      const veTopic = veTopics[0]
      const nonVeTopic = '0xnon_ve_topic_hash'

      const logs = [createMockLog(veTopic), createMockLog(nonVeTopic), createMockLog(veTopic)]

      const result = await PoolingCrawler._filterVeLogs(logs, NetworksEnum.ethereumMainnet)

      expect(processVeStub.calledOnce).to.be.true
      expect(result).to.have.lengthOf(1)
      expect(result[0].topics[0]).to.equal(nonVeTopic)
    })

    it('should fall back to returning all logs on batch handler error', async () => {
      const veTopics = await getVeTopics()
      const veTopic = veTopics[0]

      processVeStub.rejects(new Error('Batch processing failed'))

      const loggerStub = sandbox.stub(logger, 'error')

      const logs = [createMockLog(veTopic), createMockLog('0xother_topic')]

      const result = await PoolingCrawler._filterVeLogs(logs, NetworksEnum.ethereumMainnet)

      expect(result).to.deep.equal(logs)
      expect(loggerStub.calledOnce).to.be.true
      expect(loggerStub.firstCall.args[0]).to.include('VeBatch processing failed')
    })
  })

  describe('_getToAddress', () => {
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
