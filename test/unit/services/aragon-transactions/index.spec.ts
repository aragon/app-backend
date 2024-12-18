import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import AragonTransactionsService from '@services/aragon-transactions/index'
import ProviderModule from '@modules/provider'
import { NetworkHelper } from '@helpers/network'
import { TaskSchedulerState } from '@state/taskSchedulerState'

describe('aragon-transactions: index', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should initialize providers and subscribe to new block events', async () => {
      const loggerInfoStub = sandbox.stub(logger, 'info')
      const loggerVerboseStub = sandbox.stub(logger, 'verbose')
      const loggerErrorStub = sandbox.stub(logger, 'error')

      const supportedNetworksStub = sandbox
        .stub(NetworkHelper, 'supportedNetworks')
        .returns([{ networkName: NetworksEnum.ethereumMainnet }] as any)

      const providerMock = { getBlock: sandbox.stub() } as any
      const getProviderStub = sandbox.stub(ProviderModule, 'getProvider').returns(providerMock)
      const subscribeStub = sandbox.stub(ProviderModule, 'subscribeToNewBlock')

      await AragonTransactionsService.start()

      expect(loggerInfoStub.calledOnceWith('IndexerService started' as any)).to.be.true
      expect(supportedNetworksStub.calledOnce).to.be.true
      expect(getProviderStub.calledOnceWith(NetworksEnum.ethereumMainnet)).to.be.true
      expect(subscribeStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Listening to new block events' as any)).to.be.true
      expect(loggerErrorStub.notCalled).to.be.true
    })

    it('should log an error if a provider is unavailable', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      sandbox.stub(NetworkHelper, 'supportedNetworks').returns([{ networkName: NetworksEnum.ethereumMainnet }] as any)
      sandbox.stub(ProviderModule, 'getProvider').returns(null)

      await AragonTransactionsService.start()

      expect(loggerErrorStub.calledOnceWith('Provider not available for network' as any)).to.be.true
    })
  })

  describe('stop', () => {
    it('should stop the task scheduler and log service stop', async () => {
      const schedulerStub = sandbox.stub(TaskSchedulerState.getInstance(), 'stopTask')
      const loggerInfoStub = sandbox.stub(logger, 'info')

      await AragonTransactionsService.stop()

      expect(schedulerStub.calledOnceWith('indexer')).to.be.true
      expect(loggerInfoStub.calledOnceWith('IndexerService service stopped' as any)).to.be.true
    })
  })
})
