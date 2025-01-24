import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import IndexerService from '@services/aragon-indexer/index'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import logger from '@logger'
import EventListener from '@modules/eventListener'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import Utils from '@helpers/utils'
import { NetworkHelper } from '@helpers/network'
import { NetworksEnum } from '@types'
import { CustomInstall } from '@indexer/customInstall'
import config from '@config'

describe('AragonIndexer: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should start the indexer service and execute historical crawlers', async () => {
      const configBackup = config.SERVICES.ARAGON_INDEXER.SYNC_ALL
      config.SERVICES.ARAGON_INDEXER.SYNC_ALL = true
      const loggerStub = sandbox.stub(logger, 'info')
      sandbox.stub(NetworkHelper, 'supportedNetworks').returns([{ networkName: NetworksEnum.ethereumMainnet } as any])
      sandbox.stub(Utils, 'filterArrayByProperty').returns([{ topic: '0xTopic1', enableHistorical: true }])
      const customInstall = sandbox.stub(CustomInstall, 'install').resolves()
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()

      const subscribeStub = sandbox.stub(EventListener.prototype, 'subscribeEventsByNewBlock')
      const schedulerStartStub = sandbox.stub(TaskSchedulerState.getInstance(), 'startTask').resolves()

      await IndexerService.start()

      expect(loggerStub.calledWith('IndexerService historical started' as any)).to.be.true
      expect(customInstall.calledOnce).to.be.true
      expect(crawlStub.calledOnce).to.be.true
      expect(subscribeStub.calledOnce).to.be.true
      expect(schedulerStartStub.calledOnce).to.be.true
      expect(loggerStub.calledWith('IndexerService historical logs end' as any)).to.be.true

      config.SERVICES.ARAGON_INDEXER.SYNC_ALL = configBackup
    })
  })

  describe('stop', () => {
    it('should stop the indexer service', async () => {
      const schedulerStub = sandbox.stub(TaskSchedulerState.getInstance(), 'stopTask')
      const loggerStub = sandbox.stub(logger, 'info')

      await IndexerService.stop()

      expect(schedulerStub.calledOnceWith('allPlugins')).to.be.true
      expect(loggerStub.calledOnceWith('IndexerService service stopped' as any)).to.be.true
    })
  })

  describe('historical crawlers', () => {
    it('should execute crawlers for historical logs', async () => {
      const customInstall = sandbox.stub(CustomInstall, 'install').resolves()
      sandbox.stub(NetworkHelper, 'supportedNetworks').returns([{ networkName: NetworksEnum.ethereumMainnet } as any])
      sandbox.stub(Utils, 'filterArrayByProperty').returns([{ topic: '0xTopic1', enableHistorical: true }])

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const subscribeStub = sandbox.stub(EventListener.prototype, 'subscribeEventsByNewBlock').resolves()

      await IndexerService.start()

      expect(customInstall.calledOnce).to.be.true // Ensure the crawl method was called once
      expect(crawlStub.calledOnce).to.be.true // Ensure the crawl method was called once
      expect(subscribeStub.calledOnce).to.be.true // Ensure the subscribe method was stubbed and not executed
    })
  })

  describe('real-time listeners', () => {
    it('should initialize and subscribe to real-time events', async () => {
      sandbox.stub(NetworkHelper, 'supportedNetworks').returns([{ networkName: NetworksEnum.ethereumMainnet } as any])
      const subscribeStub = sandbox.stub(EventListener.prototype, 'subscribeEventsByNewBlock')
      sandbox.stub(CustomInstall, 'install').resolves()
      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()

      await IndexerService.start()

      expect(subscribeStub.calledOnce).to.be.true
    })
  })

  describe('re-sync plugins', () => {
    it('should start the re-sync task for all plugins', async () => {
      const configBackup = config.SERVICES.ARAGON_INDEXER.SYNC_ALL
      config.SERVICES.ARAGON_INDEXER.SYNC_ALL = true

      sandbox.stub(NetworkHelper, 'supportedNetworks').returns([{ networkName: NetworksEnum.ethereumMainnet } as any])
      sandbox.stub(CustomInstall, 'install').resolves()
      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      sandbox.stub(EventListener.prototype, 'subscribeEventsByNewBlock')

      const schedulerStub = sandbox.stub(TaskSchedulerState.getInstance(), 'startTask').resolves()

      await IndexerService.start()

      expect(schedulerStub.calledOnce).to.be.true
      expect(schedulerStub.args[0][0]).to.eq('allPlugins')
      config.SERVICES.ARAGON_INDEXER.SYNC_ALL = configBackup
    })
  })
})
