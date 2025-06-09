import * as sinon from 'sinon'
import { type SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { NetworkHelper } from '@helpers/network'
import configIndexer from '@indexer/configIndexer'
import utils from '@helpers/utils'
import config from '@config'
import { Models } from '@dbModels'
import AragonTransferService from '@services/aragon-transfers'

describe('Service: AragonTransferService', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
    const scheduler = TaskSchedulerState.getInstance()
    scheduler.stopAllTasks()
  })

  describe('start', () => {
    it('should initialize transfer service for all supported networks', async () => {
      const mockNetworks = [{ networkName: NetworksEnum.ethereumMainnet }, { networkName: NetworksEnum.polygonMainnet }]

      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(mockNetworks as any)

      // Mock database calls for both networks (2 calls each = 4 total)
      const findExistingLogStub = sandbox.stub(Models.ConfigIndexer, 'findExistingLog')
      findExistingLogStub.onCall(0).resolves({ lastSync: 12345 }) // transfers-ethereum-mainnet exists
      findExistingLogStub.onCall(1).resolves({ lastSync: 12345 }) // transfers-polygon-mainnet exists

      sandbox.stub(Models.ConfigIndexer, 'create').resolves()
      sandbox.stub(configIndexer, 'filter').returns([{ event: 'Transfer' }, { event: 'DelegateVotesChanged' } as any])

      const mockScheduler = {
        startTask: sandbox.stub().resolves(),
      }
      sandbox.stub(TaskSchedulerState, 'getInstance').returns(mockScheduler as any)

      sandbox
        .stub(utils, 'networkToAragon')
        .withArgs(NetworksEnum.ethereumMainnet)
        .returns('mainnet')
        .withArgs(NetworksEnum.polygonMainnet)
        .returns('polygon')

      sandbox.stub(config, 'NODES').value({
        mainnet: { POOLING_INTERVAL: 5000 },
        polygon: { POOLING_INTERVAL: 5000 },
      })

      await AragonTransferService.start()

      // Should be called twice (once for each network)
      expect(Models.ConfigIndexer.findExistingLog.callCount).to.equal(2)
      expect(mockScheduler.startTask.callCount).to.equal(2)
    })

    it('should create new config when none exists', async () => {
      const mockNetworks = [{ networkName: NetworksEnum.ethereumMainnet }]

      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(mockNetworks as any)
      sandbox
        .stub(Models.ConfigIndexer, 'findExistingLog')
        .onFirstCall()
        .resolves(null) // transfers config doesn't exist
        .onSecondCall()
        .resolves({ lastSync: 12345 }) // indexer config exists
      sandbox.stub(Models.ConfigIndexer, 'create').resolves()
      sandbox.stub(configIndexer, 'filter').returns([])

      const mockScheduler = { startTask: sandbox.stub().resolves() }
      sandbox.stub(TaskSchedulerState, 'getInstance').returns(mockScheduler as any)

      sandbox.stub(utils, 'networkToAragon').returns('mainnet')
      sandbox.stub(config, 'NODES').value({
        mainnet: { POOLING_INTERVAL: 5000 },
      })

      await AragonTransferService.start()

      expect(Models.ConfigIndexer.create.calledOnce).to.be.true
      expect(
        Models.ConfigIndexer.create.calledWith({
          network: NetworksEnum.ethereumMainnet,
          service: `transfers-${NetworksEnum.ethereumMainnet}`,
          lastSync: 12345,
        }),
      ).to.be.true
    })

    it('should configure task scheduler with correct parameters', async () => {
      const mockNetworks = [{ networkName: NetworksEnum.ethereumMainnet }]

      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(mockNetworks as any)
      sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves({ lastSync: 12345 })
      sandbox.stub(Models.ConfigIndexer, 'create').resolves()
      sandbox.stub(configIndexer, 'filter').returns([{ event: 'Transfer' } as any])

      const startTaskStub = sandbox.stub().resolves()
      const mockScheduler = { startTask: startTaskStub }
      sandbox.stub(TaskSchedulerState, 'getInstance').returns(mockScheduler as any)

      sandbox.stub(utils, 'networkToAragon').returns('mainnet')
      sandbox.stub(config, 'NODES').value({
        mainnet: { POOLING_INTERVAL: 10000 },
      })

      await AragonTransferService.start()

      const taskCall = startTaskStub.getCall(0)
      expect(taskCall.args[0]).to.equal(`transfers-${NetworksEnum.ethereumMainnet}`)

      const taskOptions = taskCall.args[1]
      expect(taskOptions).to.have.property('interval', 10000)
      expect(taskOptions).to.have.property('checkInterval', 5000)
      expect(taskOptions).to.have.property('runNow', true)
      expect(taskOptions).to.have.property('stopOnError', false)
      expect(taskOptions).to.have.property('fn')
      expect(taskOptions).to.have.property('onError')
    })

    it('should configure task fn callback to return correct crawler configuration', async () => {
      const mockNetworks = [{ networkName: NetworksEnum.ethereumMainnet }]

      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(mockNetworks as any)
      sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves({ lastSync: 12345 })
      sandbox.stub(Models.ConfigIndexer, 'create').resolves()
      sandbox.stub(configIndexer, 'filter').returns([{ event: 'Transfer' } as any])

      const startTaskStub = sandbox.stub().resolves()
      const mockScheduler = { startTask: startTaskStub }
      sandbox.stub(TaskSchedulerState, 'getInstance').returns(mockScheduler as any)

      sandbox.stub(utils, 'networkToAragon').returns('mainnet')
      sandbox.stub(config, 'NODES').value({
        mainnet: { POOLING_INTERVAL: 10000 },
      })

      await AragonTransferService.start()

      const taskCall = startTaskStub.getCall(0)
      const taskOptions = taskCall.args[1]

      // Test the fn callback function
      const fnResult = taskOptions.fn()
      expect(fnResult).to.be.an('array')
      expect(fnResult).to.have.lengthOf(1)
      expect(fnResult[0]).to.be.an('array')
      expect(fnResult[0][0]).to.have.property('poolingCrawler')
      expect(fnResult[0][0]).to.have.property('params')
      expect(fnResult[0][0].params).to.deep.include({
        logService: `transfers-${NetworksEnum.ethereumMainnet}`,
        network: NetworksEnum.ethereumMainnet,
      })
    })

    it('should configure onError callback to log errors correctly', async () => {
      const mockNetworks = [{ networkName: NetworksEnum.ethereumMainnet }]

      sandbox.stub(NetworkHelper, 'supportedNetworks').returns(mockNetworks as any)
      sandbox.stub(Models.ConfigIndexer, 'findExistingLog').resolves({ lastSync: 12345 })
      sandbox.stub(Models.ConfigIndexer, 'create').resolves()
      sandbox.stub(configIndexer, 'filter').returns([{ event: 'Transfer' } as any])

      const startTaskStub = sandbox.stub().resolves()
      const mockScheduler = { startTask: startTaskStub }
      sandbox.stub(TaskSchedulerState, 'getInstance').returns(mockScheduler as any)

      sandbox.stub(utils, 'networkToAragon').returns('mainnet')
      sandbox.stub(config, 'NODES').value({
        mainnet: { POOLING_INTERVAL: 10000 },
      })

      const loggerErrorStub = sandbox.stub(logger, 'error')

      await AragonTransferService.start()

      const taskCall = startTaskStub.getCall(0)
      const taskOptions = taskCall.args[1]

      // Test the onError callback function
      const testError = new Error('Test pooling error')
      taskOptions.onError(testError)

      expect(loggerErrorStub.calledWith('Error pooling logs' as any)).to.be.true
    })
  })

  describe('stop', () => {
    it('should log service stop message', async () => {
      const loggerInfoStub = sandbox.stub(logger, 'info')

      await AragonTransferService.stop()

      expect(loggerInfoStub.calledWith('Transfer service stopped' as any)).to.be.true
    })
  })

  describe('service configuration', () => {
    it('should have correct required connections', () => {
      expect(AragonTransferService.NEED_CONNECTIONS).to.deep.equal(['MONGODB', 'BLOCKCHAIN', 'RABBITMQ'])
    })

    it('should have repeaters property', () => {
      expect(AragonTransferService).to.have.property('repeaters')
      expect(AragonTransferService.repeaters).to.be.an('object')
    })
  })
})
