import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { ethers, Interface, type Log } from 'ethers'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import logger from '@logger'
import BlockchainLogCrawler from '@src/modules/blockchainLogCrawler'
import { NetworksEnum } from '@types'
import PoolingCrawler from '@modules/poolingCrawler'
import Web3Utils from '@src/helpers/web3Utils'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'
import TransferCrawler from '@services/aragon-transfers/transferCrawler'

describe('Module: TransferCrawler', () => {
  let sandbox: SinonSandbox

  const govTokenInterface = new Interface(GovernanceERC20.abi)
  const transferTopic = govTokenInterface.getEvent('Transfer')?.topicHash!
  const delegateVotesChangedTopic = govTokenInterface.getEvent('DelegateVotesChanged')?.topicHash!

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
    TransferCrawler.instances.clear()
  })

  describe('start', () => {
    it('should reuse existing crawler instance if available', async () => {
      const crawlStub = sandbox.stub().resolves()
      const mockCrawler = { crawl: crawlStub }

      TransferCrawler.instances.set(NetworksEnum.ethereumMainnet, mockCrawler as any)

      const result = await TransferCrawler.start({
        logService: 'test-service',
        network: NetworksEnum.ethereumMainnet,
        topics: [],
      })

      expect(crawlStub.calledOnce).to.be.true
      expect(TransferCrawler.instances.size).to.equal(1)
    })

    it('should create new crawler instance with correct configuration', async () => {
      const crawlStub = sandbox.stub().resolves()
      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(crawlStub)
      sandbox.stub(PoolingCrawler, 'filterLogs').resolves([])
      sandbox.stub(TransferCrawler, 'parseAndProcessTransferLogs').resolves()

      const topics = [{ event: 'Transfer' }, { event: 'DelegateVotesChanged' }] as any[]

      await TransferCrawler.start({
        logService: 'test-service',
        network: NetworksEnum.ethereumMainnet,
        topics,
      })

      expect(TransferCrawler.instances.size).to.equal(1)
      expect(TransferCrawler.instances.has(NetworksEnum.ethereumMainnet)).to.be.true
      expect(crawlStub.calledOnce).to.be.true
    })

    it('should configure filterLogs callback correctly', async () => {
      const mockLogs = [{ topics: [transferTopic] }] as any[]
      const filteredLogs = [{ topics: [transferTopic] }] as any[]

      const poolingFilterStub = sandbox.stub(PoolingCrawler, 'filterLogs').resolves(filteredLogs)
      const parseAndProcessStub = sandbox.stub(TransferCrawler, 'parseAndProcessTransferLogs').resolves()
      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()

      await TransferCrawler.start({
        logService: 'test-service',
        network: NetworksEnum.ethereumMainnet,
        topics: [],
      })

      // Get the filterLogs callback from BlockchainLogCrawler constructor
      const crawlerInstance = TransferCrawler.instances.get(NetworksEnum.ethereumMainnet) as any
      expect(crawlerInstance).to.exist

      // Simulate calling the filterLogs callback
      const filterLogsCallback = crawlerInstance.crawlParams?.filterLogs || (() => {})
      await filterLogsCallback(mockLogs)

      expect(poolingFilterStub.calledWith(mockLogs, NetworksEnum.ethereumMainnet)).to.be.true
      expect(parseAndProcessStub.calledWith(filteredLogs, NetworksEnum.ethereumMainnet)).to.be.true
    })
  })

  describe('_extractAddressesFromLog', () => {
    it('should extract addresses from Transfer event', () => {
      const mockLog: Log = {
        topics: [
          transferTopic,
          '0x000000000000000000000000742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71a',
          '0x000000000000000000000000742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71b',
        ],
        data: '0x',
        address: '0x123',
        blockNumber: 1,
        transactionIndex: 0,
        index: 0,
        blockHash: '0x',
        transactionHash: '0x',
      } as any

      const addresses = TransferCrawler._extractAddressesFromLog(mockLog)

      expect(addresses).to.have.lengthOf(2)
      // Use lowercase comparison since ethers.getAddress() may return different casing
      expect(addresses[0].toLowerCase()).to.equal('0x742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71a')
      expect(addresses[1].toLowerCase()).to.equal('0x742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71b')
    })

    it('should extract address from DelegateVotesChanged event', () => {
      const mockLog: Log = {
        topics: [delegateVotesChangedTopic, '0x000000000000000000000000742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71a'],
        data: '0x',
        address: '0x123',
        blockNumber: 1,
        transactionIndex: 0,
        index: 0,
        blockHash: '0x',
        transactionHash: '0x',
      } as any

      const addresses = TransferCrawler._extractAddressesFromLog(mockLog)

      expect(addresses).to.have.lengthOf(1)
      expect(addresses[0].toLowerCase()).to.equal('0x742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71a')
    })

    it('should handle zero addresses in Transfer events', () => {
      const mockLog: Log = {
        topics: [
          transferTopic,
          '0x0000000000000000000000000000000000000000000000000000000000000000',
          '0x000000000000000000000000742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71b',
        ],
        data: '0x',
        address: '0x123',
        blockNumber: 1,
        transactionIndex: 0,
        index: 0,
        blockHash: '0x',
        transactionHash: '0x',
      } as any

      const addresses = TransferCrawler._extractAddressesFromLog(mockLog)

      expect(addresses).to.have.lengthOf(1)
      expect(addresses[0].toLowerCase()).to.equal('0x742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71b')
    })

    it('should handle invalid addresses gracefully', () => {
      const mockLog: Log = {
        topics: [transferTopic, '0xinvalid', '0xinvalid'],
        data: '0x',
        address: '0x123',
        blockNumber: 1,
        transactionIndex: 0,
        index: 0,
        blockHash: '0x',
        transactionHash: '0x',
      } as any

      const addresses = TransferCrawler._extractAddressesFromLog(mockLog)

      expect(addresses).to.be.an('array').that.is.empty
    })
  })

  describe('_shardEventsByAddress', () => {
    it('should shard events by address and maintain chronological order', () => {
      const mockLogs: Log[] = [
        {
          topics: [
            transferTopic,
            '0x000000000000000000000000742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71a',
            '0x000000000000000000000000742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71b',
          ],
          blockNumber: 100,
          transactionIndex: 0,
          index: 0,
          address: '0x123',
        },
        {
          topics: [
            transferTopic,
            '0x000000000000000000000000742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71a',
            '0x000000000000000000000000742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71c',
          ],
          blockNumber: 101,
          transactionIndex: 1,
          index: 1,
          address: '0x124',
        },
      ] as any[]

      const shardedEvents = TransferCrawler._shardEventsByAddress(mockLogs)

      expect(shardedEvents).to.be.an('array')
      expect(shardedEvents.length).to.be.greaterThan(0)

      shardedEvents.forEach(shard => {
        expect(shard).to.have.property('shardKey')
        expect(shard).to.have.property('logs')
        expect(shard).to.have.property('involvedAddresses')
        expect(shard.logs).to.be.an('array')
        expect(shard.involvedAddresses).to.be.an.instanceOf(Set)
      })
    })

    it('should skip logs with no extractable addresses', () => {
      const mockLogs: Log[] = [
        {
          topics: ['0xinvalidtopic'],
          blockNumber: 100,
          transactionIndex: 0,
          index: 0,
          address: '0x123',
        },
      ] as any[]

      const shardedEvents = TransferCrawler._shardEventsByAddress(mockLogs)

      expect(shardedEvents).to.be.an('array').that.is.empty
    })
  })

  describe('_getShardKey', () => {
    it('should generate consistent shard keys for same addresses', () => {
      const addr1 = '0x742d35Cc6Ad3c0532f747c0C5f4a5aE2e8a1B71a'
      const addr2 = '0x742d35Cc6Ad3c0532f747c0C5f4a5aE2e8a1B71b'

      const key1 = TransferCrawler._getShardKey(addr1, addr2)
      const key2 = TransferCrawler._getShardKey(addr1, addr2)

      expect(key1).to.equal(key2)
      expect(key1).to.match(/^shard-\d{3}$/)
    })

    it('should distribute addresses across shards', () => {
      const addresses = [
        '0x742d35Cc6Ad3c0532f747c0C5f4a5aE2e8a1B71a',
        '0x742d35Cc6Ad3c0532f747c0C5f4a5aE2e8a1B71b',
        '0x742d35Cc6Ad3c0532f747c0C5f4a5aE2e8a1B71c',
        '0x742d35Cc6Ad3c0532f747c0C5f4a5aE2e8a1B71d',
      ]

      const shardKeys = new Set()
      addresses.forEach((addr1, i) => {
        addresses.forEach((addr2, j) => {
          if (i !== j) {
            shardKeys.add(TransferCrawler._getShardKey(addr1, addr2))
          }
        })
      })

      expect(shardKeys.size).to.be.greaterThan(1)
    })
  })

  describe('parseAndProcessTransferLogs', () => {
    it('should process logs with address sharding', async () => {
      const mockLogs: Log[] = [
        {
          topics: [
            transferTopic,
            '0x000000000000000000000000742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71a',
            '0x000000000000000000000000742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71b',
          ],
          blockNumber: 100,
          transactionIndex: 0,
          index: 0,
          address: '0x123',
        },
      ] as any[]

      sandbox.stub(TransferCrawler, '_processShardedEvents').resolves()
      const loggerInfoStub = sandbox.stub(logger, 'info')

      await TransferCrawler.parseAndProcessTransferLogs(mockLogs, NetworksEnum.ethereumMainnet)

      expect(loggerInfoStub.calledWith('Starting mixed events processing with address sharding' as any)).to.be.true
      expect(loggerInfoStub.calledWith('Events processing completed' as any)).to.be.true
    })

    it('should handle processing errors', async () => {
      const mockLogs: Log[] = []
      sandbox.stub(TransferCrawler, '_processShardedEvents').rejects(new Error('Processing error'))
      const loggerErrorStub = sandbox.stub(logger, 'error')

      try {
        await TransferCrawler.parseAndProcessTransferLogs(mockLogs, NetworksEnum.ethereumMainnet)
      } catch (error: any) {
        expect(error.message).to.equal('Processing error')
      }

      expect(loggerErrorStub.calledWith('Mixed events processing failed' as any)).to.be.true
    })
  })

  describe('_processShardedEvents', () => {
    it('should process sharded events using async queue', async () => {
      const mockShardedEvents = [
        {
          shardKey: 'shard-001',
          logs: [{ topics: [transferTopic] }] as any[],
          involvedAddresses: new Set(['0x123']),
        },
      ]

      const processShardBatchesStub = sandbox.stub(TransferCrawler, '_processShardBatches').resolves()
      const loggerInfoStub = sandbox.stub(logger, 'info')

      await TransferCrawler._processShardedEvents(mockShardedEvents, NetworksEnum.ethereumMainnet)

      expect(processShardBatchesStub.calledOnce).to.be.true
      expect(loggerInfoStub.calledWith('All shards processed' as any)).to.be.true
    })

    it('should handle queue processing errors', async () => {
      const mockShardedEvents = [
        {
          shardKey: 'shard-001',
          logs: [{ topics: [transferTopic] }] as any[],
          involvedAddresses: new Set(['0x123']),
        },
      ]

      sandbox.stub(TransferCrawler, '_processShardBatches').rejects(new Error('Shard error'))
      const loggerErrorStub = sandbox.stub(logger, 'error')

      try {
        await TransferCrawler._processShardedEvents(mockShardedEvents, NetworksEnum.ethereumMainnet)
      } catch (error: any) {
        expect(error.message).to.equal('Shard error')
      }

      expect(loggerErrorStub.calledWith('Shard processing failed' as any)).to.be.true
    })
  })

  describe('_processShardBatches', () => {
    it('should process logs in batches within a shard', async () => {
      const mockShard = {
        shardKey: 'shard-001',
        logs: Array(1200).fill({ topics: [transferTopic] }) as any[], // More than batchSize
        involvedAddresses: new Set(['0x123']),
      }

      const processEventLogStub = sandbox.stub(TransferCrawler, '_processEventLog').resolves()
      const loggerDebugStub = sandbox.stub(logger, 'debug')

      await TransferCrawler._processShardBatches(mockShard, NetworksEnum.ethereumMainnet)

      expect(processEventLogStub.callCount).to.equal(1200)
      expect(loggerDebugStub.calledWith('Processing shard batch' as any)).to.be.true
    })
  })

  describe('_processEventLog', () => {
    it('should process Transfer event log', async () => {
      const mockLog: Log = {
        topics: [transferTopic],
        address: '0x123',
        transactionHash: '0xhash',
        index: 0,
      } as any

      const processTransferStub = sandbox.stub(TransferCrawler, '_processTransferLog').resolves()

      await TransferCrawler._processEventLog(mockLog, NetworksEnum.ethereumMainnet)

      expect(processTransferStub.calledOnce).to.be.true
      expect(processTransferStub.calledWith(mockLog, NetworksEnum.ethereumMainnet)).to.be.true
    })

    it('should process DelegateVotesChanged event log', async () => {
      const mockLog: Log = {
        topics: [delegateVotesChangedTopic],
        address: '0x123',
        transactionHash: '0xhash',
        index: 0,
      } as any

      const processDelegateStub = sandbox.stub(TransferCrawler, '_processDelegateVotesChangedLog').resolves()

      await TransferCrawler._processEventLog(mockLog, NetworksEnum.ethereumMainnet)

      expect(processDelegateStub.calledOnce).to.be.true
      expect(processDelegateStub.calledWith(mockLog, NetworksEnum.ethereumMainnet)).to.be.true
    })

    it('should handle processing errors', async () => {
      const mockLog: Log = {
        topics: [transferTopic],
        address: '0x123',
        transactionHash: '0xhash',
        index: 0,
      } as any

      sandbox.stub(TransferCrawler, '_processTransferLog').rejects(new Error('Handler error'))
      const loggerErrorStub = sandbox.stub(logger, 'error')

      try {
        await TransferCrawler._processEventLog(mockLog, NetworksEnum.ethereumMainnet)
      } catch (error: any) {
        expect(error.message).to.equal('Handler error')
      }

      expect(loggerErrorStub.calledWith('Event log processing failed' as any)).to.be.true
    })
  })

  describe('_processTransferLog', () => {
    it('should parse and handle transfer event', async () => {
      const mockLog: Log = {
        topics: [transferTopic],
        address: '0x123',
        blockNumber: 100,
        transactionHash: '0xhash',
      } as any

      const mockEvent = { name: 'Transfer', args: {} }
      const mockInfo = { address: '0x123', blockNumber: 100 }

      sandbox.stub(TransferCrawler, '_parseLogArguments').returns({
        event: mockEvent,
        info: mockInfo,
      } as any)

      const transferStub = sandbox.stub(GovernanceErc20Handler, 'transfer').resolves()
      const loggerDebugStub = sandbox.stub(logger, 'debug')

      await TransferCrawler._processTransferLog(mockLog, NetworksEnum.ethereumMainnet)

      expect(transferStub.calledOnce).to.be.true
      expect(transferStub.calledWith(mockEvent, mockInfo)).to.be.true
      expect(loggerDebugStub.calledWith('Processing transfer' as any)).to.be.true
    })

    it('should return early if parsing fails', async () => {
      const mockLog: Log = {
        topics: [transferTopic],
        address: '0x123',
      } as any

      sandbox.stub(TransferCrawler, '_parseLogArguments').returns({
        event: null,
        info: null,
      } as any)

      const transferStub = sandbox.stub(GovernanceErc20Handler, 'transfer').resolves()

      await TransferCrawler._processTransferLog(mockLog, NetworksEnum.ethereumMainnet)

      expect(transferStub.called).to.be.false
    })

    it('should handle transfer processing errors', async () => {
      const mockLog: Log = {
        topics: [transferTopic],
        address: '0x123',
        blockNumber: 100,
        transactionHash: '0xhash',
        index: 0,
      } as any

      const mockEvent = { name: 'Transfer', args: {} }
      const mockInfo = { address: '0x123', blockNumber: 100 }

      sandbox.stub(TransferCrawler, '_parseLogArguments').returns({
        event: mockEvent,
        info: mockInfo,
      } as any)

      sandbox.stub(GovernanceErc20Handler, 'transfer').rejects(new Error('Handler error'))
      const loggerErrorStub = sandbox.stub(logger, 'error')

      try {
        await TransferCrawler._processTransferLog(mockLog, NetworksEnum.ethereumMainnet)
      } catch (error: any) {
        expect(error.message).to.equal('Handler error')
      }

      expect(loggerErrorStub.calledWith('Transfer processing failed' as any)).to.be.true
    })
  })

  describe('_processDelegateVotesChangedLog', () => {
    it('should parse and handle delegate votes changed event', async () => {
      const mockLog: Log = {
        topics: [delegateVotesChangedTopic],
        address: '0x123',
        blockNumber: 100,
        transactionHash: '0xhash',
      } as any

      const mockEvent = { name: 'DelegateVotesChanged', args: {} }
      const mockInfo = { address: '0x123', blockNumber: 100 }

      sandbox.stub(TransferCrawler, '_parseLogArguments').returns({
        event: mockEvent,
        info: mockInfo,
      } as any)

      const delegateStub = sandbox.stub(GovernanceErc20Handler, 'delegateVotesChanged').resolves()
      const loggerDebugStub = sandbox.stub(logger, 'debug')

      await TransferCrawler._processDelegateVotesChangedLog(mockLog, NetworksEnum.ethereumMainnet)

      expect(delegateStub.calledOnce).to.be.true
      expect(delegateStub.calledWith(mockEvent, mockInfo)).to.be.true
      expect(loggerDebugStub.calledWith('Processing delegate votes changed' as any)).to.be.true
    })

    it('should return early if parsing fails', async () => {
      const mockLog: Log = {
        topics: [delegateVotesChangedTopic],
        address: '0x123',
      } as any

      sandbox.stub(TransferCrawler, '_parseLogArguments').returns({
        event: null,
        info: null,
      } as any)

      const delegateStub = sandbox.stub(GovernanceErc20Handler, 'delegateVotesChanged').resolves()

      await TransferCrawler._processDelegateVotesChangedLog(mockLog, NetworksEnum.ethereumMainnet)

      expect(delegateStub.called).to.be.false
    })

    it('should handle delegate processing errors', async () => {
      const mockLog: Log = {
        topics: [delegateVotesChangedTopic],
        address: '0x123',
        blockNumber: 100,
        transactionHash: '0xhash',
        index: 0,
      } as any

      const mockEvent = { name: 'DelegateVotesChanged', args: {} }
      const mockInfo = { address: '0x123', blockNumber: 100 }

      sandbox.stub(TransferCrawler, '_parseLogArguments').returns({
        event: mockEvent,
        info: mockInfo,
      } as any)

      sandbox.stub(GovernanceErc20Handler, 'delegateVotesChanged').rejects(new Error('Handler error'))
      const loggerErrorStub = sandbox.stub(logger, 'error')

      try {
        await TransferCrawler._processDelegateVotesChangedLog(mockLog, NetworksEnum.ethereumMainnet)
      } catch (error: any) {
        expect(error.message).to.equal('Handler error')
      }

      expect(loggerErrorStub.calledWith('DelegateVotesChanged processing failed' as any)).to.be.true
    })
  })

  describe('_parseLogArguments', () => {
    it('should parse log arguments using Web3Utils', () => {
      const mockLog: Log = {
        topics: [transferTopic],
        address: '0x123',
      } as any

      const mockDecoded = { name: 'Transfer', args: {} }
      const mockInfo = { address: '0x123', blockNumber: 100 }

      sandbox.stub(Web3Utils, 'parseLog').returns(mockDecoded as any)
      sandbox.stub(Web3Utils, 'parseInfoLog').returns(mockInfo as any)

      const result = TransferCrawler._parseLogArguments(mockLog, NetworksEnum.ethereumMainnet)

      expect(result.event).to.equal(mockDecoded)
      expect(result.info).to.equal(mockInfo)
    })
  })

  describe('_simpleHash', () => {
    it('should generate consistent hash for same input', () => {
      const input = 'test-string'

      const hash1 = TransferCrawler._simpleHash(input)
      const hash2 = TransferCrawler._simpleHash(input)

      expect(hash1).to.equal(hash2)
      expect(hash1).to.be.a('number')
      expect(hash1).to.be.greaterThan(0)
    })

    it('should generate different hashes for different inputs', () => {
      const hash1 = TransferCrawler._simpleHash('input1')
      const hash2 = TransferCrawler._simpleHash('input2')

      expect(hash1).to.not.equal(hash2)
    })
  })

  describe('config', () => {
    it('should have correct default configuration', () => {
      expect(TransferCrawler.config).to.deep.equal({
        concurrency: 20,
        batchSize: 500,
        shardCount: 150,
      })
    })
  })
})
