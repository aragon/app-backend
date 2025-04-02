import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { ethers, Interface } from 'ethers'
import { Models } from '@dbModels'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { DaoRegistryHandler } from '@handlers/daoRegistryHandler'
import PoolingCrawler from '@modules/poolingCrawler'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { DAO } from '@artifacts/dao'
describe('Module: PoolingCrawler', () => {
  let sandbox: SinonSandbox
  let logVerbose: any
  let logError: any

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    logVerbose = sandbox.stub(logger, 'verbose')
    logError = sandbox.stub(logger, 'error')
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

      sandbox.stub(PoolingCrawler, '_decodeTransferLogs').returns('0xDecodedAddress')

      sandbox.stub(Models.Dao, 'distinct').resolves(['0x4838b106fce9647bdf1e7877bf73ce8b0bad5f94'])
      sandbox.stub(Models.Plugin, 'distinct').resolves(['0x4838b106fce9647bdf1e7877bf73ce8b0bad5f95'])

      const nativeTransferStub = sandbox.stub(DaoRegistryHandler, 'nativeTransfer').resolves()

      const result = await PoolingCrawler.filterLogs(mockLogs as any, NetworksEnum.ethereumMainnet)

      expect(nativeTransferStub.calledOnce).to.be.true

      expect(result).to.have.lengthOf(4)
      expect(result).to.not.include(mockLogs[2])
    })

    it('should handle empty logs array', async () => {
      const result = await PoolingCrawler.filterLogs([], NetworksEnum.ethereumMainnet)
      expect(result).to.be.an('array').that.is.empty
    })

    it('should properly decode transfer logs', () => {
      const mockLog = {
        topics: [transferTopic, '0xTopic2', '0xTopic3'],
        data: '0xData',
      }

      const interfaceStub = sandbox
        .stub(Interface.prototype, 'parseLog')
        .onFirstCall()
        .throws()
        .onSecondCall()
        .returns({
          args: { to: '0xRecipient' },
        } as any)
      const result = PoolingCrawler._decodeTransferLogs(mockLog as any)

      expect(result).to.equal('0xRecipient')
      expect(interfaceStub.calledTwice).to.be.true
      expect(result).to.be.a('string')
      expect(result).to.equal('0xRecipient')
    })

    it('should return null when both decoders fail', () => {
      const mockLog = {
        topics: [transferTopic, '0xTopic2', '0xTopic3'],
        data: '0xData',
      }

      const interfaceStub = sandbox.stub(Interface.prototype, 'parseLog').onFirstCall().throws()
      const result = PoolingCrawler._decodeTransferLogs(mockLog as any)

      expect(result).to.be.null
      expect(interfaceStub.calledTwice).to.be.true
    })
  })
})
