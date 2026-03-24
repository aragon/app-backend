import Web3Helper from '@helpers/web3'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import logger from '@logger'
import { TickContext } from '@modules/crawlers/tickContext'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import type { Log } from 'ethers'
import sinon, { type SinonSandbox, type SinonStub } from 'sinon'

const makeMockLog = (blockNumber: number, transactionHash: string, index: number): Log =>
  ({
    blockNumber,
    transactionHash,
    index,
    blockHash: `0xblockhash${blockNumber}`,
    address: '0x1234567890abcdef1234567890abcdef12345678',
    data: '0x',
    topics: [],
    removed: false,
    transactionIndex: 0,
  }) as unknown as Log

describe('Module: TickContext', () => {
  let sandbox: SinonSandbox
  let getBlocksTimestampsStub: SinonStub
  let getBlockTimestampStub: SinonStub
  let getTransactionReceiptStub: SinonStub
  let logErrorStub: SinonStub

  const network = NetworksEnum.ethereumMainnet

  const mockLogs: Log[] = [
    makeMockLog(100, '0xtx1', 0),
    makeMockLog(100, '0xtx1', 1),
    makeMockLog(101, '0xtx2', 0),
    makeMockLog(102, '0xtx3', 0),
  ]

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    logErrorStub = sandbox.stub(logger, 'error')

    getBlocksTimestampsStub = sandbox.stub(Web3BatchHelper, 'getBlocksTimestamps').resolves({
      'eth-100': 1000,
      'eth-101': 1010,
      'eth-102': 1020,
    })
    getBlockTimestampStub = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(9999)
    getTransactionReceiptStub = sandbox.stub(Web3Helper, 'getTransactionReceipt')
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('constructor', () => {
    it('should create an instance with network and logs', () => {
      const ctx = new TickContext(network, mockLogs)
      const json = ctx.toJSON()
      expect(json.network).to.equal(network)
      expect(json.logs).to.equal(4)
      expect(json.initialized).to.equal(false)
    })
  })

  describe('init', () => {
    it('should index logs by block and txHash and prefetch timestamps', async () => {
      const ctx = new TickContext(network, mockLogs)
      await ctx.init()

      expect(ctx.toJSON().initialized).to.equal(true)
      expect(getBlocksTimestampsStub.calledOnce).to.be.true
      expect(getBlocksTimestampsStub.calledWith(100, 102, network)).to.be.true
    })

    it('should be idempotent — second call is a no-op', async () => {
      const ctx = new TickContext(network, mockLogs)
      await ctx.init()
      await ctx.init()

      expect(getBlocksTimestampsStub.calledOnce).to.be.true
    })

    it('should handle empty logs without calling batch helper', async () => {
      const ctx = new TickContext(network, [])
      await ctx.init()

      expect(getBlocksTimestampsStub.called).to.be.false
      expect(ctx.toJSON().initialized).to.equal(true)
    })
  })

  describe('getBlockTimestamp', () => {
    it('should return cached timestamp from prefetch', async () => {
      const ctx = new TickContext(network, mockLogs)
      await ctx.init()

      const ts = await ctx.getBlockTimestamp(100)
      expect(ts).to.equal(1000)
      expect(getBlockTimestampStub.called).to.be.false
    })

    it('should fallback to Web3Helper for uncached block', async () => {
      const ctx = new TickContext(network, mockLogs)
      await ctx.init()

      const ts = await ctx.getBlockTimestamp(999)
      expect(ts).to.equal(9999)
      expect(getBlockTimestampStub.calledOnce).to.be.true
      expect(getBlockTimestampStub.calledWith(999, network)).to.be.true
    })

    it('should cache the fallback result for subsequent calls', async () => {
      const ctx = new TickContext(network, mockLogs)
      await ctx.init()

      await ctx.getBlockTimestamp(999)
      await ctx.getBlockTimestamp(999)

      expect(getBlockTimestampStub.calledOnce).to.be.true
    })
  })

  describe('getLogsByBlock', () => {
    it('should return logs grouped by block number', async () => {
      const ctx = new TickContext(network, mockLogs)
      await ctx.init()

      const logsFor100 = ctx.getLogsByBlock(100)
      expect(logsFor100).to.have.length(2)
      expect(logsFor100[0].transactionHash).to.equal('0xtx1')

      const logsFor101 = ctx.getLogsByBlock(101)
      expect(logsFor101).to.have.length(1)
    })

    it('should return empty array for unknown block', async () => {
      const ctx = new TickContext(network, mockLogs)
      await ctx.init()

      expect(ctx.getLogsByBlock(999)).to.deep.equal([])
    })
  })

  describe('getLogsByTxHash', () => {
    it('should return cached logs by txHash', async () => {
      const ctx = new TickContext(network, mockLogs)
      await ctx.init()

      const logs = await ctx.getLogsByTxHash('0xtx1')
      expect(logs).to.have.length(2)
      expect(getTransactionReceiptStub.called).to.be.false
    })

    it('should fallback to Web3Helper for uncached txHash', async () => {
      const receiptLogs = [makeMockLog(200, '0xtxUnknown', 0)]
      getTransactionReceiptStub.resolves({ logs: receiptLogs })

      const ctx = new TickContext(network, mockLogs)
      await ctx.init()

      const logs = await ctx.getLogsByTxHash('0xtxUnknown')
      expect(logs).to.have.length(1)
      expect(getTransactionReceiptStub.calledOnce).to.be.true
    })

    it('should return empty array when receipt is null', async () => {
      getTransactionReceiptStub.resolves(null)

      const ctx = new TickContext(network, mockLogs)
      await ctx.init()

      const logs = await ctx.getLogsByTxHash('0xtxMissing')
      expect(logs).to.deep.equal([])
    })

    it('should cache fetched receipt logs for subsequent calls', async () => {
      const receiptLogs = [makeMockLog(200, '0xtxNew', 0)]
      getTransactionReceiptStub.resolves({ logs: receiptLogs })

      const ctx = new TickContext(network, mockLogs)
      await ctx.init()

      await ctx.getLogsByTxHash('0xtxNew')
      await ctx.getLogsByTxHash('0xtxNew')

      expect(getTransactionReceiptStub.calledOnce).to.be.true
    })
  })

  describe('getOrFetch', () => {
    it('should call fetcher on first access and cache the result', async () => {
      const ctx = new TickContext(network, [])
      const fetcher = sandbox.stub().resolves('hello')

      const val1 = await ctx.getOrFetch('key1', fetcher)
      const val2 = await ctx.getOrFetch('key1', fetcher)

      expect(val1).to.equal('hello')
      expect(val2).to.equal('hello')
      expect(fetcher.calledOnce).to.be.true
    })

    it('should keep separate entries for different keys', async () => {
      const ctx = new TickContext(network, [])

      const val1 = await ctx.getOrFetch('a', async () => 1)
      const val2 = await ctx.getOrFetch('b', async () => 2)

      expect(val1).to.equal(1)
      expect(val2).to.equal(2)
    })
  })

  describe('clear', () => {
    it('should reset all internal state', async () => {
      const ctx = new TickContext(network, mockLogs)
      await ctx.init()

      // Populate generic cache
      await ctx.getOrFetch('foo', async () => 'bar')

      ctx.clear()

      const json = ctx.toJSON()
      expect(json.initialized).to.equal(false)
      expect(ctx.getLogsByBlock(100)).to.deep.equal([])
    })
  })

  describe('toJSON', () => {
    it('should return correct shape before init', () => {
      const ctx = new TickContext(network, mockLogs)
      const json = ctx.toJSON()

      expect(json).to.deep.equal({
        initialized: false,
        network,
        logs: 4,
      })
    })

    it('should return initialized true after init', async () => {
      const ctx = new TickContext(network, mockLogs)
      await ctx.init()

      expect(ctx.toJSON().initialized).to.equal(true)
    })
  })

  describe('prefetchBlockTimestamps error handling', () => {
    it('should log error and continue when batch fetch fails', async () => {
      getBlocksTimestampsStub.rejects(new Error('batch failed'))

      const ctx = new TickContext(network, mockLogs)
      await ctx.init()

      expect(logErrorStub.calledOnce).to.be.true
      expect(ctx.toJSON().initialized).to.equal(true)
    })
  })
})
