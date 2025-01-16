import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import EventListener from '@modules/eventListener'
import { NetworksEnum } from '@types'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import DbOperations from '@models/utils/dbOperations'
import { Models } from '@dbModels'
import Logger from '@logger'

describe('Module: EventListener', () => {
  let sandbox: SinonSandbox

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
  })

  describe('handleEvent', () => {
    it('should handle events and call the appropriate handler', async () => {
      const eventHandler = sandbox.stub().resolves()
      const configLogs = [{ topic: '0xTopic1', abi: ['event TestEvent()'], handler: eventHandler }]
      const listener = new EventListener(NetworksEnum.ethereumMainnet, configLogs as any)
      sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'TestEvent', args: {} } as any)
      sandbox.stub(Web3Helper, 'parseInfoLog').returns({} as any)

      const log = { topics: ['0xTopic1'], data: '0xData' } as any
      await listener.handleEvent(log)

      expect(eventHandler.calledOnce).to.be.true
    })

    it('should skip events with no matching configuration', async () => {
      const configLogs = [{ topic: '0xTopic1', abi: ['event TestEvent()'], handler: sandbox.stub() }]
      const listener = new EventListener(NetworksEnum.ethereumMainnet, configLogs as any)
      const log = { topics: ['0xUnknownTopic'], data: '0xData' } as any

      await listener.handleEvent(log)

      expect(configLogs[0].handler.notCalled).to.be.true
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

    it('should process new block logs and update database correctly', async () => {
      const rawConfigIndexer = {
        network: NetworksEnum.ethereumMainnet,
        service: `indexer-${NetworksEnum.ethereumMainnet}`,
        lastSync: 0,
      }
      const configIndexerDoc = await Models.ConfigIndexer.create(rawConfigIndexer)

      const mockProvider = {
        getLogs: sandbox.stub().resolves([{ topics: ['0xTopic1'], data: '0xData' }]),
      }
      sandbox.stub(ProviderModule, 'getProvider').returns(mockProvider)

      const configLogs = [{ topic: '0xTopic1', abi: ['event TestEvent()'], handler: sandbox.stub().resolves() }]
      const listener = new EventListener(NetworksEnum.ethereumMainnet, configLogs as any)

      sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'TestEvent', args: {} } as any)
      sandbox.stub(Web3Helper, 'parseInfoLog').returns({} as any)
      const stubLogger = sandbox.stub(Logger, 'verbose')

      await listener.handleOnNewBlock(101)

      expect(mockProvider.getLogs.calledOnce).to.be.true
      expect(configLogs[0].handler.calledOnce).to.be.true

      const updatedDocument = await Models.ConfigIndexer.findById(configIndexerDoc._id)
      expect(updatedDocument).to.not.be.null
      expect(updatedDocument.lastSync).to.equal(101)
      expect(stubLogger.calledOnceWith('update last block' as any)).to.be.true
    })
  })
})
