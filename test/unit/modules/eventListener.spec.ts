import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import EventListener from '@modules/eventListener'
import { NetworksEnum } from '@types'
import logger from '@logger'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import { Models } from '@dbModels'
import Logger from '@logger'
import DbTx from '@modules/dbTx'
import { GovernanceERC20 } from '@artifacts/GovernanceERC20'
import { ethers, Interface } from 'ethers'

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
      sandbox.stub(logger, 'error')
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
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider)

      const configLogs = [
        { topic: '0xTopic1', config: [{ abi: ['event TestEvent()'], handler: sandbox.stub().resolves() }] },
      ]
      const listener = new EventListener(NetworksEnum.ethereumMainnet, configLogs as any)

      sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'TestEvent', args: {} } as any)
      sandbox.stub(Web3Helper, 'parseInfoLog').returns({} as any)
      sandbox.stub(listener, 'filterUnwantedEvents').resolves([{ topics: ['0xTopic1'], data: '0xData' }] as any)
      const stubLogger = sandbox.stub(Logger, 'verbose')

      await listener.handleOnNewBlock(101)

      expect(mockProvider.getLogs.calledOnce).to.be.true
      expect(configLogs[0].config[0].handler.calledOnce).to.be.true

      const updatedDocument = await Models.ConfigIndexer.findById(configIndexerDoc._id)
      expect(updatedDocument).to.not.be.null
      expect(updatedDocument.lastSync).to.equal(101)
      expect(stubLogger.calledOnceWith('update last block' as any)).to.be.true
    })

    it('should handle empty logs gracefully', async () => {
      const listener = new EventListener(NetworksEnum.ethereumMainnet, [])
      const mockProvider = { getLogs: sandbox.stub().resolves([]) }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider)
      const logError = sandbox.stub(logger, 'error')

      await listener.handleOnNewBlock(101)

      expect(mockProvider.getLogs.calledOnce).to.be.true
      expect(logError.notCalled).to.be.true
    })

    it('should skip logs with no matching topics', async () => {
      const listener = new EventListener(NetworksEnum.ethereumMainnet, [
        { topic: '0xTopic1', abi: [], handler: sandbox.stub() } as any,
      ])
      const mockProvider = { getLogs: sandbox.stub().resolves([{ topics: ['0xUnknownTopic'], data: '0xData' }]) }

      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(mockProvider)
      const logError = sandbox.stub(logger, 'error')

      await listener.handleOnNewBlock(101)

      expect(mockProvider.getLogs.calledOnce).to.be.true
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
      sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves({
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

      sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves({
        lastSync: 102,
        update: sandbox.stub(),
      })

      const updateStub = sandbox.stub(Models.ConfigIndexer.prototype, 'update')

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

  describe('filterUnwantedEvents', () => {
    it('should filter logs based on plugin token addresses', async () => {
      const listener = new EventListener(NetworksEnum.ethereumMainnet, [])

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
      const listener = new EventListener(NetworksEnum.ethereumMainnet, [])

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
})
