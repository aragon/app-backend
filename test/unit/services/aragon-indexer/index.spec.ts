import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import IndexerService from '@services/aragon-indexer/index'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import logger from '@logger'

describe('Indexer: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  // it('should start the indexer service', async () => {
  //   const runCrawlersInOrderStub = sandbox.stub(IndexerService, 'runCrawlersInOrder')
  //   const startRealtimeListenersStub = sandbox.stub(IndexerService, 'startRealtimeListeners')
  //
  //   const loggerStub = sandbox.stub(logger, 'info')
  //
  //   await IndexerService.start()
  //
  //   expect(runCrawlersInOrderStub.calledOnce).to.be.true
  //   expect(startRealtimeListenersStub.calledOnce).to.be.true
  //   expect(loggerStub.calledTwice).to.be.true
  // })

  // it('should the indexer service', async () => {
  //   const scheduler = TaskSchedulerState.getInstance()
  //   const stopTaskStub = sandbox.stub(scheduler, 'stopTask')
  //   const loggerStub = sandbox.stub(logger, 'info')
  //
  //   await IndexerService.stop()
  //
  //   expect(stopTaskStub.calledOnce).to.be.true
  //   expect(loggerStub.calledOnce).to.be.true
  // })
  //
  // it('should initialize event listeners', async () => {
  //   const networks = [{ networkName: 'mainnet' }]
  //   const eventListeners = IndexerService.initializeEventListeners(networks)
  //
  //   expect(eventListeners.length).to.eq(7)
  // })
  //
  // it('should run crawlers in order', async () => {
  //   const eventListeners = [
  //     { name: 'proposal', start: sandbox.stub().resolves(true), listen: [{ enableHistorical: true }] },
  //   ]
  //   const orderedServices = [['proposal']]
  //
  //   // await IndexerService.runCrawlersInOrder(eventListeners as any, orderedServices as any)
  //
  //   expect(eventListeners[0].start.calledOnce).to.be.true
  // })
  //
  // it('should start real-time listeners', async () => {
  //   const eventListeners = [
  //     { name: 'proposal', start: sandbox.stub().resolves(true), listen: [{ enableRealtime: true }] },
  //     { name: 'vote', start: sandbox.stub().resolves(true), listen: [{ enableRealtime: false }] },
  //   ]
  //
  //   // await IndexerService.startRealtimeListeners(eventListeners as any)
  //
  //   expect(eventListeners[0].start.calledOnce).to.be.true
  //   expect(eventListeners[1].start.notCalled).to.be.true
  // })
})
