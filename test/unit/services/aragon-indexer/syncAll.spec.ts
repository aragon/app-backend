import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { Models } from '@dbModels'
import { NetworkHelper } from '@helpers/network'
import { RabbitMQHelper } from '@helpers/radditMQ'
import Web3Helper from '@helpers/web3'
import RabbitMQ from '@modules/rabbitMQ'
import utils from '@helpers/utils'
import { SyncAll } from '@indexer/syncAll'
import { EnumQueueName, NetworksEnum } from '@types'

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
      const aggregateStub = sandbox.stub(Models.Plugin, 'aggregate').resolves([
        { lastSync: 0, address: '0xPluginAddress1', network: NetworksEnum.ethereumMainnet },
        { lastSync: 10, address: '0xPluginAddress2', network: NetworksEnum.ethereumMainnet },
      ])
      const sendWithQueueLimitStub = sandbox.stub(SyncAll, 'sendWithQueueLimit').resolves()

      await SyncAll.start()

      expect(loggerStub.calledWithMatch('Start SyncAll' as any)).to.be.true
      expect(supportedNetworksStub.calledOnce).to.be.true
      expect(getBlockNumberStub.callCount).to.equal(2) // For each network
      expect(aggregateStub.callCount).to.equal(2) // For each network
      expect(sendWithQueueLimitStub.callCount).to.equal(4) // One call per plugin per network
      expect(loggerStub.calledWithMatch('End SyncAll' as any)).to.be.true
    })

    it('should skip processing if block number cannot be retrieved', async () => {
      const loggerStub = sandbox.stub(logger, 'verbose')
      sandbox.stub(NetworkHelper, 'supportedNetworks').returns([{ networkName: NetworksEnum.ethereumMainnet } as any])
      sandbox.stub(Web3Helper, 'getBlockNumber').resolves(null as any)
      const aggregateStub = sandbox.stub(Models.Plugin, 'aggregate')
      const sendWithQueueLimitStub = sandbox.stub(SyncAll, 'sendWithQueueLimit')

      await SyncAll.start()

      expect(loggerStub.calledWithMatch('Start SyncAll' as any)).to.be.true
      expect(aggregateStub.notCalled).to.be.true
      expect(sendWithQueueLimitStub.notCalled).to.be.true
    })
  })

  describe('sendWithQueueLimit', () => {
    it('should send a message to the queue if below the limit', async () => {
      const plugin = { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet }
      const getMessageCountStub = sandbox.stub(RabbitMQ, 'getMessageCount').resolves(50)
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const waitStub = sandbox.stub(utils, 'wait')
      const loggerStub = sandbox.stub(logger, 'verbose')

      await SyncAll.sendWithQueueLimit(plugin as any)

      expect(getMessageCountStub.calledOnceWith(EnumQueueName.plugins)).to.be.true
      expect(
        sendMessageStub.calledOnceWith(EnumQueueName.plugins, {
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
        .stub(RabbitMQ, 'getMessageCount')
        .onCall(0)
        .resolves(100) // Full queue
        .onCall(1)
        .resolves(50) // Below limit on retry
      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const waitStub = sandbox.stub(utils, 'wait').resolves()
      const loggerWarnStub = sandbox.stub(logger, 'warn')
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      await SyncAll.sendWithQueueLimit(plugin as any)

      expect(getMessageCountStub.callCount).to.equal(2)
      expect(waitStub.calledOnce).to.be.true
      expect(
        loggerWarnStub.calledWithMatch('Queue "log.plugins" has reached the limit (100 messages). Waiting...' as any),
      ).to.be.true
      expect(sendMessageStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWithMatch('Message sent to queue "log.plugins". Current count: 51' as any)).to.be
        .true
    })

    it('should log an error and retry when unable to get message count', async () => {
      const plugin = { address: '0xPluginAddress', network: NetworksEnum.ethereumMainnet }

      const getMessageCountStub = sandbox
        .stub(RabbitMQ, 'getMessageCount')
        .onCall(0)
        .resolves(null)
        .onCall(1)
        .resolves(50)

      const sendMessageStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const waitStub = sandbox.stub(utils, 'wait').resolves()
      const loggerErrorStub = sandbox.stub(logger, 'error')
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')

      await SyncAll.sendWithQueueLimit(plugin as any)

      expect(getMessageCountStub.calledTwice).to.be.true
      expect(loggerErrorStub.calledOnce).to.be.true
      expect(
        loggerErrorStub.calledWith(
          `Unable to get message count for queue "${EnumQueueName.plugins}". Retrying...` as any,
        ),
      ).to.be.true

      expect(waitStub.calledOnce).to.be.true
      expect(sendMessageStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith(`Message sent to queue "${EnumQueueName.plugins}". Current count: 51` as any))
        .to.be.true
    })
  })
})
