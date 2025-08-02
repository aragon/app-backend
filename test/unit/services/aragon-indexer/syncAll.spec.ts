import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { Models } from '@dbModels'
import { NetworkHelper } from '@helpers/network'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import utils from '@helpers/utils'
import { SyncAll } from '@indexer/syncAll'
import { EnumQueueName, NetworksEnum } from '@types'
import DBCrawler from '@models/utils/crawler'

describe('AragonIndexer: SyncAll', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should start the synchronization process for all supported networks', async () => {
      const loggerStub = sandbox.stub(logger, 'verbose')
      const supportedNetworksStub = sandbox
        .stub(NetworkHelper, 'supportedNetworks')
        .returns([
          { networkName: NetworksEnum.ethereumMainnet } as any,
          { networkName: NetworksEnum.polygonMainnet } as any,
        ])
      const getBlockNumberStub = sandbox.stub(Web3Helper, 'getBlockNumber').resolves(100)

      const onDocumentStub = sandbox.stub(SyncAll, 'onDocument').resolves()

      const crawlerStub = sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        this.onDocument(true)
      })

      await SyncAll.start()

      expect(loggerStub.calledWithMatch('Start SyncAll' as any)).to.be.true
      expect(supportedNetworksStub.calledOnce).to.be.true
      expect(getBlockNumberStub.callCount).to.equal(2) // For each network
      expect(onDocumentStub.callCount).to.equal(2) // One call per plugin per network
      expect(loggerStub.calledWithMatch('End SyncAll' as any)).to.be.true
      expect(crawlerStub.callCount).to.equal(2) // One call per network
    })

    it('should skip processing if block number cannot be retrieved', async () => {
      const loggerStub = sandbox.stub(logger, 'verbose')
      sandbox.stub(NetworkHelper, 'supportedNetworks').returns([{ networkName: NetworksEnum.ethereumMainnet } as any])
      sandbox.stub(Web3Helper, 'getBlockNumber').resolves(null as any)
      const aggregateStub = sandbox.stub(Models.Plugin, 'aggregate')
      const sendWithQueueLimitStub = sandbox.stub(SyncAll, 'onDocument')

      await SyncAll.start()

      expect(loggerStub.calledWithMatch('Start SyncAll' as any)).to.be.true
      expect(aggregateStub.notCalled).to.be.true
      expect(sendWithQueueLimitStub.notCalled).to.be.true
    })

    it('should error the sync all', async () => {
      const loggerStub = sandbox.stub(logger, 'verbose')
      const supportedNetworksStub = sandbox
        .stub(NetworkHelper, 'supportedNetworks')
        .returns([
          { networkName: NetworksEnum.ethereumMainnet } as any,
          { networkName: NetworksEnum.polygonMainnet } as any,
        ])
      const getBlockNumberStub = sandbox.stub(Web3Helper, 'getBlockNumber').resolves(100)
      const stubLoggerError = sandbox.stub(logger, 'error')

      sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        this.onError(true)
      })

      await SyncAll.start()

      expect(loggerStub.calledWithMatch('Start SyncAll' as any)).to.be.true
      expect(supportedNetworksStub.calledOnce).to.be.true
      expect(getBlockNumberStub.callCount).to.equal(2) // For each network
      expect(loggerStub.calledWithMatch('End SyncAll' as any)).to.be.true
      expect(stubLoggerError.calledTwice).to.be.true
      expect(stubLoggerError.calledWithMatch('Error Sync all' as any)).to.be.true
    })
  })

  describe('onDocument', () => {
    it('should send a message to the queue if below the limit', async () => {
      const plugin = { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet }
      const getMessageCountStub = sandbox.stub(RabbitMQHelper, 'getQueueMessageCount').resolves(20)
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const waitStub = sandbox.stub(utils, 'wait')
      const loggerStub = sandbox.stub(logger, 'verbose')

      await SyncAll.onDocument(plugin as any)

      expect(getMessageCountStub.calledOnceWith(EnumQueueName.requeue)).to.be.true
      expect(
        sendMessageStub.calledOnceWith(EnumQueueName.requeue, {
          id: plugin.address,
          params: { address: plugin.address, network: plugin.network },
        }),
      ).to.be.true
      expect(loggerStub.calledWithMatch('Message sent to queue' as any)).to.be.true
      expect(waitStub.notCalled).to.be.true
    })

    it('should retry sending a message when the queue is full', async () => {
      const plugin = { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet }
      const getMessageCountStub = sandbox
        .stub(RabbitMQHelper, 'getQueueMessageCount')
        .onCall(0)
        .resolves(50) // Full queue
        .onCall(1)
        .resolves(25) // Below limit on retry
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const waitStub = sandbox.stub(utils, 'wait').resolves()
      const loggerWarnStub = sandbox.stub(logger, 'warn')
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      await SyncAll.onDocument(plugin as any)

      expect(getMessageCountStub.callCount).to.equal(2)
      expect(waitStub.calledOnce).to.be.true
      expect(loggerWarnStub.calledWithMatch('Queue "log.requeue" has reached the limit. Waiting...' as any)).to.be.true
      expect(sendMessageStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWithMatch('Message sent to queue "log.requeue"' as any)).to.be.true
    })

    it('should log an error and retry when unable to get message count', async () => {
      const plugin = { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet }

      const getMessageCountStub = sandbox
        .stub(RabbitMQHelper, 'getQueueMessageCount')
        .onCall(0)
        .resolves(null)
        .onCall(1)
        .resolves(40)

      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const waitStub = sandbox.stub(utils, 'wait').resolves()
      const loggerErrorStub = sandbox.stub(logger, 'error')
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      await SyncAll.onDocument(plugin as any)

      expect(getMessageCountStub.calledTwice).to.be.true
      expect(loggerErrorStub.calledOnce).to.be.true
      expect(
        loggerErrorStub.calledWith(
          `Unable to get message count for queue "${EnumQueueName.requeue}". Retrying...` as any,
        ),
      ).to.be.true

      expect(waitStub.calledOnce).to.be.true
      expect(sendMessageStub.calledOnce).to.be.true
      expect(loggerVerboseStub.args[0][0]).to.be.eq(`Message sent to queue "${EnumQueueName.requeue}"` as any)
    })

    it('should handle the aggregation query and handle the crawler', async () => {
      const loggerStub = sandbox.stub(logger, 'verbose')
      const supportedNetworksStub = sandbox
        .stub(NetworkHelper, 'supportedNetworks')
        .returns([
          { networkName: NetworksEnum.ethereumMainnet } as any,
          { networkName: NetworksEnum.polygonMainnet } as any,
        ])
      const getBlockNumberStub = sandbox.stub(Web3Helper, 'getBlockNumber').resolves(100)

      sandbox.stub(DBCrawler.prototype, 'crawl').callsFake(async function (this: any) {
        this.aggregate()
      })

      await SyncAll.start()

      expect(loggerStub.calledWithMatch('Start SyncAll' as any)).to.be.true
      expect(supportedNetworksStub.calledOnce).to.be.true
      expect(getBlockNumberStub.callCount).to.equal(2) // For each network
      expect(loggerStub.calledWithMatch('End SyncAll' as any)).to.be.true
    })
  })
})
