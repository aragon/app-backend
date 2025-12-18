import config from '@config'
import ConfigIndexerHelper from '@helpers/configIndexer'
import { NetworkHelper } from '@helpers/network'
import utils from '@helpers/utils'
import logger from '@logger'
import { TransferIndexer } from '@services/aragon-transfers/transferIndexer'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'

describe('AragonTransfers: transferIndexer', () => {
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
    it('should start transfer indexer tasks for all supported networks', async () => {
      const mockNetworks = [{ networkName: NetworksEnum.ethereumMainnet }, { networkName: NetworksEnum.polygonMainnet }]

      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(mockNetworks as any)
      sandbox
        .stub(ConfigIndexerHelper.builders, 'indexer')
        .withArgs(NetworksEnum.ethereumMainnet)
        .returns('indexer-ethereum-mainnet' as any)
        .withArgs(NetworksEnum.polygonMainnet)
        .returns('indexer-polygon-mainnet' as any)

      sandbox
        .stub(utils, 'networkToAragon')
        .withArgs(NetworksEnum.ethereumMainnet)
        .returns('ETHEREUM_MAINNET' as any)
        .withArgs(NetworksEnum.polygonMainnet)
        .returns('POLYGON_MAINNET' as any)

      const mockScheduler = {
        startTask: sandbox.stub().resolves(),
      }
      sandbox.stub(TaskSchedulerState, 'getInstance').returns(mockScheduler as any)

      const loggerStub = sandbox.stub(logger, 'info')

      await TransferIndexer.start()

      expect(mockScheduler.startTask.callCount).to.equal(2)
      expect(loggerStub.calledWith('TransferIndexer started' as any)).to.be.true
      expect(loggerStub.calledWith('TransferIndexer all tasks started' as any)).to.be.true
    })

    it('should configure task scheduler with correct options', async () => {
      const mockNetworks = [{ networkName: NetworksEnum.ethereumMainnet }]

      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(mockNetworks as any)
      sandbox.stub(ConfigIndexerHelper.builders, 'indexer').returns('test-log-service' as any)
      sandbox.stub(utils, 'networkToAragon').returns('ETHEREUM_MAINNET' as any)

      const mockScheduler = {
        startTask: sandbox.stub().resolves(),
      }
      sandbox.stub(TaskSchedulerState, 'getInstance').returns(mockScheduler as any)
      sandbox.stub(logger, 'info')

      // Mock config values
      sandbox.stub(config.NODES.ETHEREUM_MAINNET, 'POOLING_INTERVAL').value(60000)

      await TransferIndexer.start()

      expect(mockScheduler.startTask.calledOnce).to.be.true

      const taskOptions = mockScheduler.startTask.args[0][1]
      expect(taskOptions).to.have.property('fn')
      expect(taskOptions).to.have.property('interval', 60000)
      expect(taskOptions).to.have.property('checkInterval', 30000)
      expect(taskOptions).to.have.property('runNow', true)
      expect(taskOptions).to.have.property('stopOnError', false)
      expect(taskOptions).to.have.property('onError')
    })

    it('should create PoolingCrawler with correct configuration', async () => {
      const mockNetworks = [{ networkName: NetworksEnum.ethereumMainnet }]

      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(mockNetworks as any)
      sandbox.stub(ConfigIndexerHelper.builders, 'indexer').returns('test-log-service' as any)
      sandbox.stub(utils, 'networkToAragon').returns('ETHEREUM_MAINNET' as any)

      let capturedParams: any = null

      const mockScheduler = {
        startTask: sandbox.stub().callsFake((taskName: string, options: any) => {
          // Capture the PoolingCrawler params by executing the fn
          const taskGroups = options.fn()
          if (taskGroups && taskGroups.length > 0 && taskGroups[0].length > 0) {
            const firstTask = taskGroups[0][0]
            capturedParams = firstTask.params
          }
          return Promise.resolve()
        }),
      }
      sandbox.stub(TaskSchedulerState, 'getInstance').returns(mockScheduler as any)
      sandbox.stub(logger, 'info')

      await TransferIndexer.start()

      expect(capturedParams).to.deep.equal({
        logService: 'test-log-service',
        network: NetworksEnum.ethereumMainnet,
        includeTransfer: true,
      })
    })

    it('should log pooling start for each network', async () => {
      const mockNetworks = [{ networkName: NetworksEnum.ethereumMainnet }, { networkName: NetworksEnum.polygonMainnet }]

      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(mockNetworks as any)
      sandbox.stub(ConfigIndexerHelper.builders, 'indexer').returns('test-log-service' as any)
      sandbox.stub(utils, 'networkToAragon').returns('ETHEREUM_MAINNET' as any)

      const mockScheduler = {
        startTask: sandbox.stub().resolves(),
      }
      sandbox.stub(TaskSchedulerState, 'getInstance').returns(mockScheduler as any)

      const loggerStub = sandbox.stub(logger, 'info')

      await TransferIndexer.start()

      expect(loggerStub.calledWith('TransferIndexer pooling start' as any)).to.be.true
    })

    it('should handle errors during task execution via onError callback', async () => {
      const mockNetworks = [{ networkName: NetworksEnum.ethereumMainnet }]
      const testError = new Error('Pooling error')

      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(mockNetworks as any)
      sandbox.stub(ConfigIndexerHelper.builders, 'indexer').returns('test-log-service' as any)
      sandbox.stub(utils, 'networkToAragon').returns('ETHEREUM_MAINNET' as any)

      const mockScheduler = {
        startTask: sandbox.stub().callsFake(async (taskName: string, options: any) => {
          // Simulate error by calling onError
          await options.onError(testError)
        }),
      }
      sandbox.stub(TaskSchedulerState, 'getInstance').returns(mockScheduler as any)

      const loggerErrorStub = sandbox.stub(logger, 'error')
      sandbox.stub(logger, 'info')

      await TransferIndexer.start()

      expect(loggerErrorStub.calledOnce).to.be.true
      expect(loggerErrorStub.calledWith('Error pooling transfer logs' as any)).to.be.true
    })

    it('should process multiple networks in parallel', async () => {
      const mockNetworks = [
        { networkName: NetworksEnum.ethereumMainnet },
        { networkName: NetworksEnum.polygonMainnet },
        { networkName: NetworksEnum.baseMainnet },
      ]

      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(mockNetworks as any)
      sandbox.stub(ConfigIndexerHelper.builders, 'indexer').returns('test-log-service' as any)
      sandbox.stub(utils, 'networkToAragon').returns('ETHEREUM_MAINNET' as any)

      const mockScheduler = {
        startTask: sandbox.stub().resolves(),
      }
      sandbox.stub(TaskSchedulerState, 'getInstance').returns(mockScheduler as any)
      sandbox.stub(logger, 'info')

      await TransferIndexer.start()

      expect(mockScheduler.startTask.callCount).to.equal(3)
    })

    it('should use correct logService for each network', async () => {
      const mockNetworks = [{ networkName: NetworksEnum.ethereumMainnet }, { networkName: NetworksEnum.polygonMainnet }]

      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(mockNetworks as any)
      const builderStub = sandbox.stub(ConfigIndexerHelper.builders, 'indexer')
      builderStub.withArgs(NetworksEnum.ethereumMainnet).returns('indexer-ethereum-mainnet' as any)
      builderStub.withArgs(NetworksEnum.polygonMainnet).returns('indexer-polygon-mainnet' as any)

      sandbox.stub(utils, 'networkToAragon').returns('ETHEREUM_MAINNET' as any)

      const mockScheduler = {
        startTask: sandbox.stub().resolves(),
      }
      sandbox.stub(TaskSchedulerState, 'getInstance').returns(mockScheduler as any)
      sandbox.stub(logger, 'info')

      await TransferIndexer.start()

      expect(builderStub.calledWith(NetworksEnum.ethereumMainnet)).to.be.true
      expect(builderStub.calledWith(NetworksEnum.polygonMainnet)).to.be.true
      expect(mockScheduler.startTask.args[0][0]).to.equal('indexer-ethereum-mainnet')
      expect(mockScheduler.startTask.args[1][0]).to.equal('indexer-polygon-mainnet')
    })

    it('should use POOLING_INTERVAL from config for each network', async () => {
      const mockNetworks = [{ networkName: NetworksEnum.ethereumMainnet }]

      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(mockNetworks as any)
      sandbox.stub(ConfigIndexerHelper.builders, 'indexer').returns('test-log-service' as any)
      sandbox.stub(utils, 'networkToAragon').returns('ETHEREUM_MAINNET' as any)

      const mockScheduler = {
        startTask: sandbox.stub().resolves(),
      }
      sandbox.stub(TaskSchedulerState, 'getInstance').returns(mockScheduler as any)
      sandbox.stub(logger, 'info')

      // Mock custom interval
      const customInterval = 90000
      sandbox.stub(config.NODES.ETHEREUM_MAINNET, 'POOLING_INTERVAL').value(customInterval)

      await TransferIndexer.start()

      const taskOptions = mockScheduler.startTask.args[0][1]
      expect(taskOptions.interval).to.equal(customInterval)
    })
  })

  describe('stop', () => {
    it('should log that the indexer stopped', async () => {
      const loggerStub = sandbox.stub(logger, 'info')

      await TransferIndexer.stop()

      expect(loggerStub.calledOnceWith('TransferIndexer stopped' as any)).to.be.true
    })
  })
})
