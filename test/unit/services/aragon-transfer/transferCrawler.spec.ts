import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Interface, type Log } from 'ethers'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import logger from '@logger'
import BlockchainLogCrawler from '@src/modules/blockchainLogCrawler'
import { NetworksEnum } from '@types'
import PoolingCrawler from '@modules/poolingCrawler'
import Web3Utils from '@src/helpers/web3Utils'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import TransferCrawler from '@services/aragon-transfers/transferCrawler'
import { BatchTransfersHandler } from '@services/aragon-transfers/batchTransfersHandler'
import config from '@config'
import utils from '@helpers/utils'

describe.only('Module: TransferCrawler', () => {
  let sandbox: SinonSandbox

  const govTokenInterface = new Interface(GovernanceERC20.abi)
  const transferTopic = govTokenInterface.getEvent('Transfer')?.topicHash!

  // Valid 20-byte addresses for testing
  const validAddress1 = '0x742d35Cc6aD3C0532F747c0C5F4a5ae2e8a1b71a'
  const validAddress2 = '0x4838B106FCe9647bDF1E7877BF73cE8B0BAD5f97'
  const validAddress3 = '0x123456789abcdef123456789abcdef1234567890'

  beforeEach(() => {
    sandbox = sinon.createSandbox()

    sandbox.stub(logger, 'info')
    sandbox.stub(logger, 'warn')
    sandbox.stub(logger, 'error')
    sandbox.stub(logger, 'verbose')
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

      await TransferCrawler.start({
        logService: 'test-service',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(crawlStub.calledOnce).to.be.true
      expect(TransferCrawler.instances.size).to.equal(1)
    })

    it('should create a new crawler instance if none exists', async () => {
      const crawlStub = sandbox.stub().resolves()
      const blockchainLogCrawlerStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(crawlStub)

      sandbox.stub(PoolingCrawler, 'filterLogs').resolves([])
      sandbox.stub(TransferCrawler, 'parseAndProcessTransferLogs').resolves()

      await TransferCrawler.start({
        logService: 'test-service',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(TransferCrawler.instances.size).to.equal(1)
      expect(TransferCrawler.instances.has(NetworksEnum.ethereumMainnet)).to.be.true
      expect(blockchainLogCrawlerStub.calledOnce).to.be.true
    })

    it('should initialize BlockchainLogCrawler with correct parameters', async () => {
      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      sandbox.stub(PoolingCrawler, 'filterLogs').resolves([])
      sandbox.stub(TransferCrawler, 'parseAndProcessTransferLogs').resolves()

      await TransferCrawler.start({
        logService: 'test-service',
        network: NetworksEnum.ethereumMainnet,
      })

      const crawlerInstance = TransferCrawler.instances.get(NetworksEnum.ethereumMainnet)
      expect(crawlerInstance).to.exist
    })

    it('should handle errors gracefully', async () => {
      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').throws(new Error('Crawler error'))

      const result = await TransferCrawler.start({
        logService: 'test-service',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result).to.be.undefined
      expect((logger.error as any).calledWith('TransferCrawler start', sinon.match.any)).to.be.true
    })

    it('should configure BlockchainLogCrawler with filterLogs callback that processes logs', async () => {
      const mockLogs = [{ address: validAddress1, blockNumber: 100 }] as any

      const crawlerStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()

      sandbox.stub(PoolingCrawler, 'filterLogs').resolves(mockLogs)
      sandbox.stub(TransferCrawler, 'parseAndProcessTransferLogs').resolves()

      await TransferCrawler.start({
        logService: 'test-service',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(TransferCrawler.instances.size).to.equal(1)
      expect(TransferCrawler.instances.has(NetworksEnum.ethereumMainnet)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })
  })

  describe('_groupLogsByToken', () => {
    it('should group logs by token address', () => {
      const mockLogs: Log[] = [
        { address: validAddress1 } as any,
        { address: validAddress2 } as any,
        { address: validAddress1 } as any,
      ]

      const result = TransferCrawler._groupLogsByToken(mockLogs)

      expect(Object.keys(result)).to.have.lengthOf(2)
      expect(result[validAddress1.toLowerCase()]).to.have.lengthOf(2)
      expect(result[validAddress2.toLowerCase()]).to.have.lengthOf(1)
    })

    it('should handle empty logs array', () => {
      const result = TransferCrawler._groupLogsByToken([])

      expect(Object.keys(result)).to.have.lengthOf(0)
    })

    it('should normalize addresses to lowercase', () => {
      const mockLogs: Log[] = [
        { address: validAddress1.toUpperCase() } as any,
        { address: validAddress1.toLowerCase() } as any,
      ]

      const result = TransferCrawler._groupLogsByToken(mockLogs)

      expect(Object.keys(result)).to.have.lengthOf(1)
      expect(result[validAddress1.toLowerCase()]).to.have.lengthOf(2)
    })
  })

  describe('parseAndProcessTransferLogs', () => {
    it('should process logs grouped by token using BatchTransfersHandler', async () => {
      const mockLogs: Log[] = [
        { address: validAddress1, blockNumber: 100 } as any,
        { address: validAddress2, blockNumber: 101 } as any,
      ]

      sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').resolves({})
      sandbox.stub(TransferCrawler, '_groupLogsByToken').returns({
        [validAddress1.toLowerCase()]: [mockLogs[0]],
        [validAddress2.toLowerCase()]: [mockLogs[1]],
      })

      const processTokenBatchStub = sandbox.stub(TransferCrawler, '_processTokenBatch').resolves()
      sandbox.stub(utils, 'asyncBatchProcess').callsFake(async (...args: any[]) => {
        const [items, processor] = args
        for (const item of items) {
          await processor(item)
        }
      })

      await TransferCrawler.parseAndProcessTransferLogs(mockLogs, NetworksEnum.ethereumMainnet)

      expect((logger.info as any).calledWith('Processing transfer logs by token', sinon.match.any)).to.be.true
      expect((logger.info as any).calledWith('Events processing completed', sinon.match.any)).to.be.true
      expect(processTokenBatchStub.callCount).to.equal(2)
    })

    it('should handle multiple tokens and create separate BatchTransfersHandler instances', async () => {
      const mockLogs: Log[] = [
        { address: validAddress1, blockNumber: 100 } as any,
        { address: validAddress2, blockNumber: 101 } as any,
        { address: validAddress3, blockNumber: 102 } as any,
      ]

      sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').resolves({})
      sandbox.stub(TransferCrawler, '_groupLogsByToken').returns({
        [validAddress1.toLowerCase()]: [mockLogs[0]],
        [validAddress2.toLowerCase()]: [mockLogs[1]],
        [validAddress3.toLowerCase()]: [mockLogs[2]],
      })

      const processTokenBatchStub = sandbox.stub(TransferCrawler, '_processTokenBatch').resolves()
      sandbox.stub(utils, 'asyncBatchProcess').callsFake(async (...args: any[]) => {
        const [items, processor] = args
        for (const item of items) {
          await processor(item)
        }
      })

      await TransferCrawler.parseAndProcessTransferLogs(mockLogs, NetworksEnum.ethereumMainnet)

      expect(processTokenBatchStub.callCount).to.equal(3)
    })

    it('should handle errors gracefully', async () => {
      const mockLogs: Log[] = [{ address: validAddress1, blockNumber: 100 } as any]

      sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').rejects(new Error('Timestamp error'))
      sandbox.stub(TransferCrawler, '_groupLogsByToken').throws(new Error('Grouping error'))

      try {
        await TransferCrawler.parseAndProcessTransferLogs(mockLogs, NetworksEnum.ethereumMainnet)
        expect.fail('Should have thrown an error')
      } catch (error: any) {
        expect(error.message).to.equal('Timestamp error')
      }

      expect((logger.error as any).calledWith('Mixed events processing failed', sinon.match.any)).to.be.true
    })

    it('should fetch and set timestamp cache', async () => {
      const mockLogs: Log[] = [
        { address: validAddress1, blockNumber: 100 } as any,
        { address: validAddress1, blockNumber: 102 } as any,
      ]

      const mockTimestamps = {
        'ethereum-mainnet-100': 1609459200,
        'ethereum-mainnet-101': 1609459215,
        'ethereum-mainnet-102': 1609459230,
      }

      const blockTimestampStub = sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').resolves(mockTimestamps)
      sandbox.stub(TransferCrawler, '_groupLogsByToken').returns({
        [validAddress1.toLowerCase()]: mockLogs,
      })

      const processTokenBatchStub = sandbox.stub(TransferCrawler, '_processTokenBatch').resolves()
      sandbox.stub(utils, 'asyncBatchProcess').callsFake(async (...args: any[]) => {
        const [items, processor] = args
        for (const item of items) {
          await processor(item)
        }
      })

      await TransferCrawler.parseAndProcessTransferLogs(mockLogs, NetworksEnum.ethereumMainnet)

      expect(blockTimestampStub.calledWith(100, 102, NetworksEnum.ethereumMainnet)).to.be.true
      expect(processTokenBatchStub.calledOnce).to.be.true
    })

    it('should use asyncBatchProcess for concurrent token processing', async () => {
      const mockLogs: Log[] = [
        { address: validAddress1, blockNumber: 100 } as any,
        { address: validAddress2, blockNumber: 101 } as any,
      ]

      sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').resolves({})
      sandbox.stub(TransferCrawler, '_groupLogsByToken').returns({
        [validAddress1.toLowerCase()]: [mockLogs[0]],
        [validAddress2.toLowerCase()]: [mockLogs[1]],
      })
      sandbox.stub(TransferCrawler, '_processTokenBatch').resolves()

      const asyncBatchProcessStub = sandbox.stub(utils, 'asyncBatchProcess').resolves()

      await TransferCrawler.parseAndProcessTransferLogs(mockLogs, NetworksEnum.ethereumMainnet)

      expect(asyncBatchProcessStub.calledOnce).to.be.true
      expect(asyncBatchProcessStub.firstCall.args[2]).to.deep.include({
        concurrency: config.TRANSFER_CRAWLER_CONFIG.CONCURRENCY,
        batchSize: config.TRANSFER_CRAWLER_CONFIG.BATCH_SIZE,
      })
    })
  })

  describe('_processTokenBatch', () => {
    let mockProcessor: any

    beforeEach(() => {
      mockProcessor = {
        tokenAddress: validAddress1,
        setTimestampCache: sandbox.stub(),
        processEvents: sandbox.stub().resolves(),
      }
    })

    it('should sort logs by block number, transaction index, and log index', async () => {
      const mockLogs: Log[] = [
        { blockNumber: 102, transactionIndex: 1, index: 2 } as any,
        { blockNumber: 100, transactionIndex: 0, index: 0 } as any,
        { blockNumber: 101, transactionIndex: 2, index: 1 } as any,
        { blockNumber: 100, transactionIndex: 1, index: 0 } as any,
      ]

      sandbox.stub(TransferCrawler, '_parseLogArguments').returns({
        event: { name: 'Transfer', args: {} },
        info: { blockNumber: 100 },
      } as any)

      await TransferCrawler._processTokenBatch(mockProcessor, mockLogs, NetworksEnum.ethereumMainnet)

      expect(mockProcessor.processEvents.calledOnce).to.be.true
      expect((logger.info as any).calledWith('Token processing completed', sinon.match.any)).to.be.true
    })

    it('should process events in batches when logs exceed batch size', async () => {
      // Get the actual batch size from config
      const actualBatchSize = config.TRANSFER_CRAWLER_CONFIG.BATCH_SIZE

      // Create logs that exceed the batch size
      const mockLogs: Log[] = Array(250)
        .fill(null)
        .map((_, i) => ({
          blockNumber: 100 + Math.floor(i / 50), // Vary block numbers
          transactionIndex: i % 10,
          index: i % 5,
        })) as any[]

      sandbox.stub(TransferCrawler, '_parseLogArguments').returns({
        event: { name: 'Transfer', args: {} },
        info: { blockNumber: 100 },
      } as any)

      await TransferCrawler._processTokenBatch(mockProcessor, mockLogs, NetworksEnum.ethereumMainnet)

      // Should be called based on actual batch size (250 logs / batch size)
      const expectedCalls = Math.ceil(250 / actualBatchSize)
      expect(mockProcessor.processEvents.callCount).to.equal(expectedCalls)
      expect((logger.info as any).calledWith('Token processing completed', sinon.match.any)).to.be.true
    })

    it('should handle parsing failures gracefully and filter out invalid logs', async () => {
      const mockLogs: Log[] = [{ blockNumber: 100 } as any, { blockNumber: 101 } as any]

      sandbox
        .stub(TransferCrawler, '_parseLogArguments')
        .onFirstCall()
        .returns({ event: null, info: null } as any)
        .onSecondCall()
        .returns({
          event: { name: 'Transfer', args: {} },
          info: { blockNumber: 101 },
        } as any)

      await TransferCrawler._processTokenBatch(mockProcessor, mockLogs, NetworksEnum.ethereumMainnet)

      // Should still process the valid log
      expect(mockProcessor.processEvents.calledOnce).to.be.true
      expect((logger.info as any).calledWith('Token processing completed', sinon.match.any)).to.be.true
    })

    it('should skip processing when all logs fail to parse', async () => {
      const mockLogs: Log[] = [{ blockNumber: 100 } as any]

      sandbox.stub(TransferCrawler, '_parseLogArguments').returns({
        event: null,
        info: null,
      } as any)

      await TransferCrawler._processTokenBatch(mockProcessor, mockLogs, NetworksEnum.ethereumMainnet)

      expect(mockProcessor.processEvents.called).to.be.false
      expect(mockProcessor.setTimestampCache.called).to.be.false
    })

    it('should handle BatchTransfersHandler processing errors', async () => {
      const mockLogs: Log[] = [{ blockNumber: 100, transactionIndex: 0, index: 0 } as any]

      sandbox.stub(TransferCrawler, '_parseLogArguments').returns({
        event: { name: 'Transfer', args: {} },
        info: { blockNumber: 100 },
      } as any)
      mockProcessor.processEvents.rejects(new Error('Processing error'))

      await TransferCrawler._processTokenBatch(mockProcessor, mockLogs, NetworksEnum.ethereumMainnet)

      expect((logger.error as any).calledWith('Error processing token batch', sinon.match.any)).to.be.true
    })

    it('should handle empty batch after slicing (edge case)', async () => {
      const mockLogs: Log[] = []

      await TransferCrawler._processTokenBatch(mockProcessor, mockLogs, NetworksEnum.ethereumMainnet)

      expect(mockProcessor.processEvents.called).to.be.false
    })

    it('should handle empty parsedEvents array', async () => {
      const mockLogs: Log[] = [{ blockNumber: 100 } as any]

      sandbox.stub(TransferCrawler, '_parseLogArguments').returns({
        event: null,
        info: null,
      } as any)

      await TransferCrawler._processTokenBatch(mockProcessor, mockLogs, NetworksEnum.ethereumMainnet)

      expect(mockProcessor.processEvents.called).to.be.false
    })

    it('should process multiple batches correctly', async () => {
      const batchSize = config.TRANSFER_CRAWLER_CONFIG.BATCH_SIZE
      const mockLogs: Log[] = Array(batchSize + 10)
        .fill(null)
        .map((_, i) => ({
          blockNumber: 100 + i,
          transactionIndex: 0,
          index: 0,
        })) as any[]

      sandbox.stub(TransferCrawler, '_parseLogArguments').returns({
        event: { name: 'Transfer', args: {} },
        info: { blockNumber: 100 },
      } as any)

      await TransferCrawler._processTokenBatch(mockProcessor, mockLogs, NetworksEnum.ethereumMainnet)

      // Should be called twice (one full batch + one partial batch)
      expect(mockProcessor.processEvents.callCount).to.equal(2)
    })
  })

  describe('_parseLogArguments', () => {
    it('should parse log arguments using Web3Utils', () => {
      const mockLog: Log = {
        topics: [transferTopic],
        address: validAddress1,
      } as any

      const mockDecoded = { name: 'Transfer', args: {} }
      const mockInfo = { address: validAddress1, blockNumber: 100 }

      sandbox.stub(Web3Utils, 'parseLog').returns(mockDecoded as any)
      sandbox.stub(Web3Utils, 'parseInfoLog').returns(mockInfo as any)

      const result = TransferCrawler._parseLogArguments(mockLog, NetworksEnum.ethereumMainnet)

      expect(result.event).to.equal(mockDecoded)
      expect(result.info).to.equal(mockInfo)
    })

    it('should handle parsing errors gracefully', () => {
      const mockLog: Log = {
        topics: [transferTopic],
        address: validAddress1,
      } as any

      // Simulate parsing error
      sandbox.stub(Web3Utils, 'parseLog').throws(new Error('Parse error'))
      sandbox.stub(Web3Utils, 'parseInfoLog').returns(null as any)

      const result = TransferCrawler._parseLogArguments(mockLog, NetworksEnum.ethereumMainnet)

      // Should handle error gracefully and return null values
      expect(result.event).to.be.null
      expect(result.info).to.be.null
      expect((logger.warn as any).calledWith('Failed to parse log arguments', sinon.match.any)).to.be.true
    })

    it('should handle Web3Utils.parseLog returning null', () => {
      const mockLog: Log = {
        topics: [transferTopic],
        address: validAddress1,
      } as any

      sandbox.stub(Web3Utils, 'parseLog').returns(null)
      sandbox.stub(Web3Utils, 'parseInfoLog').returns({ address: validAddress1, blockNumber: 100 } as any)

      const result = TransferCrawler._parseLogArguments(mockLog, NetworksEnum.ethereumMainnet)

      expect(result.event).to.be.null
      expect(result.info).to.exist
    })
  })

  describe('Integration with BatchTransfersHandler', () => {
    it('should properly instantiate BatchTransfersHandler with normalized token address', async () => {
      const mockLogs: Log[] = [{ address: validAddress3, blockNumber: 100 } as any]

      sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').resolves({})
      sandbox.stub(TransferCrawler, '_groupLogsByToken').returns({
        [validAddress3.toLowerCase()]: mockLogs,
      })

      const processTokenBatchStub = sandbox.stub(TransferCrawler, '_processTokenBatch').resolves()
      sandbox.stub(utils, 'asyncBatchProcess').callsFake(async (...args: any[]) => {
        const [items, processor] = args
        for (const item of items) {
          await processor(item)
        }
      })

      await TransferCrawler.parseAndProcessTransferLogs(mockLogs, NetworksEnum.ethereumMainnet)

      // Verify BatchTransfersHandler was created for the token
      expect(processTokenBatchStub.calledOnce).to.be.true

      const firstCall = processTokenBatchStub.getCall(0)
      expect(firstCall.args[0]).to.be.instanceOf(BatchTransfersHandler)
      expect(firstCall.args[1]).to.equal(mockLogs)
      expect(firstCall.args[2]).to.equal(NetworksEnum.ethereumMainnet)
    })

    it('should handle multiple tokens with separate BatchTransfersHandler instances', async () => {
      const mockLogs: Log[] = [
        { address: validAddress1, blockNumber: 100 } as any,
        { address: validAddress2, blockNumber: 101 } as any,
      ]

      sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').resolves({})
      sandbox.stub(TransferCrawler, '_groupLogsByToken').returns({
        [validAddress1.toLowerCase()]: [mockLogs[0]],
        [validAddress2.toLowerCase()]: [mockLogs[1]],
      })

      const processTokenBatchStub = sandbox.stub(TransferCrawler, '_processTokenBatch').resolves()
      let handlerInstances: BatchTransfersHandler[] = []

      sandbox.stub(utils, 'asyncBatchProcess').callsFake(async (...args: any[]) => {
        const [items, processor] = args
        for (const item of items) {
          await processor(item)
        }
      })

      // Capture handler instances
      processTokenBatchStub.callsFake(handler => {
        handlerInstances.push(handler)
        return Promise.resolve()
      })

      await TransferCrawler.parseAndProcessTransferLogs(mockLogs, NetworksEnum.ethereumMainnet)

      // Should create separate handler instances for each token
      expect(processTokenBatchStub.callCount).to.equal(2)
      expect(handlerInstances).to.have.lengthOf(2)
      expect(handlerInstances[0]).to.be.instanceOf(BatchTransfersHandler)
      expect(handlerInstances[1]).to.be.instanceOf(BatchTransfersHandler)

      // Verify different handler instances
      expect(handlerInstances[0]).to.not.equal(handlerInstances[1])
    })

    it('should properly handle token address normalization in BatchTransfersHandler', async () => {
      const mockLogs: Log[] = [{ address: validAddress1.toUpperCase(), blockNumber: 100 } as any]

      sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').resolves({})
      sandbox.stub(TransferCrawler, '_groupLogsByToken').returns({
        [validAddress1.toLowerCase()]: mockLogs, // lowercase from grouping
      })

      const processTokenBatchStub = sandbox.stub(TransferCrawler, '_processTokenBatch').resolves()
      sandbox.stub(utils, 'asyncBatchProcess').callsFake(async (...args: any[]) => {
        const [items, processor] = args
        for (const item of items) {
          await processor(item)
        }
      })

      await TransferCrawler.parseAndProcessTransferLogs(mockLogs, NetworksEnum.ethereumMainnet)

      expect(processTokenBatchStub.calledOnce).to.be.true

      const handler = processTokenBatchStub.getCall(0).args[0]
      expect(handler).to.be.instanceOf(BatchTransfersHandler)
      expect(handler.tokenAddress).to.be.a('string')
      expect(handler.tokenAddress.startsWith('0x')).to.be.true
    })

    it('should set timestamp cache on BatchTransfersHandler', async () => {
      const mockLogs: Log[] = [{ address: validAddress1, blockNumber: 100 } as any]
      const mockTimestamps = { 'ethereum-mainnet-100': 1609459200 }

      sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').resolves(mockTimestamps)
      sandbox.stub(TransferCrawler, '_groupLogsByToken').returns({
        [validAddress1.toLowerCase()]: mockLogs,
      })

      let capturedHandler: BatchTransfersHandler
      sandbox.stub(TransferCrawler, '_processTokenBatch').callsFake(handler => {
        capturedHandler = handler
        return Promise.resolve()
      })

      sandbox.stub(utils, 'asyncBatchProcess').callsFake(async (...args: any[]) => {
        const [items, processor] = args
        for (const item of items) {
          await processor(item)
        }
      })

      const setTimestampCacheStub = sandbox.stub(BatchTransfersHandler.prototype, 'setTimestampCache').resolves()

      await TransferCrawler.parseAndProcessTransferLogs(mockLogs, NetworksEnum.ethereumMainnet)

      expect(setTimestampCacheStub.calledWith(mockTimestamps)).to.be.true
    })
  })

  describe('Error handling and edge cases', () => {
    it('should handle errors in asyncBatchProcess', async () => {
      const mockLogs: Log[] = [{ address: validAddress1, blockNumber: 100 } as any]

      sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').resolves({})
      sandbox.stub(TransferCrawler, '_groupLogsByToken').returns({
        [validAddress1.toLowerCase()]: mockLogs,
      })
      sandbox.stub(TransferCrawler, '_processTokenBatch').resolves()

      sandbox.stub(utils, 'asyncBatchProcess').callsFake(async (...args: any[]) => {
        const [, , options] = args
        // Simulate error in processing
        const error = new Error('Token processing failed')
        await options.onError(error, validAddress1.toLowerCase())
      })

      await TransferCrawler.parseAndProcessTransferLogs(mockLogs, NetworksEnum.ethereumMainnet)

      expect((logger.error as any).calledWith('Token processing failed', sinon.match.any)).to.be.true
    })

    it('should handle empty logs after grouping', async () => {
      const mockLogs: Log[] = [{ address: validAddress1, blockNumber: 100 } as any]

      sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').resolves({})
      sandbox.stub(TransferCrawler, '_groupLogsByToken').returns({}) // Empty groups

      const processTokenBatchStub = sandbox.stub(TransferCrawler, '_processTokenBatch').resolves()
      sandbox.stub(utils, 'asyncBatchProcess').resolves()

      await TransferCrawler.parseAndProcessTransferLogs(mockLogs, NetworksEnum.ethereumMainnet)

      expect(processTokenBatchStub.called).to.be.false
    })
  })
})
