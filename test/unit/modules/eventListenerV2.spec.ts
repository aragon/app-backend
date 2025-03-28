import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import EventListenerV2 from '@modules/eventListenerV2'
import { NetworksEnum, IIndexerConfig, EnumQueueName } from '@types'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import { Models } from '@dbModels'
import { ethers, Interface } from 'ethers'
import Utils from '@helpers/utils'
import { DAO } from '@artifacts/dao'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { ERC721 } from '@artifacts/ERC721'
import RabbitMQHelper from '@helpers/rabbitMQ'
import DbTx from '@modules/dbTx'

describe('Module: EventListenerV2', () => {
  let sandbox: SinonSandbox

  let listenerConfig = {
    batchWindowMs: 5000,
    processingTimeoutMs: 60000,
    maxFailures: 5,
    circuitBreakerPauseMs: 60000,
  }

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('constructor', () => {
    it('should initialize with provided options', () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      expect(listener['batchWindowMs']).to.equal(5000)
      expect(listener['processingTimeoutMs']).to.equal(60000)
      expect(listener['maxFailures']).to.equal(5)
      expect(listener['circuitBreakerPauseMs']).to.equal(60000)
      expect(listener['isProcessing']).to.be.false
      expect(listener['isPaused']).to.be.false
      expect(listener['failureCount']).to.equal(0)
    })
  })

  describe('handleEvent', () => {
    it('should process event with matching config and handler', async () => {
      const eventHandler = sandbox.stub().resolves()
      const configLogs: IIndexerConfig[] = [
        {
          event: 'TestEvent',
          topic: '0xTopic1',
          config: [{ abi: ['event TestEvent()'], handler: eventHandler }],
        },
      ]

      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, configLogs as any, listenerConfig)

      const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'TestEvent', args: {} } as any)
      const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns({} as any)

      const log = { topics: ['0xTopic1'], data: '0xData' } as any
      await listener.handleEvent(log)

      expect(parseLogStub.calledOnce).to.be.true
      expect(parseInfoLogStub.calledOnce).to.be.true
      expect(eventHandler.calledOnce).to.be.true
    })

    it('should skip events with no matching topic', async () => {
      const eventHandler = sandbox.stub().resolves()
      const configLogs: IIndexerConfig[] = [
        {
          event: 'TestEvent',
          topic: '0xTopic1',
          config: [{ abi: ['event TestEvent()'], handler: eventHandler }],
        },
      ]

      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, configLogs as any, listenerConfig)

      const log = { topics: ['0xUnknownTopic'], data: '0xData' } as any
      await listener.handleEvent(log)

      expect(eventHandler.notCalled).to.be.true
    })

    it('should try multiple interfaces until it finds a match', async () => {
      const handler1 = sandbox.stub().resolves()
      const handler2 = sandbox.stub().resolves()

      const configLogs: IIndexerConfig[] = [
        {
          event: 'TestEvent',
          topic: '0xTopic1',
          config: [
            { abi: ['event WrongEvent()'], handler: handler1 },
            { abi: ['event CorrectEvent()'], handler: handler2 },
          ],
        },
      ]

      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, configLogs as any, listenerConfig)

      // First Interface will fail to parse, second will succeed
      const parseLogStub = sandbox.stub(Web3Helper, 'parseLog')
      parseLogStub.onFirstCall().throws(new Error('Parse error'))
      parseLogStub.onSecondCall().returns({ name: 'CorrectEvent', args: {} } as any)

      sandbox.stub(Web3Helper, 'parseInfoLog').returns({} as any)

      const log = { topics: ['0xTopic1'], data: '0xData' } as any
      await listener.handleEvent(log)

      expect(parseLogStub.calledTwice).to.be.true
      expect(handler1.notCalled).to.be.true
      expect(handler2.calledOnce).to.be.true
    })

    it('should log error when event handling fails', async () => {
      const eventHandler = sandbox.stub().throws(new Error('Handler error'))
      const configLogs: IIndexerConfig[] = [
        {
          event: 'TestEvent',
          topic: '0xTopic1',
          config: [{ abi: ['event TestEvent()'], handler: eventHandler }],
        },
      ]

      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, configLogs as any, listenerConfig)

      sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'TestEvent', args: {} } as any)
      sandbox.stub(Web3Helper, 'parseInfoLog').returns({} as any)
      const logErrorStub = sandbox.stub(logger, 'error')

      const log = { topics: ['0xTopic1'], data: '0xData' } as any
      await listener.handleEvent(log)

      expect(logErrorStub.calledOnce).to.be.true
      expect(logErrorStub.firstCall.args[0]).to.equal('Error handling eventListener')
    })
  })

  describe('subscribeEventsByNewBlock', () => {
    it('should subscribe to new blocks with the correct handler', () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      const logVerboseStub = sandbox.stub(logger, 'verbose')
      const subscribeStub = sandbox.stub(ProviderModule, 'subscribeToNewBlock')

      listener.subscribeEventsByNewBlock()

      expect(logVerboseStub.calledOnce).to.be.true
      expect(logVerboseStub.firstCall.args[0]).to.equal('Start real-time listening with batching')

      expect(subscribeStub.calledOnce).to.be.true
      expect(subscribeStub.firstCall.args[0]).to.equal(NetworksEnum.ethereumMainnet)
      // Testing that the bound handler function is passed
      expect(typeof subscribeStub.firstCall.args[1]).to.equal('function')
    })
  })

  describe('handleOnNewBlock', () => {
    it('should update latestBlockNumber and schedule batch processing for new blocks', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)
      const scheduleBatchStub = sandbox.stub(listener as any, 'scheduleBatchProcessing')

      // Initial null state
      expect(listener['latestBlockNumber']).to.be.null

      // First block
      await listener.handleOnNewBlock(100)
      expect(listener['latestBlockNumber']).to.equal(100)
      expect(scheduleBatchStub.calledOnce).to.be.true

      // Same block, should not schedule again
      scheduleBatchStub.reset()
      await listener.handleOnNewBlock(100)
      expect(listener['latestBlockNumber']).to.equal(100)
      expect(scheduleBatchStub.notCalled).to.be.true

      // Higher block, should schedule
      await listener.handleOnNewBlock(101)
      expect(listener['latestBlockNumber']).to.equal(101)
      expect(scheduleBatchStub.calledOnce).to.be.true

      // Lower block, should not update or schedule
      scheduleBatchStub.reset()
      await listener.handleOnNewBlock(99)
      expect(listener['latestBlockNumber']).to.equal(101) // remains at 101
      expect(scheduleBatchStub.notCalled).to.be.true
    })
  })

  describe('scheduleBatchProcessing', () => {
    it('should not schedule if already processing, paused, or timeout exists', () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      // With batch timeout already set
      listener['batchTimeout'] = setTimeout(() => {}, 1000) as any
      listener['scheduleBatchProcessing']()
      expect(listener['pendingProcess']).to.be.false

      // Clear timeout and set isProcessing
      clearTimeout(listener['batchTimeout'])
      listener['batchTimeout'] = undefined
      listener['isProcessing'] = true
      listener['scheduleBatchProcessing']()
      expect(listener['pendingProcess']).to.be.false

      // Set isPaused
      listener['isProcessing'] = false
      listener['isPaused'] = true
      listener['scheduleBatchProcessing']()
      expect(listener['pendingProcess']).to.be.false
    })

    it('should set timeout to process batch after window', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], {
        ...listenerConfig,
        batchWindowMs: 50,
      })
      const processLatestBlockStub = sandbox.stub(listener as any, 'processLatestBlock').resolves()

      listener['scheduleBatchProcessing']()

      expect(listener['pendingProcess']).to.be.true
      expect(listener['batchTimeout']).to.not.be.undefined
      await Utils.wait(100)

      expect(processLatestBlockStub.calledOnce).to.be.true
      expect(listener['batchTimeout']).to.be.undefined
    })
  })

  describe('pauseProcessing', () => {
    it('should set isPaused flag and log warning', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)
      const warnLogStub = sandbox.stub(logger, 'warn')

      await listener['pauseProcessing'](1000)

      expect(listener['isPaused']).to.be.true
      expect(warnLogStub.calledOnce).to.be.true
      expect(warnLogStub.firstCall.args[0]).to.equal('Pausing event processing')
    })

    it('should clear existing timeouts when pausing', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)
      const warnLogStub = sandbox.stub(logger, 'warn')

      // Set existing timeouts
      listener['batchTimeout'] = setTimeout(() => {}, 5000) as any
      listener['pauseTimeout'] = setTimeout(() => {}, 10000) as any

      const clearTimeoutSpy = sandbox.spy(global, 'clearTimeout')

      await listener['pauseProcessing'](1000)

      expect(clearTimeoutSpy.calledTwice).to.be.true
      expect(listener['batchTimeout']).to.be.undefined
      expect(warnLogStub.firstCall.args[0]).to.equal('Pausing event processing')
    })

    it('should resume processing after specified duration', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)
      const infoLogStub = sandbox.stub(logger, 'info')

      await listener['pauseProcessing'](50)
      await Utils.wait(100)

      expect(listener['isPaused']).to.be.false
      expect(listener['failureCount']).to.equal(0)
      expect(infoLogStub.calledOnce).to.be.true
      expect(infoLogStub.firstCall.args[0]).to.equal('Resuming event processing')
    })

    it('should schedule batch processing when resuming if pending', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)
      listener['latestBlockNumber'] = 100
      listener['pendingProcess'] = true

      const scheduleBatchStub = sandbox.stub(listener as any, 'scheduleBatchProcessing')

      await listener['pauseProcessing'](100)
      await Utils.wait(100)

      expect(scheduleBatchStub.calledOnce).to.be.true
    })
  })

  describe('processLatestBlock', () => {
    it('should return early if already processing, paused, or no block to process', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)
      const processBlockLogicStub = sandbox.stub(listener as any, 'processBlockLogic').resolves()

      // No block to process
      listener['latestBlockNumber'] = null
      await listener['processLatestBlock']()
      expect(processBlockLogicStub.notCalled).to.be.true

      // Is processing
      listener['latestBlockNumber'] = 100
      listener['isProcessing'] = true
      await listener['processLatestBlock']()
      expect(processBlockLogicStub.notCalled).to.be.true

      // Is paused
      listener['isProcessing'] = false
      listener['isPaused'] = true
      await listener['processLatestBlock']()
      expect(processBlockLogicStub.notCalled).to.be.true
    })

    it('should process block successfully and reset failure count', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)
      listener['latestBlockNumber'] = 100
      listener['failureCount'] = 2 // Set to test reset

      const processBlockLogicStub = sandbox.stub(listener as any, 'processBlockLogic').resolves()
      const saveProgressStub = sandbox.stub(listener, 'saveProgress').resolves()

      await listener['processLatestBlock']()

      expect(listener['pendingProcess']).to.be.false
      expect(listener['isProcessing']).to.be.false
      expect(processBlockLogicStub.calledOnceWith(100)).to.be.true
      expect(saveProgressStub.calledOnce).to.be.true
      expect(listener['failureCount']).to.equal(0)
    })

    it('should handle processing errors and increment failure count', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)
      listener['latestBlockNumber'] = 100

      sandbox.stub(listener as any, 'processBlockLogic').rejects(new Error('Processing error'))
      const logErrorStub = sandbox.stub(logger, 'error')

      await listener['processLatestBlock']()

      expect(listener['pendingProcess']).to.be.true
      expect(listener['isProcessing']).to.be.false
      expect(listener['failureCount']).to.equal(1)
      expect(logErrorStub.calledOnce).to.be.true
      expect(logErrorStub.firstCall.args[0]).to.equal('Block processing failed')
    })

    it('should handle processing timeout', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)
      listener['latestBlockNumber'] = 100
      ;(listener as any)['processingTimeoutMs'] = 1000 // 1 second timeout
      const neverResolvingPromise = new Promise(_resolve => {})
      sandbox.stub(listener as any, 'processBlockLogic').returns(neverResolvingPromise)

      const logErrorStub = sandbox.stub(logger, 'error')

      const processPromise = listener['processLatestBlock']()

      await processPromise
      expect(listener['pendingProcess']).to.be.true
      expect(listener['isProcessing']).to.be.false
      expect(listener['failureCount']).to.equal(1)
      expect(logErrorStub.calledOnce).to.be.true
    })

    it('should activate circuit breaker after max failures', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)
      listener['latestBlockNumber'] = 100
      listener['failureCount'] = 5
      ;(listener as any)['processingTimeoutMs'] = 50
      const loggerStub = sandbox.stub(logger, 'error')
      sandbox.stub(listener as any, 'processBlockLogic').rejects(new Error('Processing error'))
      const pauseStub = sandbox.stub(listener as any, 'pauseProcessing').resolves()

      await listener['processLatestBlock']()

      expect(listener['failureCount']).to.equal(6)
      expect(pauseStub.calledOnce).to.be.true
      expect(loggerStub.calledOnce).to.be.true
    })

    it('should schedule next processing if new block arrived during processing', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)
      listener['latestBlockNumber'] = 100

      // Simulate new block arriving during processing
      sandbox.stub(listener as any, 'processBlockLogic').callsFake(async () => {
        listener['latestBlockNumber'] = 101
      })

      sandbox.stub(listener, 'saveProgress').resolves()
      const scheduleBatchStub = sandbox.stub(listener as any, 'scheduleBatchProcessing')

      await listener['processLatestBlock']()

      expect(scheduleBatchStub.calledOnce).to.be.true
    })
  })

  describe('processBlockLogic', () => {
    it('should get logs from last processed block to current block', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      const provider = {
        getLogs: sandbox.stub().resolves([]),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(provider as any)
      sandbox.stub(listener as any, 'getLastProcessedBlock').resolves(95)

      await listener['processBlockLogic'](100)

      expect(provider.getLogs.calledOnce).to.be.true
      expect(provider.getLogs.firstCall.args[0]).to.deep.equal({
        fromBlock: '0x60', // 95 + 1 = 96 in hex
        toBlock: 'latest',
      })
    })

    it('should use block number if no last processed block is found', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      const provider = {
        getLogs: sandbox.stub().resolves([]),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(provider as any)
      sandbox.stub(listener as any, 'getLastProcessedBlock').resolves(null)

      await listener['processBlockLogic'](100)

      expect(provider.getLogs.calledOnce).to.be.true
      expect(provider.getLogs.firstCall.args[0]).to.deep.equal({
        fromBlock: '0x64', // 100 in hex
        toBlock: 'latest',
      })
    })

    it('should filter logs, sort by priority, and process in order', async () => {
      const configLogs: IIndexerConfig[] = [
        { topic: '0xTopic1', config: [] },
        { topic: '0xTopic2', config: [] },
      ] as any

      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, configLogs, listenerConfig)

      const logs = [
        { topics: ['0xTopic2'], transactionHash: '0xabc' },
        { topics: ['0xTopic1'], transactionHash: '0x1231' },
      ] as any[]

      const provider = {
        getLogs: sandbox.stub().resolves(logs),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(provider as any)
      sandbox.stub(listener as any, 'getLastProcessedBlock').resolves(95)
      sandbox
        .stub(listener as any, 'parseAddressForDeposits')
        .returns(['0x1234567890123456789012345678901234567890', '0x2345678901234567890123456789012345678901'])

      const filterStub = sandbox.stub(listener as any, 'filterUnwantedEvents').resolves(logs)
      const sortStub = sandbox.stub(listener as any, 'sortLogsByPriority').returns([...logs].reverse()) // Reverse to test order
      const handleEventStub = sandbox.stub(listener, 'handleEvent').resolves()
      const logVerboseStub = sandbox.stub(logger, 'verbose')
      const rabbitMqStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await listener['processBlockLogic'](100)

      expect(filterStub.calledOnceWith(logs)).to.be.true
      expect(sortStub.calledOnceWith(logs)).to.be.true
      expect(handleEventStub.calledTwice).to.be.true
      expect(logVerboseStub.calledWith('Processing logs' as any)).to.be.true
      expect(rabbitMqStub.calledOnce).to.be.true
      expect(rabbitMqStub.firstCall.args[0]).to.equal(EnumQueueName.realtimeTransactions)
      expect(rabbitMqStub.firstCall.args[1]).to.deep.equal({
        id: `realtimeTransactions-${NetworksEnum.ethereumMainnet}-100`,
        params: {
          addresses: ['0x1234567890123456789012345678901234567890', '0x2345678901234567890123456789012345678901'],
          network: NetworksEnum.ethereumMainnet,
          transactionHash: '0x1231',
        },
      })
      // Verify order of processing matches the sorted order
      expect(handleEventStub.firstCall.args[0]).to.equal(sortStub.returnValues[0][0])
      expect(handleEventStub.secondCall.args[0]).to.equal(sortStub.returnValues[0][1])
    })

    it('should do nothing when no logs are found', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      const provider = {
        getLogs: sandbox.stub().resolves([]),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(provider as any)
      sandbox.stub(listener as any, 'getLastProcessedBlock').resolves(95)

      const handleEventStub = sandbox.stub(listener, 'handleEvent')

      await listener['processBlockLogic'](100)

      expect(handleEventStub.notCalled).to.be.true
    })

    it('should do nothing when all logs are filtered out', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      const logs = [{ topics: ['0xTopic1'] }] as any[]

      const provider = {
        getLogs: sandbox.stub().resolves(logs),
      }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(provider as any)
      sandbox.stub(listener as any, 'getLastProcessedBlock').resolves(95)
      sandbox.stub(listener as any, 'filterUnwantedEvents').resolves([]) // Empty after filtering

      const handleEventStub = sandbox.stub(listener, 'handleEvent')

      await listener['processBlockLogic'](100)

      expect(handleEventStub.notCalled).to.be.true
    })
  })

  describe('getLastProcessedBlock', () => {
    it('should return lastSync from database', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves({
        lastSync: 95,
      })

      const result = await listener['getLastProcessedBlock']()

      expect(result).to.equal(95)
    })

    it('should return null if no config exists', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves(null)

      const result = await listener['getLastProcessedBlock']()

      expect(result).to.be.null
    })

    it('should handle errors and return null', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      sandbox.stub(Models.ConfigIndexer, 'findExistingLog').rejects(new Error('Database error'))
      const logErrorStub = sandbox.stub(logger, 'error')

      const result = await listener['getLastProcessedBlock']()

      expect(result).to.be.null
      expect(logErrorStub.calledOnce).to.be.true
      expect(logErrorStub.firstCall.args[0]).to.equal('Error getting last processed block')
    })
  })

  describe('filterUnwantedEvents', () => {
    it('should filter logs based on plugin token addresses', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      const plugins = [
        { tokenAddress: ethers.getAddress('0x1aca993f1e460e66a859576edf9fbeb7fa3ee236') },
        { tokenAddress: ethers.getAddress('0x2aca993f1e460e66a859576edf9fbeb7fa3ee236') },
      ]

      sandbox.stub(Models.Plugin, 'find').resolves(plugins)
      //get random

      const transferTopic = new Interface(GovernanceERC20.abi).getEvent('Transfer')?.topicHash!
      const logs = [
        { address: '0x1aca993f1e460e66a859576edf9fbeb7fa3ee236', topics: [transferTopic] },
        { address: '0x2aca993f1e460e66a859576edf9fbeb7fa3ee236', topics: [transferTopic] },
        { address: '0x3aca993f1e460e66a859576edf9fbeb7fa3ee236', topics: [transferTopic] },
      ] as any[]

      const result = await listener['filterUnwantedEvents'](logs)

      expect(result.length).to.equal(2)
      expect(result[0].address).to.equal('0x1aca993f1e460e66a859576edf9fbeb7fa3ee236')
      expect(result[1].address).to.equal('0x2aca993f1e460e66a859576edf9fbeb7fa3ee236')
    })

    it('should filter all logs if no matching addresses', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      const plugins = [
        { tokenAddress: '0x1aca993f1e460e66a859576edf9fbeb7fa3ee236' },
        { tokenAddress: '0x2aca993f1e460e66a859576edf9fbeb7fa3ee236' },
      ]

      sandbox.stub(Models.Plugin, 'find').resolves(plugins)
      sandbox.stub(ethers, 'getAddress').callsFake(addr => addr)

      const trasferTopic = new Interface(GovernanceERC20.abi).getEvent('Transfer')?.topicHash!

      const logs = [
        { address: '0x5aca993f1e460e66a859576edf9fbeb7fa3ee236', topics: [trasferTopic] },
        { address: '0x6aca993f1e460e66a859576edf9fbeb7fa3ee236', topics: [trasferTopic] },
        { address: '0x7aca993f1e460e66a859576edf9fbeb7fa3ee236', topics: ['0xTIpic'] },
      ] as any[]

      const result = await listener['filterUnwantedEvents'](logs)

      expect(result.length).to.equal(1)
      expect(result[0].address).to.equal('0x7aca993f1e460e66a859576edf9fbeb7fa3ee236')
    })
  })

  describe('sortLogsByPriority', () => {
    it('should sort logs based on topic priority', () => {
      const configLogs: IIndexerConfig[] = [
        { topic: '0xTopic1', config: [] },
        { topic: '0xTopic2', config: [] },
        { topic: '0xTopic3', config: [] },
      ] as any

      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, configLogs, listenerConfig)

      const logs = [{ topics: ['0xTopic3'] }, { topics: ['0xTopic1'] }, { topics: ['0xTopic2'] }] as any[]

      const result = listener['sortLogsByPriority'](logs)

      expect(result.length).to.equal(3)
      expect(result[0].topics[0]).to.equal('0xTopic1')
      expect(result[1].topics[0]).to.equal('0xTopic2')
      expect(result[2].topics[0]).to.equal('0xTopic3')
    })

    it('should handle logs with unknown topics', () => {
      const configLogs: IIndexerConfig[] = [
        { topic: '0xTopic1', config: [] },
        { topic: '0xTopic2', config: [] },
      ] as any

      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, configLogs, listenerConfig)

      const logs = [
        { topics: ['0xTopic3'] }, // Unknown topic
        { topics: ['0xTopic1'] },
        { topics: ['0xTopic2'] },
      ] as any[]

      const result = listener['sortLogsByPriority'](logs)

      expect(result.length).to.equal(3)
      // Known topics first, in priority order
      expect(result[0].topics[0]).to.equal('0xTopic1')
      expect(result[1].topics[0]).to.equal('0xTopic2')
      // Unknown topic last
      expect(result[2].topics[0]).to.equal('0xTopic3')
    })
  })

  describe('checkAndHandleDeposits', () => {
    it('should identify and process NativeTokenDeposited events', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      // Create test logs
      const daoInterface = new Interface(DAO.abi)
      const nativeDepositedTopic = daoInterface.getEvent('NativeTokenDeposited')?.topicHash!

      const logs = [
        {
          topics: [nativeDepositedTopic],
          address: '0x1234567890123456789012345678901234567890',
          transactionHash: '0xabcd',
        },
      ] as any[]

      const receives = listener.parseAddressForDeposits(logs)
      expect(receives).to.deep.equal(['0x1234567890123456789012345678901234567890'])
    })

    it('should identify and process ERC20 Transfer events', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      // Create test logs
      const govTokenInterface = new Interface(GovernanceERC20.abi)
      const transferTopic = govTokenInterface.getEvent('Transfer')?.topicHash!

      const logs = [
        {
          topics: [transferTopic],
          address: '0x2345678901234567890123456789012345678901',
          transactionHash: '0xabcd',
        },
      ] as any[]

      // Mock the decodeTransferLogs method
      const decodeStub = sandbox
        .stub(listener as any, 'decodeTransferLogs')
        .returns('0x3456789012345678901234567890123456789012')

      const receives = listener.parseAddressForDeposits(logs)

      expect(receives).to.deep.equal(['0x3456789012345678901234567890123456789012'])
      expect(decodeStub.calledOnce).to.be.true
    })

    it('should handle multiple events and deduplicate addresses', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      // Create test interfaces
      const daoInterface = new Interface(DAO.abi)
      const govTokenInterface = new Interface(GovernanceERC20.abi)

      // Get topic hashes
      const nativeDepositedTopic = daoInterface.getEvent('NativeTokenDeposited')?.topicHash!
      const transferTopic = govTokenInterface.getEvent('Transfer')?.topicHash!

      // Create test logs with duplicate addresses
      const logs = [
        {
          topics: [nativeDepositedTopic],
          address: '0x1234',
          transactionHash: '0xabcd',
        },
        {
          topics: [transferTopic],
          address: '0x5678',
          transactionHash: '0xabcd',
        },
        {
          topics: [transferTopic],
          address: '0x9abc',
          transactionHash: '0xabcd',
        },
      ] as any[]

      const decodeStub = sandbox.stub(listener as any, 'decodeTransferLogs')
      decodeStub.onFirstCall().returns('0x1234') // Duplicate of first address
      decodeStub.onSecondCall().returns('0xdef0') // New address

      const receives = listener.parseAddressForDeposits(logs)
      expect(receives).to.have.members(['0x1234', '0xdef0'])
    })

    it('should do nothing when no relevant events are found', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      // Create logs with irrelevant topics
      const logs = [
        {
          topics: ['0xIrrelevantTopic'],
          address: '0x1234',
          transactionHash: '0xabcd',
        },
      ] as any[]

      const receives = listener.parseAddressForDeposits(logs)
      expect(receives).to.deep.equal(undefined)
    })
  })

  describe('decodeTransferLogs', () => {
    it('should decode GovernanceERC20 transfer logs correctly', () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      const govTokenInterface = new Interface(GovernanceERC20.abi)

      // Create a mock parsed log result
      const mockParsedLog = {
        name: 'Transfer',
        args: {
          from: '0x1234',
          to: '0x5678',
          value: 1000,
        },
      }

      // Stub the interface parse method
      const parseLogStub = sandbox.stub(Interface.prototype, 'parseLog').returns(mockParsedLog as any)

      // Stub the Interface constructor to return our interface with the stubbed method
      sandbox.stub(ethers, 'Interface').returns(govTokenInterface)

      const result = listener['decodeTransferLogs']({ topics: ['0xTransfer'] } as any)

      expect(parseLogStub.calledOnce).to.be.true
      expect(result).to.equal('0x5678')
    })

    it('should try ERC721 interface if GovernanceERC20 parsing fails', () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      const govTokenInterface = new Interface(GovernanceERC20.abi)
      const erc721Interface = new Interface(ERC721.abi)

      // ERC721 parsing succeeds
      const mockParsedLog = {
        name: 'Transfer',
        args: {
          from: '0x1234',
          to: '0x5678',
          tokenId: 123,
        },
      }
      // GovernanceERC20 parsing fails
      sandbox
        .stub(Interface.prototype, 'parseLog')
        .throws(new Error('Parse error'))
        .onCall(1)
        .returns(mockParsedLog as any)

      // Stub the Interface constructor to return our interfaces
      const interfaceStub = sandbox.stub(ethers, 'Interface')
      interfaceStub.onFirstCall().returns(govTokenInterface)
      interfaceStub.onSecondCall().returns(erc721Interface)

      const result = listener['decodeTransferLogs']({ topics: ['0xTransfer'] } as any)

      expect(result).to.equal('0x5678')
    })

    it('should return null if both interface parsings fail', () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      const govTokenInterface = new Interface(GovernanceERC20.abi)
      const erc721Interface = new Interface(ERC721.abi)

      // Both parsing attempts fail
      sandbox.stub(govTokenInterface, 'parseLog').throws(new Error('Parse error 1'))
      sandbox.stub(erc721Interface, 'parseLog').throws(new Error('Parse error 2'))

      // Stub the Interface constructor
      const interfaceStub = sandbox.stub(ethers, 'Interface')
      interfaceStub.onFirstCall().returns(govTokenInterface)
      interfaceStub.onSecondCall().returns(erc721Interface)

      const result = listener['decodeTransferLogs']({ topics: ['0xTransfer'] } as any)

      expect(result).to.be.null
    })
  })

  describe('saveProgress', () => {
    it('should update the lastSync field in the database correctly', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      const executeTxFnStub = sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        return await fn({
          session: { commitTransaction: sandbox.stub().resolves(), endSession: sandbox.stub().resolves() },
        })
      })

      const updateStub = sandbox.stub()
      sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves({
        lastSync: 100,
        update: updateStub.resolves(),
      })

      sandbox.stub(logger, 'info')

      await listener.saveProgress(101, NetworksEnum.ethereumMainnet, 1231)

      expect(executeTxFnStub.calledOnce).to.be.true
      expect(updateStub.calledOnceWith({ lastSync: 101 })).to.be.true
    })

    it('should skip saving progress if lastSync is already up-to-date', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)

      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        await fn({
          session: { closeEnd: sandbox.stub().resolves() },
        })
      })

      sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves({
        lastSync: 102,
        update: sandbox.stub(),
      })

      const updateStub = sandbox.stub(Models.ConfigIndexer.prototype, 'update')

      await listener.saveProgress(101, NetworksEnum.ethereumMainnet, 1231)

      expect(updateStub.notCalled).to.be.true // No update should occur
    })

    it('should log an error if saveProgress fails', async () => {
      const listener = new EventListenerV2(NetworksEnum.ethereumMainnet, [], listenerConfig)
      const logError = sandbox.stub(logger, 'error')
      sandbox.stub(DbTx, 'executeTxFn').throws(new Error('Transaction error'))

      await listener.saveProgress(101, NetworksEnum.ethereumMainnet, 1231)

      expect(logError.calledWithMatch('Error saving progress' as any)).to.be.true
    })
  })
})
