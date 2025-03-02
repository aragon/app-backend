import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { NetworksEnum } from '@types'
import AragonTransactionsService from '@services/aragon-transactions/index'
import ProviderModule from '@modules/provider'
import { NetworkHelper } from '@helpers/network'
import { TaskSchedulerState } from '@state/taskSchedulerState'
import { BlockHandler } from '@services/aragon-transactions/blockHandler'
import Web3Helper from '@helpers/web3'
import Utils from '@helpers/utils'

describe.only('AragonTransactions: index', () => {
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
      const getProviderStub = sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(providerMock)
      const subscribeStub = sandbox.stub(ProviderModule, 'subscribeToNewBlock').callsFake((networkName, callback) => {
        callback(networkName)
      })

      const processNewBlockStub = sandbox.stub(AragonTransactionsService, 'processNewBlock').resolves()

      await AragonTransactionsService.start()

      expect(loggerInfoStub.calledOnceWith('IndexerService started' as any)).to.be.true
      expect(supportedNetworksStub.calledOnce).to.be.true
      expect(getProviderStub.calledOnceWith(NetworksEnum.ethereumMainnet)).to.be.true
      expect(subscribeStub.calledOnce).to.be.true
      expect(loggerVerboseStub.calledWith('Listening to new block events' as any)).to.be.true
      expect(processNewBlockStub.calledOnce).to.be.true
      expect(loggerErrorStub.notCalled).to.be.true
    })

    it('should log an error if a provider is unavailable', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      sandbox.stub(NetworkHelper, 'supportedNetworks').returns([{ networkName: NetworksEnum.ethereumMainnet }] as any)
      sandbox.stub(ProviderModule, 'getAnyRpcProvider').returns(null)

      await AragonTransactionsService.start()

      expect(loggerErrorStub.calledOnceWith('Provider not available for network' as any)).to.be.true
    })
  })

  describe('processNewBlock', () => {
    let utilsStub

    beforeEach(() => {
      utilsStub = sandbox.stub(Utils, 'wait').resolves()
    })

    it('should fetch a block and call BlockHandler.processNewBlock', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      const blockMock = { blockNumber: 12345 }
      const stubGetBlock = sandbox.stub(Web3Helper, 'getBlock').resolves(blockMock)
      const blockHandlerStub = sandbox.stub(BlockHandler, 'processNewBlock').resolves()

      await AragonTransactionsService.processNewBlock(blockMock.blockNumber, NetworksEnum.ethereumMainnet)

      expect(utilsStub.calledOnce).to.be.true
      expect(stubGetBlock.calledOnceWith(blockMock.blockNumber, NetworksEnum.ethereumMainnet)).to.be.true
      expect(blockHandlerStub.calledOnceWith(blockMock, NetworksEnum.ethereumMainnet)).to.be.true
      expect(loggerErrorStub.notCalled).to.be.true
    })

    it('should log a warning if fetching a block fails', async () => {
      const loggerErrorStub = sandbox.stub(logger, 'error')
      sandbox.stub(Web3Helper, 'getBlock').resolves(false)

      await AragonTransactionsService.processNewBlock(12345, NetworksEnum.ethereumMainnet)
      const blockHandlerStub = sandbox.stub(BlockHandler, 'processNewBlock').resolves()
      expect(utilsStub.calledOnce).to.be.true

      expect(loggerErrorStub.calledOnceWith('Error fetching block data' as any)).to.be.true
      expect(blockHandlerStub.notCalled).to.be.true
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
