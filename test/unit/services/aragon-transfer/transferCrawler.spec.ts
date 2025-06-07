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
import Web3Helper from '@helpers/web3'
import { GovernanceErc20Handler } from '@handlers/governanceErc20Handler'
import TransferCrawler from '@services/aragon-transfers/transferCrawler'
import configIndexer from '@indexer/configIndexer'

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
      })

      expect(crawlStub.calledOnce).to.be.true
      expect(TransferCrawler.instances.size).to.equal(1)
    })

    it('should create new crawler instance with correct configuration', async () => {
      const crawlStub = sandbox.stub().resolves()
      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(crawlStub)
      sandbox.stub(configIndexer, 'filter').returns([])
      sandbox.stub(PoolingCrawler, 'filterLogs').resolves([])
      sandbox.stub(TransferCrawler, 'parseAndProcessTransferLogs').resolves()

      await TransferCrawler.start({
        logService: 'test-service',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(TransferCrawler.instances.size).to.equal(1)
      expect(TransferCrawler.instances.has(NetworksEnum.ethereumMainnet)).to.be.true
      expect(crawlStub.calledOnce).to.be.true
    })

    it('should handle errors gracefully', async () => {
      sandbox.stub(configIndexer, 'filter').throws(new Error('Config error'))
      const loggerErrorStub = sandbox.stub(logger, 'error')

      const result = await TransferCrawler.start({
        logService: 'test-service',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.be.undefined
      expect(loggerErrorStub.calledWith('TransferCrawler start' as any)).to.be.true
    })
  })

  describe('_collectTimestamps', () => {
    it('should collect timestamps for block range', async () => {
      const mockLogs: Log[] = [
        { blockNumber: 100 } as any,
        { blockNumber: 102 } as any,
        { blockNumber: 101 } as any,
      ]

      const mockTimestamps = { 100: 1000, 101: 1001, 102: 1002 }
      const web3HelperStub = sandbox.stub(Web3Helper, 'getBlocksTimestamps').resolves(mockTimestamps)

      const result = await TransferCrawler._collectTimestamps(mockLogs, NetworksEnum.ethereumMainnet)

      expect(result).to.equal(mockTimestamps)
      expect(web3HelperStub.calledWith(100, 102, NetworksEnum.ethereumMainnet)).to.be.true
    })
  })

  describe('_deduplicateTransferLogs', () => {
    it('should deduplicate Transfer logs by from->to key', () => {
      const mockLogs: Log[] = [
        {
          topics: [
            transferTopic,
            '0x000000000000000000000000742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71a',
            '0x000000000000000000000000742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71b',
          ],
          address: '0x123',
          blockNumber: 100,
          transactionIndex: 0,
          index: 0,
        },
        {
          topics: [
            transferTopic,
            '0x000000000000000000000000742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71a',
            '0x000000000000000000000000742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71b',
          ],
          address: '0x123',
          blockNumber: 101,
          transactionIndex: 0,
          index: 0,
        },
      ] as any[]

      const result = TransferCrawler._deduplicateTransferLogs(mockLogs)

      expect(result).to.have.lengthOf(1)
      expect(result[0].blockNumber).to.equal(101) // Should keep the later one
    })

    it('should keep non-Transfer logs without deduplication', () => {
      const mockLogs: Log[] = [
        {
          topics: [delegateVotesChangedTopic, '0x000000000000000000000000742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71a'],
          address: '0x123',
          blockNumber: 100,
          transactionIndex: 0,
          index: 0,
        },
        {
          topics: [delegateVotesChangedTopic, '0x000000000000000000000000742d35cc6ad3c0532f747c0c5f4a5ae2e8a1b71a'],
          address: '0x123',
          blockNumber: 101,
          transactionIndex: 0,
          index: 1,
        },
      ] as any[]

      const result = TransferCrawler._deduplicateTransferLogs(mockLogs)

      expect(result).to.have.lengthOf(2)
    })

    it('should handle invalid transfer topics gracefully', () => {
      const mockLogs: Log[] = [
        {
          topics: [transferTopic, '0xinvalid', '0xinvalid'],
          address: '0x123',
          blockNumber: 100,
          transactionIndex: 0,
          index: 0,
        },
      ] as any[]

      const result = TransferCrawler._deduplicateTransferLogs(mockLogs)

      expect(result).to.have.lengthOf(1) // Should keep the log even if addresses are invalid
    })
  })

  describe('_isLogLater', () => {
    it('should return true when logA has higher block number', () => {
      const logA = { blockNumber: 101, transactionIndex: 0, index: 0 } as any
      const logB = { blockNumber: 100, transactionIndex: 0, index: 0 } as any

      expect(TransferCrawler._isLogLater(logA, logB)).to.be.true
    })

    it('should return true when logA has higher transaction index in same block', () => {
      const logA = { blockNumber: 100, transactionIndex: 1, index: 0 } as any
      const logB = { blockNumber: 100, transactionIndex: 0, index: 0 } as any

      expect(TransferCrawler._isLogLater(logA, logB)).to.be.true
    })

    it('should return true when logA has higher log index in same transaction', () => {
      const logA = { blockNumber: 100, transactionIndex: 0, index: 1 } as any
      const logB = { blockNumber: 100, transactionIndex: 0, index: 0 } as any

      expect(TransferCrawler._isLogLater(logA, logB)).to.be.true
    })

    it('should return false when logA is earlier than logB', () => {
      const logA = { blockNumber: 100, transactionIndex: 0, index: 0 } as any
      const logB = { blockNumber: 101, transactionIndex: 0, index: 0 } as any

      expect(TransferCrawler._isLogLater(logA, logB)).to.be.false
    })
  })

  describe('parseAndProcessTransferLogs', () => {
    it('should process logs in batches', async () => {
      const mockLogs: Log[] = Array(250).fill({
        topics: [transferTopic],
        blockNumber: 100,
        transactionIndex: 0,
        index: 0,
        address: '0x123',
      }) as any[]

      sandbox.stub(TransferCrawler, '_deduplicateTransferLogs').returns(mockLogs)
      sandbox.stub(TransferCrawler, '_collectTimestamps').resolves({})
      sandbox.stub(TransferCrawler, '_processLogsConcurrently').resolves()
      const loggerInfoStub = sandbox.stub(logger, 'info')

      await TransferCrawler.parseAndProcessTransferLogs(mockLogs, NetworksEnum.ethereumMainnet)

      expect(loggerInfoStub.calledWith('Events processing completed' as any)).to.be.true
    })
  })

  describe('_processLogsConcurrently', () => {
    it('should process logs with concurrency limit', async () => {
      const mockLogs: Log[] = [
        { topics: [transferTopic], transactionHash: '0x1', index: 0 } as any,
        { topics: [transferTopic], transactionHash: '0x2', index: 1 } as any,
      ]

      const processEventLogStub = sandbox.stub(TransferCrawler, '_processEventLog').resolves()

      await TransferCrawler._processLogsConcurrently(mockLogs, NetworksEnum.ethereumMainnet, {})

      expect(processEventLogStub.callCount).to.equal(2)
    })

    it('should handle individual log processing errors without stopping batch', async () => {
      const mockLogs: Log[] = [
        { topics: [transferTopic], transactionHash: '0x1', index: 0 } as any,
        { topics: [transferTopic], transactionHash: '0x2', index: 1 } as any,
      ]

      sandbox.stub(TransferCrawler, '_processEventLog')
        .onFirstCall().rejects(new Error('Processing error'))
        .onSecondCall().resolves()

      const loggerErrorStub = sandbox.stub(logger, 'error')

      await TransferCrawler._processLogsConcurrently(mockLogs, NetworksEnum.ethereumMainnet, {})

      expect(loggerErrorStub.calledWith('Log processing failed in concurrent batch' as any)).to.be.true
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

      await TransferCrawler._processEventLog(mockLog, NetworksEnum.ethereumMainnet, {})

      expect(processTransferStub.calledOnce).to.be.true
      expect(processTransferStub.calledWith(mockLog, NetworksEnum.ethereumMainnet, {})).to.be.true
    })

    it('should process DelegateVotesChanged event log', async () => {
      const mockLog: Log = {
        topics: [delegateVotesChangedTopic],
        address: '0x123',
        transactionHash: '0xhash',
        index: 0,
      } as any

      const processDelegateStub = sandbox.stub(TransferCrawler, '_processDelegateVotesChangedLog').resolves()

      await TransferCrawler._processEventLog(mockLog, NetworksEnum.ethereumMainnet, {})

      expect(processDelegateStub.calledOnce).to.be.true
      expect(processDelegateStub.calledWith(mockLog, NetworksEnum.ethereumMainnet, {})).to.be.true
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
        await TransferCrawler._processEventLog(mockLog, NetworksEnum.ethereumMainnet, {})
        expect.fail('Should have thrown an error')
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
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      await TransferCrawler._processTransferLog(mockLog, NetworksEnum.ethereumMainnet, {})

      expect(transferStub.calledOnce).to.be.true
      expect(transferStub.calledWith(mockEvent, mockInfo, false, {})).to.be.true
      expect(loggerVerboseStub.calledWith('Processing transfer' as any)).to.be.true
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

      await TransferCrawler._processTransferLog(mockLog, NetworksEnum.ethereumMainnet, {})

      expect(transferStub.called).to.be.false
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
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      await TransferCrawler._processDelegateVotesChangedLog(mockLog, NetworksEnum.ethereumMainnet, {})

      expect(delegateStub.calledOnce).to.be.true
      expect(delegateStub.calledWith(mockEvent, mockInfo, false, {})).to.be.true
      expect(loggerVerboseStub.calledWith('Processing delegate votes changed' as any)).to.be.true
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

      await TransferCrawler._processDelegateVotesChangedLog(mockLog, NetworksEnum.ethereumMainnet, {})

      expect(delegateStub.called).to.be.false
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
})
