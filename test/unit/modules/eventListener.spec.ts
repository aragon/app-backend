import * as sinon from 'sinon'
import { expect } from 'chai'
import EventListener from '@modules/eventListener'
import { NetworksEnum } from '@types'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import { Models } from '@dbModels'
import Logger from '@logger'
import DbTx from '@modules/dbTx'

describe('Module: EventListener', () => {
  let sandbox: sinon.SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('subscribeToEvents', () => {
    it('should log an error if no topics are available for subscription', async () => {
      const logError = sandbox.stub(logger, 'error')
      const listener = new EventListener(NetworksEnum.ethereumMainnet, [])
      await listener.subscribeToEvents()
      expect(logError.calledOnceWith('No topics available for subscription' as any)).to.be.true
    })

    it('should subscribe to events and chunk topics correctly', async () => {
      const configLogs = [
        { topic: '0xTopic1', abi: [], handler: sandbox.stub() },
        { topic: '0xTopic2', abi: [], handler: sandbox.stub() },
        { topic: '0xTopic3', abi: [], handler: sandbox.stub() },
        { topic: '0xTopic4', abi: [], handler: sandbox.stub() },
        { topic: '0xTopic5', abi: [], handler: sandbox.stub() },
        { topic: '0xTopic6', abi: [], handler: sandbox.stub() },
      ]
      const listener = new EventListener(NetworksEnum.ethereumMainnet, configLogs as any)
      const logVerbose = sandbox.stub(logger, 'verbose')
      const stubSub = sandbox.stub(ProviderModule, 'subscribeToEvent')

      await listener.subscribeToEvents()

      expect(logVerbose.calledTwice).to.be.true
      expect(logVerbose.calledWith('Start real-time listening' as any)).to.be.true
      expect(stubSub.calledTwice).to.be.true // Topics split into two chunks
    })

    it('should log an error if subscribing to a topic subset fails', async () => {
      const configLogs = [{ topic: '0xTopic1', config: [{ abi: [], handler: sandbox.stub() }] }]
      const listener = new EventListener(NetworksEnum.ethereumMainnet, configLogs as any)
      const logError = sandbox.stub(logger, 'error')
      sandbox.stub(ProviderModule, 'subscribeToEvent').throws(new Error('Subscription failed'))

      await listener.subscribeToEvents()

      expect(logError.calledWithMatch('Event listener error' as any)).to.be.true
    })
  })

  describe('handleEvent', () => {
    it('should handle events and call the appropriate handler', async () => {
      const eventHandler = sandbox.stub().resolves()
      const configLogs = [{ topic: '0xTopic1', config: [{ abi: ['event TestEvent()'], handler: eventHandler }] }]
      const listener = new EventListener(NetworksEnum.ethereumMainnet, configLogs as any)
      sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'TestEvent', args: {} } as any)
      sandbox.stub(Web3Helper, 'parseInfoLog').returns({} as any)

      const log = { topics: ['0xTopic1'], data: '0xData' } as any
      await listener.handleEvent(log)

      expect(eventHandler.calledOnce).to.be.true
    })

    it('should skip events with no matching configuration', async () => {
      const configLogs = [{ topic: '0xTopic1', config: [{ abi: ['event TestEvent()'], handler: sandbox.stub() }] }]
      const listener = new EventListener(NetworksEnum.ethereumMainnet, configLogs as any)
      const log = { topics: ['0xUnknownTopic'], data: '0xData' } as any

      await listener.handleEvent(log)

      expect(configLogs[0].config[0].handler.notCalled).to.be.true
    })

    it('should log an error if event processing fails', async () => {
      const configLogs = [{ topic: '0xTopic1', config: [{ abi: [], handler: () => {} }] }]
      const listener = new EventListener(NetworksEnum.ethereumMainnet, configLogs as any)
      const logError = sandbox.stub(logger, 'error')
      sandbox.stub(Web3Helper, 'parseLog').throws(new Error('Handler error'))

      const log = { topics: ['0xTopic1'], data: '0xData' } as any
      const result = await listener.handleEvent(log)

      expect(result).to.be.undefined
    })
  })

  describe('subscribeEventsByNewBlock', () => {
    it('should subscribe to new block events', () => {
      const logVerbose = sandbox.stub(logger, 'verbose')
      const stubNewBlock = sandbox.stub(ProviderModule, 'subscribeToNewBlock')
      const listener = new EventListener(NetworksEnum.ethereumMainnet, [])

      listener.subscribeEventsByNewBlock()

      expect(logVerbose.calledOnceWith('Start real-time listening' as any)).to.be.true
      expect(stubNewBlock.calledOnce).to.be.true
    })
  })

  describe('handleOnNewBlock', () => {
    it('should skip processing if block is already being processed', async () => {
      const logVerbose = sandbox.stub(logger, 'verbose')
      const listener = new EventListener(NetworksEnum.ethereumMainnet, [])
      listener.isProcessingBlock = 100

      await listener.handleOnNewBlock(100)

      expect(logVerbose.calledOnceWith('Skipping block as another process is ongoing' as any)).to.be.true
    })

    it('should log warning if block is missed', async () => {
      const logVerbose = sandbox.stub(logger, 'warn')
      const listener = new EventListener(NetworksEnum.ethereumMainnet, [])
      listener.lastBlock = 100
      sandbox.stub(Web3Helper, 'getBlockReceipts').resolves([])

      await listener.handleOnNewBlock(102)

      expect(logVerbose.calledOnceWith('Block Missed from on-chain' as any)).to.be.true
    })

    it('should process new block logs and update database correctly', async () => {
      const rawConfigIndexer = {
        network: NetworksEnum.ethereumMainnet,
        service: `indexer-${NetworksEnum.ethereumMainnet}`,
        lastSync: 0,
      }
      const configIndexerDoc = await Models.ConfigIndexer.create(rawConfigIndexer)
      const getBlockReceiptStub = sandbox
        .stub(Web3Helper, 'getBlockReceipts')
        .resolves([{ logs: [{ topics: ['0xTopic1'], data: '0xData' }] }])

      const configLogs = [
        { topic: '0xTopic1', config: [{ abi: ['event TestEvent()'], handler: sandbox.stub().resolves() }] },
      ]

      const listener = new EventListener(NetworksEnum.ethereumMainnet, configLogs as any)

      sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'TestEvent', args: {} } as any)
      sandbox.stub(Web3Helper, 'parseInfoLog').returns({} as any)
      const stubLogger = sandbox.stub(Logger, 'verbose')
      listener.lastBlock = 100
      await listener.handleOnNewBlock(101)

      expect(getBlockReceiptStub.calledOnce).to.be.true
      expect(configLogs[0].config[0].handler.calledOnce).to.be.true

      const updatedDocument = await Models.ConfigIndexer.findById(configIndexerDoc._id)
      expect(updatedDocument).to.not.be.null
      expect(updatedDocument.lastSync).to.equal(101)
      expect(stubLogger.calledOnceWith('update last block' as any)).to.be.true
    })

    it('should handle empty logs gracefully', async () => {
      const listener = new EventListener(NetworksEnum.ethereumMainnet, [])
      sandbox.stub(Web3Helper, 'getBlockReceipts').resolves([])
      const handleEventStub = sandbox.stub(listener, 'handleEvent')
      listener.lastBlock = 100
      await listener.handleOnNewBlock(101)

      expect(handleEventStub.notCalled).to.be.true
    })

    it('should skip logs with no matching topics', async () => {
      const listener = new EventListener(NetworksEnum.ethereumMainnet, [
        { topic: '0xTopic1', abi: [], handler: sandbox.stub() } as any,
      ])

      sandbox
        .stub(Web3Helper, 'getBlockReceipts')
        .resolves([{ logs: [{ topics: ['0xUnknownTopic'], data: '0xData' }] }])

      const logError = sandbox.stub(logger, 'error')
      listener.lastBlock = 100
      await listener.handleOnNewBlock(101)
      expect(logError.notCalled).to.be.true
    })
  })

  describe('saveProgress', () => {
    it('should update the lastSync field in the database correctly', async () => {
      const listener = new EventListener(NetworksEnum.ethereumMainnet, [])

      const executeTxFnStub = sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        return await fn({
          session: { commitTransaction: sandbox.stub().resolves(), endSession: sandbox.stub().resolves() },
        })
      })

      const updateStub = sandbox.stub()
      sandbox.stub(Models.ConfigIndexer as any, 'findExistingLog').resolves({
        lastSync: 100,
        update: updateStub.resolves(),
      })

      await listener.saveProgress(101, NetworksEnum.ethereumMainnet)

      expect(executeTxFnStub.calledOnce).to.be.true
      expect(updateStub.calledOnceWith({ lastSync: 101 })).to.be.true
    })

    it('should skip saving progress if lastSync is already up-to-date', async () => {
      const listener = new EventListener(NetworksEnum.ethereumMainnet, [])
      sandbox.stub(DbTx, 'executeTxFn').callsFake(async (fn: any) => {
        await fn({
          session: { closeEnd: sandbox.stub().resolves() },
        })
      })

      sandbox.stub(Models.ConfigIndexer as any, 'findExistingLog').resolves({
        lastSync: 102,
        update: sandbox.stub(),
      })

      const updateStub = sandbox.stub(Models.ConfigIndexer.prototype as any, 'update')

      await listener.saveProgress(101, NetworksEnum.ethereumMainnet)

      expect(updateStub.notCalled).to.be.true // No update should occur
    })

    it('should log an error if saveProgress fails', async () => {
      const listener = new EventListener(NetworksEnum.ethereumMainnet, [])
      const logError = sandbox.stub(logger, 'error')
      sandbox.stub(DbTx, 'executeTxFn').throws(new Error('Transaction error'))

      await listener.saveProgress(101, NetworksEnum.ethereumMainnet)

      expect(logError.calledWithMatch('Error saving progress' as any)).to.be.true
    })
  })
})
