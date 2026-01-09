import { Models } from '@dbModels'
import { NetworkHelper } from '@helpers/network'
import RabbitMQHelper from '@helpers/rabbitMQ'
import utils from '@helpers/utils'
import Web3Helper from '@helpers/web3'
import { SyncAll } from '@indexer/syncAll'
import logger from '@logger'
import DBCrawler from '@models/utils/crawler'
import { EnumQueueName, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

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
    it('should send a message to the queue using sendMessageWithThrottle', async () => {
      const plugin = { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet, id: 'plugin-1' }
      const sendMessageWithThrottleStub = sandbox.stub(RabbitMQHelper, 'sendMessageWithThrottle').resolves()

      await SyncAll.onDocument(plugin as any)

      expect(
        sendMessageWithThrottleStub.calledOnceWith(EnumQueueName.requeue, {
          id: plugin.address,
          params: { address: plugin.address, network: plugin.network, pluginId: plugin.id },
        }),
      ).to.be.true
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
