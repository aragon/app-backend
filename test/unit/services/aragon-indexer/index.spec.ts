import config from '@config'
import { NetworkHelper } from '@helpers/network'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Utils from '@helpers/utils'
import logger from '@logger'
import { BlockchainLogCrawler } from '@modules/crawlers'
import IndexerService from '@services/aragon-indexer/index'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { EnumQueueName, NetworksEnum } from '@types'
import { expect } from 'chai'
import proxyquire from 'proxyquire'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonIndexer: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()

    const scheduler = TaskSchedulerState.getInstance()
    scheduler.stopAllTasks()
  })

  describe('start', () => {
    it('should start the indexer service and execute historical crawlers', async () => {
      sandbox.stub(config.SERVICES.ARAGON_INDEXER, 'SYNC_ALL').value(true)

      const loggerStub = sandbox.stub(logger, 'info')
      sandbox.stub(NetworkHelper, 'supportedNetworks').returns([{ networkName: NetworksEnum.ethereumMainnet } as any])
      sandbox.stub(Utils, 'filterArrayByProperty').returns([{ topic: '0xTopic1', enableHistorical: true }])
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const schedulerStartStub = sandbox
        .stub(TaskSchedulerState.getInstance(), 'startTask')
        .callsFake(async (taskName: string, options: any) => {
          if (taskName === 'allPlugins') {
            for (const taskGroup of options.fn()) {
              for (const task of taskGroup) {
                const taskName = Object.keys(task)[0]
                await task[taskName].start()
              }
            }
          }
        })

      const stubSendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage')
      const SyncAllStub = { start: sandbox.stub().resolves() }
      const IndexerServiceProxy = proxyquire.noCallThru()('@services/aragon-indexer/index', {
        '@indexer/syncAll': { SyncAll: SyncAllStub },
      }).default

      await IndexerServiceProxy.start()

      expect(
        stubSendMessage.calledWithMatch(EnumQueueName.allMetrics as any, {
          id: `${EnumQueueName.allMetrics}-${NetworksEnum.ethereumMainnet}`,
          params: { network: NetworksEnum.ethereumMainnet },
        }),
      ).to.be.true

      expect(loggerStub.calledWith('IndexerService historical started' as any)).to.be.true
      expect(crawlStub.calledOnce).to.be.true
      expect(schedulerStartStub.calledTwice).to.be.true
      expect(SyncAllStub.start.calledOnce).to.be.true
    })

    it('should log an error when sync all plugins fails', async () => {
      sandbox.stub(config.SERVICES.ARAGON_INDEXER, 'SYNC_ALL').value(true)
      sandbox.stub(NetworkHelper, 'supportedNetworks').returns([{ networkName: NetworksEnum.ethereumMainnet } as any])
      const error = new Error('Test error from crawler')
      const loggerErrorStub = sandbox.stub(logger, 'error')
      const schedulerStartStub = sandbox.stub(TaskSchedulerState.getInstance(), 'startTask').resolves()

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').callsFake(async function (
        this: BlockchainLogCrawler,
      ): Promise<any> {
        if ((this as any).crawlParams.onError) {
          await (this as any).crawlParams.onError(error, { proposalIndex: '99999999999999999999' })
        }
      })

      const schedulerStub = sandbox
        .stub(TaskSchedulerState.prototype, 'startTask')
        .callsFake(async (taskName: string, options: any) => {
          if (taskName === 'allPlugins' && options.onError) {
            await options.onError(error)
          }
        })
      sandbox.stub(TaskSchedulerState, 'getInstance').returns({ startTask: schedulerStub } as any)
      const stubSendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage')

      await IndexerService.start()

      expect(stubSendMessage.calledOnce).to.be.true
      expect(loggerErrorStub.calledTwice).to.be.true
      expect(loggerErrorStub.calledWith('Error Indexer' as any)).to.be.true
      expect(loggerErrorStub.calledWith('Error sync all plugins' as any)).to.be.true

      expect(crawlStub.calledOnce).to.be.true
      expect(schedulerStub.calledTwice).to.be.true
      expect(schedulerStartStub.notCalled).to.be.true
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
      const stubRabbitMQ = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(NetworkHelper, 'supportedNetworks').returns([{ networkName: NetworksEnum.ethereumMainnet } as any])
      sandbox.stub(Utils, 'filterArrayByProperty').returns([{ topic: '0xTopic1', enableHistorical: true }])
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()

      await IndexerService.start()

      expect(crawlStub.calledTwice).to.be.true
      expect(stubRabbitMQ.calledOnce).to.be.true
    })
  })

  describe('re-sync plugins', () => {
    it('should start the re-sync task for all plugins', async () => {
      const configBackup = config.SERVICES.ARAGON_INDEXER.SYNC_ALL
      config.SERVICES.ARAGON_INDEXER.SYNC_ALL = true

      sandbox.stub(NetworkHelper, 'supportedNetworks').returns([{ networkName: NetworksEnum.ethereumMainnet } as any])
      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const schedulerStub = sandbox.stub(TaskSchedulerState.getInstance(), 'startTask').resolves()

      await IndexerService.start()

      expect(schedulerStub.calledTwice).to.be.true
      expect(schedulerStub.args[0][0]).to.eq('indexer-ethereum-mainnet')
      expect(schedulerStub.args[1][0]).to.eq('allPlugins')
      config.SERVICES.ARAGON_INDEXER.SYNC_ALL = configBackup
    })

    it('should handle errors during pooling logs task', async () => {
      const error = new Error('Pooling error')
      const loggerErrorStub = sandbox.stub(logger, 'error')

      sandbox.stub(NetworkHelper, 'supportedNetworks').returns([{ networkName: NetworksEnum.ethereumMainnet } as any])
      sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const stubSendMessage = sandbox.stub(RabbitMQHelper, 'sendMessage')

      const schedulerStub = sandbox
        .stub(TaskSchedulerState.getInstance(), 'startTask')
        .callsFake(async (taskName: string, options: any) => {
          if (taskName === 'indexer-ethereum-mainnet' && options.onError) {
            await options.onError(error)
          }
        })

      await IndexerService.start()

      expect(stubSendMessage.calledOnce).to.be.true
      expect(loggerErrorStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledWith('Error pooling logs' as any)).to.be.true
      expect(schedulerStub.called).to.be.true
    })
  })
})
