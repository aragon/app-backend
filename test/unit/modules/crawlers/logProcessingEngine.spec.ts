import { expect } from 'chai'
import sinon, { type SinonSandbox, type SinonStub } from 'sinon'
import { type Log } from 'ethers'
import { LogProcessingEngine } from '@modules/crawlers/logProcessingEngine'
import { NetworksEnum, type IIndexerConfig, type IProcessingContext, type IParallelConfig } from '@types'
import logger from '@logger'
import Web3Utils from '@helpers/web3Utils'

describe('Module: LogProcessingEngine', () => {
  let sandbox: SinonSandbox
  let engine: LogProcessingEngine
  let mockHandler: SinonStub
  let logErrorStub: SinonStub
  let logWarnStub: SinonStub
  let logVerboseStub: SinonStub

  const mockEvent = {
    name: 'Transfer',
    topic: '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
    event: 'Transfer',
    config: [
      {
        abi: [
          {
            type: 'event',
            name: 'Transfer',
            inputs: [
              { indexed: true, name: 'from', type: 'address' },
              { indexed: true, name: 'to', type: 'address' },
              { indexed: false, name: 'value', type: 'uint256' },
            ],
          },
        ],
        handler: null as any,
      },
    ],
  }

  const createMockLog = (overrides?: Partial<Log>): Log => {
    return {
      blockNumber: 1000,
      blockHash: '0xblock',
      transactionHash: '0xtx',
      transactionIndex: 0,
      index: 0,
      address: '0xcontract',
      data: '0x',
      topics: [mockEvent.topic],
      removed: false,
      provider: null as any,
      ...overrides,
    } as Log
  }

  const createContext = (): IProcessingContext => ({
    fromBlock: 1000,
    toBlock: 2000,
    latestBlock: 3000,
  })

  beforeEach(() => {
    sandbox = sinon.createSandbox()
    mockHandler = sandbox.stub().resolves()
    logErrorStub = sandbox.stub(logger, 'error')
    logWarnStub = sandbox.stub(logger, 'warn')
    logVerboseStub = sandbox.stub(logger, 'verbose')

    const eventConfig: IIndexerConfig = {
      ...mockEvent,
      config: [
        {
          ...mockEvent.config[0],
          handler: mockHandler,
        },
      ],
    }

    engine = new LogProcessingEngine({
      events: [eventConfig],
      isTopicObject: false,
      network: NetworksEnum.ethereumMainnet,
    })
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const stats = engine.getProcessingStats()
      expect(stats.nbSuccess).to.equal(0)
      expect(stats.nbError).to.equal(0)
      expect(stats.nbTotal).to.equal(0)
      expect(stats.lastSync).to.equal(0)
    })

    it('should initialize with stopOnError=true', () => {
      const customEngine = new LogProcessingEngine({
        events: [],
        isTopicObject: false,
        network: NetworksEnum.ethereumMainnet,
        stopOnError: true,
      })
      expect(customEngine).to.be.instanceOf(LogProcessingEngine)
    })

    it('should initialize with custom onError callback', () => {
      const onErrorStub = sandbox.stub()
      const customEngine = new LogProcessingEngine({
        events: [],
        isTopicObject: false,
        network: NetworksEnum.ethereumMainnet,
        onError: onErrorStub,
      })
      expect(customEngine).to.be.instanceOf(LogProcessingEngine)
    })

    it('should initialize with onlyHistorical flag', () => {
      const customEngine = new LogProcessingEngine({
        events: [],
        isTopicObject: false,
        network: NetworksEnum.ethereumMainnet,
        onlyHistorical: true,
      })
      expect(customEngine).to.be.instanceOf(LogProcessingEngine)
    })
  })

  describe('sortLogs', () => {
    it('should sort logs by block number ascending', () => {
      const logs = [createMockLog({ blockNumber: 3000 }), createMockLog({ blockNumber: 1000 }), createMockLog({ blockNumber: 2000 })]

      const sorted = engine.sortLogs(logs)

      expect(sorted[0].blockNumber).to.equal(1000)
      expect(sorted[1].blockNumber).to.equal(2000)
      expect(sorted[2].blockNumber).to.equal(3000)
    })

    it('should sort by transaction index when block numbers are same', () => {
      const logs = [
        createMockLog({ blockNumber: 1000, transactionIndex: 5 }),
        createMockLog({ blockNumber: 1000, transactionIndex: 2 }),
        createMockLog({ blockNumber: 1000, transactionIndex: 8 }),
      ]

      const sorted = engine.sortLogs(logs)

      expect(sorted[0].transactionIndex).to.equal(2)
      expect(sorted[1].transactionIndex).to.equal(5)
      expect(sorted[2].transactionIndex).to.equal(8)
    })

    it('should sort by log index when block and transaction are same', () => {
      const logs = [
        createMockLog({ blockNumber: 1000, transactionIndex: 2, index: 10 }),
        createMockLog({ blockNumber: 1000, transactionIndex: 2, index: 5 }),
        createMockLog({ blockNumber: 1000, transactionIndex: 2, index: 15 }),
      ]

      const sorted = engine.sortLogs(logs)

      expect(sorted[0].index).to.equal(5)
      expect(sorted[1].index).to.equal(10)
      expect(sorted[2].index).to.equal(15)
    })

    it('should handle empty array', () => {
      const sorted = engine.sortLogs([])
      expect(sorted).to.be.an('array').that.is.empty
    })
  })

  describe('buildTopics', () => {
    it('should build topics from events', () => {
      const events = [{ topic: '0xtopic1', event: 'Event1' }, { topic: '0xtopic2', event: 'Event2' }]

      const topics = engine.buildTopics(events)

      expect(topics).to.have.lengthOf(2)
      expect(topics).to.include('0xtopic1')
      expect(topics).to.include('0xtopic2')
    })

    it('should filter out events without topic', () => {
      const events = [{ topic: '0xtopic1', event: 'Event1' }, { topic: null, event: 'Event2' }, { topic: '0xtopic3', event: 'Event3' }]

      const topics = engine.buildTopics(events)

      expect(topics).to.have.lengthOf(2)
      expect(topics).to.include('0xtopic1')
      expect(topics).to.include('0xtopic3')
    })

    it('should log error for events without topic', () => {
      const events = [{ topic: null, event: 'InvalidEvent', address: '0xaddr' }]

      engine.buildTopics(events)

      expect(logErrorStub.calledOnce).to.be.true
      expect(logErrorStub.firstCall.args[0]).to.include('Topic hash not found')
    })

    it('should flatten arrays of topics', () => {
      const events = [{ topic: ['0xtopic1', '0xtopic2'], event: 'Event1' }, { topic: '0xtopic3', event: 'Event2' }]

      const topics = engine.buildTopics(events)

      expect(topics).to.have.lengthOf(3)
      expect(topics).to.include('0xtopic1')
      expect(topics).to.include('0xtopic2')
      expect(topics).to.include('0xtopic3')
    })

    it('should handle empty events array', () => {
      const topics = engine.buildTopics([])
      expect(topics).to.be.an('array').that.is.empty
    })
  })

  describe('formatLog', () => {
    let parseLogStub: SinonStub
    let parseInfoLogStub: SinonStub

    beforeEach(() => {
      parseLogStub = sandbox.stub(Web3Utils, 'parseLog').returns({
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        topic: mockEvent.topic,
        args: ['0xfrom', '0xto', 100n] as any,
      } as any)
      parseInfoLogStub = sandbox.stub(Web3Utils, 'parseInfoLog').returns({
        address: '0xcontract',
        blockNumber: 1000,
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 0,
        logIndex: 0,
        transactionHash: '0xtx',
        eventName: 'Transfer',
      })
    })

    it('should format log successfully', () => {
      const log = createMockLog()

      const formatted = engine.formatLog(log)

      expect(formatted.event).to.not.be.null
      expect(formatted.handler).to.equal(mockHandler)
      expect(formatted.info).to.not.be.null
    })

    it('should return null handler when event setting not found', () => {
      const log = createMockLog({ topics: ['0xunknown'] })

      const formatted = engine.formatLog(log)

      expect(formatted.event).to.be.null
      expect(formatted.handler).to.be.null
      expect(formatted.info).to.be.null
      expect(logWarnStub.calledOnce).to.be.true
    })

    it('should handle array topics in event config', () => {
      const multiTopicEvent: IIndexerConfig = {
        topic: ['0xtopic1', '0xtopic2'],
        event: 'MultiEvent',
        config: [
          {
            abi: [
              {
                type: 'event',
                name: 'MultiEvent',
                inputs: [],
              },
            ],
            handler: mockHandler,
          },
        ],
      }

      const customEngine = new LogProcessingEngine({
        events: [multiTopicEvent],
        isTopicObject: false,
        network: NetworksEnum.ethereumMainnet,
      })

      const log = createMockLog({ topics: ['0xtopic2'] })
      const formatted = customEngine.formatLog(log)

      expect(formatted.handler).to.equal(mockHandler)
    })

    it('should try multiple configs until one succeeds', () => {
      const failHandler = sandbox.stub()
      parseLogStub.onFirstCall().returns(null)
      parseLogStub.onSecondCall().returns({ name: 'Transfer', args: [] })

      const multiConfigEvent: IIndexerConfig = {
        topic: mockEvent.topic,
        event: 'Transfer',
        config: [
          {
            abi: [
              {
                type: 'event',
                name: 'Transfer',
                inputs: [],
              },
            ],
            handler: failHandler,
          },
          {
            abi: [
              {
                type: 'event',
                name: 'Transfer',
                inputs: [],
              },
            ],
            handler: mockHandler,
          },
        ],
      }

      const customEngine = new LogProcessingEngine({
        events: [multiConfigEvent],
        isTopicObject: false,
        network: NetworksEnum.ethereumMainnet,
      })

      const log = createMockLog()
      const formatted = customEngine.formatLog(log)

      expect(formatted.handler).to.equal(mockHandler)
    })

    it('should warn when log cannot be parsed', () => {
      parseLogStub.returns(null)

      const log = createMockLog()
      const formatted = engine.formatLog(log)

      expect(logWarnStub.calledOnce).to.be.true
      expect(formatted.event).to.be.null
    })
  })

  describe('processLogs', () => {
    let parseLogStub: SinonStub
    let parseInfoLogStub: SinonStub

    beforeEach(() => {
      parseLogStub = sandbox.stub(Web3Utils, 'parseLog').returns({
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        topic: mockEvent.topic,
        args: ['0xfrom', '0xto', 100n] as any,
      } as any)
      parseInfoLogStub = sandbox.stub(Web3Utils, 'parseInfoLog').returns({
        address: '0xcontract',
        blockNumber: 1000,
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 0,
        logIndex: 0,
        transactionHash: '0xtx',
        eventName: 'Transfer',
      })
    })

    it('should process logs sequentially', async () => {
      const logs = [createMockLog({ blockNumber: 1000 }), createMockLog({ blockNumber: 1001 }), createMockLog({ blockNumber: 1002 })]

      const context = createContext()
      const highestBlock = await engine.processLogs(logs, context)

      expect(mockHandler.callCount).to.equal(3)
      expect(highestBlock).to.equal(1002)
      expect(engine.getProcessingStats().nbSuccess).to.equal(3)
    })

    it('should update lastSync to highest block number', async () => {
      const logs = [createMockLog({ blockNumber: 5000 })]

      await engine.processLogs(logs, createContext())

      expect(engine.getProcessingStats().lastSync).to.equal(5000)
    })

    it('should skip logs with no event', async () => {
      parseLogStub.returns(null)
      const logs = [createMockLog()]

      await engine.processLogs(logs, createContext())

      expect(mockHandler.called).to.be.false
      expect(engine.getProcessingStats().nbSuccess).to.equal(0)
    })

    it('should handle errors and continue when stopOnError=false', async () => {
      mockHandler.onFirstCall().rejects(new Error('Handler error'))
      mockHandler.onSecondCall().resolves()

      const logs = [createMockLog({ blockNumber: 1000 }), createMockLog({ blockNumber: 1001 })]

      await engine.processLogs(logs, createContext())

      expect(mockHandler.callCount).to.equal(2)
      expect(engine.getProcessingStats().nbError).to.equal(1)
      expect(engine.getProcessingStats().nbSuccess).to.equal(1)
    })

    it('should throw error when stopOnError=true', async () => {
      const customEngine = new LogProcessingEngine({
        events: [
          {
            ...mockEvent,
            config: [{ ...mockEvent.config[0], handler: mockHandler }],
          },
        ],
        isTopicObject: false,
        network: NetworksEnum.ethereumMainnet,
        stopOnError: true,
      })

      mockHandler.rejects(new Error('Handler error'))
      const logs = [createMockLog()]

      try {
        await customEngine.processLogs(logs, createContext())
        expect.fail('Should have thrown error')
      } catch (error: any) {
        expect(error.message).to.equal('Handler error')
      }
    })

    it('should call onError callback on error', async () => {
      const onErrorStub = sandbox.stub()
      const customEngine = new LogProcessingEngine({
        events: [
          {
            ...mockEvent,
            config: [{ ...mockEvent.config[0], handler: mockHandler }],
          },
        ],
        isTopicObject: false,
        network: NetworksEnum.ethereumMainnet,
        onError: onErrorStub,
      })

      mockHandler.rejects(new Error('Handler error'))
      const logs = [createMockLog()]

      await customEngine.processLogs(logs, createContext())

      expect(onErrorStub.calledOnce).to.be.true
    })

    it('should pass onlyHistorical flag to handler', async () => {
      const customEngine = new LogProcessingEngine({
        events: [
          {
            ...mockEvent,
            config: [{ ...mockEvent.config[0], handler: mockHandler }],
          },
        ],
        isTopicObject: false,
        network: NetworksEnum.ethereumMainnet,
        onlyHistorical: true,
      })

      const logs = [createMockLog()]
      await customEngine.processLogs(logs, createContext())

      expect(mockHandler.firstCall.args[2]).to.equal(true)
    })

    it('should handle empty logs array', async () => {
      const highestBlock = await engine.processLogs([], createContext())

      expect(highestBlock).to.equal(0)
      expect(mockHandler.called).to.be.false
    })

    it('should log verbose processing info', async () => {
      const logs = [createMockLog()]
      await engine.processLogs(logs, createContext(), 'sequential', '0xaddr', 'logService')

      expect(logVerboseStub.calledOnce).to.be.true
      expect(logVerboseStub.firstCall.args[0]).to.equal('Processing Event')
    })
  })

  describe('processLogsParallel', () => {
    let parseLogStub: SinonStub
    let parseInfoLogStub: SinonStub

    beforeEach(() => {
      parseLogStub = sandbox.stub(Web3Utils, 'parseLog').returns({
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        topic: mockEvent.topic,
        args: ['0xfrom', '0xto', 100n] as any,
      } as any)
      parseInfoLogStub = sandbox.stub(Web3Utils, 'parseInfoLog').returns({
        address: '0xcontract',
        blockNumber: 1000,
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 0,
        logIndex: 0,
        transactionHash: '0xtx',
        eventName: 'Transfer',
      })
    })

    it('should process logs in parallel', async () => {
      const logs = [createMockLog({ blockNumber: 1000 }), createMockLog({ blockNumber: 1001 }), createMockLog({ blockNumber: 1002 })]

      const parallelConfig: IParallelConfig = { enable: true, concurrency: 2 }
      const highestBlock = await engine.processLogsParallel(logs, createContext(), parallelConfig)

      expect(mockHandler.callCount).to.equal(3)
      expect(highestBlock).to.equal(1002)
    })

    it('should deduplicate logs by unique key', async () => {
      const log = createMockLog({ blockNumber: 1000, transactionHash: '0xtx1', transactionIndex: 0, index: 0 })
      const duplicateLogs = [log, log, log]

      const parallelConfig: IParallelConfig = { enable: true, concurrency: 5 }
      await engine.processLogsParallel(duplicateLogs, createContext(), parallelConfig)

      expect(mockHandler.callCount).to.equal(1)
    })

    it('should return 0 for empty logs', async () => {
      const parallelConfig: IParallelConfig = { enable: true, concurrency: 5 }
      const highestBlock = await engine.processLogsParallel([], createContext(), parallelConfig)

      expect(highestBlock).to.equal(0)
    })

    it('should use default concurrency of 10', async () => {
      const logs = [createMockLog()]
      const parallelConfig: IParallelConfig = { enable: true }

      await engine.processLogsParallel(logs, createContext(), parallelConfig)

      expect(mockHandler.calledOnce).to.be.true
    })

    it('should handle errors and continue when stopOnError=false', async () => {
      mockHandler.onFirstCall().rejects(new Error('Handler error'))
      mockHandler.onSecondCall().resolves()

      const logs = [
        createMockLog({ blockNumber: 1000, transactionHash: '0xtx1' }),
        createMockLog({ blockNumber: 1001, transactionHash: '0xtx2' }),
      ]

      const parallelConfig: IParallelConfig = { enable: true, concurrency: 1 }
      await engine.processLogsParallel(logs, createContext(), parallelConfig)

      expect(engine.getProcessingStats().nbError).to.equal(1)
      expect(engine.getProcessingStats().nbSuccess).to.equal(1)
    })

    it('should stop processing when stopOnError=true', async () => {
      const customEngine = new LogProcessingEngine({
        events: [
          {
            ...mockEvent,
            config: [{ ...mockEvent.config[0], handler: mockHandler }],
          },
        ],
        isTopicObject: false,
        network: NetworksEnum.ethereumMainnet,
        stopOnError: true,
      })

      mockHandler.rejects(new Error('Handler error'))
      const logs = [createMockLog()]

      const parallelConfig: IParallelConfig = { enable: true, concurrency: 5 }

      try {
        await customEngine.processLogsParallel(logs, createContext(), parallelConfig)
        expect.fail('Should have thrown error')
      } catch (error: any) {
        expect(error.message).to.equal('Handler error')
      }
    })

    it('should skip logs with no event', async () => {
      parseLogStub.returns(null)
      const logs = [createMockLog()]

      const parallelConfig: IParallelConfig = { enable: true, concurrency: 5 }
      await engine.processLogsParallel(logs, createContext(), parallelConfig)

      expect(mockHandler.called).to.be.false
    })

    it('should log verbose info for parallel processing', async () => {
      const logs = [createMockLog()]
      const parallelConfig: IParallelConfig = { enable: true, concurrency: 5 }

      await engine.processLogsParallel(logs, createContext(), parallelConfig, 'parallel', '0xaddr', 'logService')

      expect(logVerboseStub.calledOnce).to.be.true
      expect(logVerboseStub.firstCall.args[0]).to.equal('Processing Event (Parallel)')
    })
  })

  describe('processLogsParallelBatch', () => {
    let parseLogStub: SinonStub
    let parseInfoLogStub: SinonStub

    beforeEach(() => {
      parseLogStub = sandbox.stub(Web3Utils, 'parseLog').returns({
        name: 'Transfer',
        signature: 'Transfer(address,address,uint256)',
        topic: mockEvent.topic,
        args: ['0xfrom', '0xto', 100n] as any,
      } as any)
      parseInfoLogStub = sandbox.stub(Web3Utils, 'parseInfoLog').returns({
        address: '0xcontract',
        blockNumber: 1000,
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 0,
        logIndex: 0,
        transactionHash: '0xtx',
        eventName: 'Transfer',
      })
    })

    it('should process logs in batches for regular handlers', async () => {
      const logs = Array.from({ length: 10 }, (_, i) => createMockLog({ blockNumber: 1000 + i, transactionHash: `0xtx${i}` }))

      const parallelConfig: IParallelConfig = { enable: true, batchSize: 5, concurrency: 2 }
      const highestBlock = await engine.processLogsParallelBatch(logs, createContext(), parallelConfig)

      expect(mockHandler.callCount).to.equal(10)
      expect(highestBlock).to.equal(1009)
    })

    it('should call batch handler with array of events', async () => {
      const batchHandler = sandbox.stub().resolves()
      Object.defineProperty(batchHandler, 'name', { value: 'handlerBatch', writable: false })

      const batchEvent: IIndexerConfig = {
        ...mockEvent,
        config: [
          {
            ...mockEvent.config[0],
            handler: batchHandler,
          },
        ],
      }

      const customEngine = new LogProcessingEngine({
        events: [batchEvent],
        isTopicObject: false,
        network: NetworksEnum.ethereumMainnet,
      })

      const logs = Array.from({ length: 3 }, (_, i) => createMockLog({ blockNumber: 1000 + i, transactionHash: `0xtx${i}` }))

      const parallelConfig: IParallelConfig = { enable: true, batchSize: 10 }
      await customEngine.processLogsParallelBatch(logs, createContext(), parallelConfig)

      expect(batchHandler.calledOnce).to.be.true
      const callArg = batchHandler.firstCall.args[0]
      expect(callArg).to.be.an('array').with.lengthOf(3)
    })

    it('should split batch handler calls by batchSize', async () => {
      const batchHandler = sandbox.stub().resolves()
      Object.defineProperty(batchHandler, 'name', { value: 'handlerBatch', writable: false })

      const batchEvent: IIndexerConfig = {
        ...mockEvent,
        config: [
          {
            ...mockEvent.config[0],
            handler: batchHandler,
          },
        ],
      }

      const customEngine = new LogProcessingEngine({
        events: [batchEvent],
        isTopicObject: false,
        network: NetworksEnum.ethereumMainnet,
      })

      const logs = Array.from({ length: 15 }, (_, i) => createMockLog({ blockNumber: 1000 + i, transactionHash: `0xtx${i}` }))

      const parallelConfig: IParallelConfig = { enable: true, batchSize: 5 }
      await customEngine.processLogsParallelBatch(logs, createContext(), parallelConfig)

      expect(batchHandler.callCount).to.equal(3)
    })

    it('should return 0 for empty logs', async () => {
      const parallelConfig: IParallelConfig = { enable: true, batchSize: 5 }
      const highestBlock = await engine.processLogsParallelBatch([], createContext(), parallelConfig)

      expect(highestBlock).to.equal(0)
    })

    it('should skip logs with no event or handler', async () => {
      parseLogStub.returns(null)
      const logs = [createMockLog()]

      const parallelConfig: IParallelConfig = { enable: true, batchSize: 5 }
      await engine.processLogsParallelBatch(logs, createContext(), parallelConfig)

      expect(mockHandler.called).to.be.false
    })

    it('should handle batch handler errors', async () => {
      const batchHandler = sandbox.stub().rejects(new Error('Batch error'))
      Object.defineProperty(batchHandler, 'name', { value: 'handlerBatch', writable: false })

      const batchEvent: IIndexerConfig = {
        ...mockEvent,
        config: [
          {
            ...mockEvent.config[0],
            handler: batchHandler,
          },
        ],
      }

      const customEngine = new LogProcessingEngine({
        events: [batchEvent],
        isTopicObject: false,
        network: NetworksEnum.ethereumMainnet,
      })

      const logs = Array.from({ length: 3 }, (_, i) => createMockLog({ blockNumber: 1000 + i, transactionHash: `0xtx${i}` }))

      const parallelConfig: IParallelConfig = { enable: true, batchSize: 10 }
      await customEngine.processLogsParallelBatch(logs, createContext(), parallelConfig)

      expect(customEngine.getProcessingStats().nbError).to.equal(3)
    })

    it('should throw when stopOnError=true and batch handler fails', async () => {
      const batchHandler = sandbox.stub().rejects(new Error('Batch error'))
      Object.defineProperty(batchHandler, 'name', { value: 'handlerBatch', writable: false })

      const batchEvent: IIndexerConfig = {
        ...mockEvent,
        config: [
          {
            ...mockEvent.config[0],
            handler: batchHandler,
          },
        ],
      }

      const customEngine = new LogProcessingEngine({
        events: [batchEvent],
        isTopicObject: false,
        network: NetworksEnum.ethereumMainnet,
        stopOnError: true,
      })

      const logs = [createMockLog()]
      const parallelConfig: IParallelConfig = { enable: true, batchSize: 10 }

      try {
        await customEngine.processLogsParallelBatch(logs, createContext(), parallelConfig)
        expect.fail('Should have thrown error')
      } catch (error: any) {
        expect(error.message).to.equal('Batch error')
      }
    })

    it('should handle regular handler errors in batch mode', async () => {
      mockHandler.onFirstCall().rejects(new Error('Handler error'))
      mockHandler.onSecondCall().resolves()

      const logs = [
        createMockLog({ blockNumber: 1000, transactionHash: '0xtx1' }),
        createMockLog({ blockNumber: 1001, transactionHash: '0xtx2' }),
      ]

      const parallelConfig: IParallelConfig = { enable: true, batchSize: 5, concurrency: 1 }
      await engine.processLogsParallelBatch(logs, createContext(), parallelConfig)

      expect(engine.getProcessingStats().nbError).to.equal(1)
      expect(engine.getProcessingStats().nbSuccess).to.equal(1)
    })

    it('should use default batchSize of 5000', async () => {
      const logs = [createMockLog()]
      const parallelConfig: IParallelConfig = { enable: true }

      await engine.processLogsParallelBatch(logs, createContext(), parallelConfig)

      expect(mockHandler.calledOnce).to.be.true
    })

    it('should group logs by event type and handler', async () => {
      const handler2 = sandbox.stub().resolves()
      const event2: IIndexerConfig = {
        topic: '0xtopic2',
        event: 'Event2',
        config: [
          {
            abi: [
              {
                type: 'event',
                name: 'Event2',
                inputs: [],
              },
            ],
            handler: handler2,
          },
        ],
      }

      const customEngine = new LogProcessingEngine({
        events: [
          {
            ...mockEvent,
            config: [{ ...mockEvent.config[0], handler: mockHandler }],
          },
          event2,
        ],
        isTopicObject: false,
        network: NetworksEnum.ethereumMainnet,
      })

      parseLogStub.onFirstCall().returns({ name: 'Transfer', args: [] })
      parseLogStub.onSecondCall().returns({ name: 'Event2', args: [] })

      const logs = [createMockLog({ topics: [mockEvent.topic] }), createMockLog({ topics: ['0xtopic2'] })]

      const parallelConfig: IParallelConfig = { enable: true, batchSize: 10 }
      await customEngine.processLogsParallelBatch(logs, createContext(), parallelConfig)

      expect(mockHandler.calledOnce).to.be.true
      expect(handler2.calledOnce).to.be.true
    })
  })

  describe('getProcessingStats', () => {
    it('should return current stats', () => {
      const stats = engine.getProcessingStats()

      expect(stats).to.have.property('nbSuccess')
      expect(stats).to.have.property('nbError')
      expect(stats).to.have.property('nbTotal')
      expect(stats).to.have.property('lastSync')
    })

    it('should return a copy of stats', () => {
      const stats1 = engine.getProcessingStats()
      const stats2 = engine.getProcessingStats()

      expect(stats1).to.not.equal(stats2)
      expect(stats1).to.deep.equal(stats2)
    })
  })

  describe('resetStats', () => {
    it('should reset all statistics to zero', async () => {
      sandbox.stub(Web3Utils, 'parseLog').returns({ name: 'Transfer', args: [] as any } as any)
      sandbox.stub(Web3Utils, 'parseInfoLog').returns({ address: '0x', blockNumber: 1000, network: NetworksEnum.ethereumMainnet, transactionIndex: 0, logIndex: 0, transactionHash: '0xtx', eventName: 'Transfer' })

      const logs = [createMockLog({ blockNumber: 5000 })]
      await engine.processLogs(logs, createContext())

      let stats = engine.getProcessingStats()
      expect(stats.nbSuccess).to.equal(1)
      expect(stats.lastSync).to.equal(5000)

      engine.resetStats()

      stats = engine.getProcessingStats()
      expect(stats.nbSuccess).to.equal(0)
      expect(stats.nbError).to.equal(0)
      expect(stats.nbTotal).to.equal(0)
      expect(stats.lastSync).to.equal(0)
    })

    it('should clear processed keys for deduplication', async () => {
      sandbox.stub(Web3Utils, 'parseLog').returns({ name: 'Transfer', args: [] as any } as any)
      sandbox.stub(Web3Utils, 'parseInfoLog').returns({ address: '0x', blockNumber: 1000, network: NetworksEnum.ethereumMainnet, transactionIndex: 0, logIndex: 0, transactionHash: '0xtx', eventName: 'Transfer' })

      const log = createMockLog({ blockNumber: 1000, transactionHash: '0xtx1' })
      await engine.processLogsParallel([log], createContext(), { enable: true, concurrency: 1 })

      engine.resetStats()

      await engine.processLogsParallel([log], createContext(), { enable: true, concurrency: 1 })

      expect(mockHandler.callCount).to.equal(2)
    })
  })

  describe('updateTotalCount', () => {
    it('should increment total count', () => {
      engine.updateTotalCount(10)
      expect(engine.getProcessingStats().nbTotal).to.equal(10)

      engine.updateTotalCount(5)
      expect(engine.getProcessingStats().nbTotal).to.equal(15)
    })

    it('should handle zero increment', () => {
      engine.updateTotalCount(0)
      expect(engine.getProcessingStats().nbTotal).to.equal(0)
    })

    it('should handle negative increment', () => {
      engine.updateTotalCount(10)
      engine.updateTotalCount(-5)
      expect(engine.getProcessingStats().nbTotal).to.equal(5)
    })
  })

  describe('Integration scenarios', () => {
    let parseLogStub: SinonStub
    let parseInfoLogStub: SinonStub

    beforeEach(() => {
      parseLogStub = sandbox.stub(Web3Utils, 'parseLog').returns({
        name: 'Transfer',
        args: [] as any,
      } as any)
      parseInfoLogStub = sandbox.stub(Web3Utils, 'parseInfoLog').returns({
        address: '0xcontract',
        blockNumber: 1000,
        network: NetworksEnum.ethereumMainnet,
        transactionIndex: 0,
        logIndex: 0,
        transactionHash: '0xtx',
        eventName: 'Transfer',
      })
    })

    it('should process mixed success and errors correctly', async () => {
      mockHandler.onCall(0).resolves()
      mockHandler.onCall(1).rejects(new Error('Error'))
      mockHandler.onCall(2).resolves()

      const logs = [
        createMockLog({ blockNumber: 1000 }),
        createMockLog({ blockNumber: 1001 }),
        createMockLog({ blockNumber: 1002 }),
      ]

      await engine.processLogs(logs, createContext())

      const stats = engine.getProcessingStats()
      expect(stats.nbSuccess).to.equal(2)
      expect(stats.nbError).to.equal(1)
    })

    it('should maintain correct highest block across processing modes', async () => {
      const logs1 = [createMockLog({ blockNumber: 1000 }), createMockLog({ blockNumber: 2000 })]

      const highestSeq = await engine.processLogs(logs1, createContext())
      expect(highestSeq).to.equal(2000)

      engine.resetStats()

      const logs2 = [createMockLog({ blockNumber: 1000, transactionHash: '0xtx1' }), createMockLog({ blockNumber: 2000, transactionHash: '0xtx2' })]

      const highestPar = await engine.processLogsParallel(logs2, createContext(), { enable: true, concurrency: 2 })
      expect(highestPar).to.equal(2000)
    })

    it('should handle large number of logs efficiently', async () => {
      const logs = Array.from({ length: 1000 }, (_, i) =>
        createMockLog({
          blockNumber: 1000 + i,
          transactionHash: `0xtx${i}`,
          index: i,
        }),
      )

      const parallelConfig: IParallelConfig = { enable: true, batchSize: 100, concurrency: 10 }
      const highestBlock = await engine.processLogsParallelBatch(logs, createContext(), parallelConfig)

      expect(highestBlock).to.equal(1999)
      expect(engine.getProcessingStats().nbSuccess).to.equal(1000)
    })
  })

  describe('Edge cases', () => {
    it('should handle logs without block number', async () => {
      sandbox.stub(Web3Utils, 'parseLog').returns({ name: 'Transfer', args: [] as any } as any)
      sandbox.stub(Web3Utils, 'parseInfoLog').returns({ address: '0x', blockNumber: 0, network: NetworksEnum.ethereumMainnet, transactionIndex: 0, logIndex: 0, transactionHash: '0xtx', eventName: 'Transfer' })

      const logs = [createMockLog({ blockNumber: undefined as any })]
      const highestBlock = await engine.processLogs(logs, createContext())

      expect(highestBlock).to.equal(0)
    })

    it('should handle concurrent parallel processing', async () => {
      sandbox.stub(Web3Utils, 'parseLog').returns({ name: 'Transfer', args: [] as any } as any)
      sandbox.stub(Web3Utils, 'parseInfoLog').returns({ address: '0x', blockNumber: 1000, network: NetworksEnum.ethereumMainnet, transactionIndex: 0, logIndex: 0, transactionHash: '0xtx', eventName: 'Transfer' })

      const logs1 = [createMockLog({ blockNumber: 1000, transactionHash: '0xtx1' })]
      const logs2 = [createMockLog({ blockNumber: 2000, transactionHash: '0xtx2' })]

      const [result1, result2] = await Promise.all([
        engine.processLogsParallel(logs1, createContext(), { enable: true, concurrency: 1 }),
        engine.processLogsParallel(logs2, createContext(), { enable: true, concurrency: 1 }),
      ])

      expect(result1).to.equal(1000)
      expect(result2).to.equal(2000)
    })

    it('should handle handler returning undefined', async () => {
      sandbox.stub(Web3Utils, 'parseLog').returns({ name: 'Transfer', args: [] as any } as any)
      sandbox.stub(Web3Utils, 'parseInfoLog').returns({ address: '0x', blockNumber: 1000, network: NetworksEnum.ethereumMainnet, transactionIndex: 0, logIndex: 0, transactionHash: '0xtx', eventName: 'Transfer' })

      mockHandler.resolves(undefined)
      const logs = [createMockLog()]

      await engine.processLogs(logs, createContext())

      expect(engine.getProcessingStats().nbSuccess).to.equal(1)
    })
  })
})