import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { LogGovernanceErc20 } from '@services/aragon-indexer/logGovernanceErc20'
import { NetworksEnum } from '@types'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { ProxyToken } from '@modules/proxyToken'
import { UnitTestUtils } from '@test/lib/utils'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import { GovernanceErc20Handler } from '@indexer/handlers/governanceErc20Handler'

describe('Indexer: LogGovernanceErc20', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start', () => {
    it('should start the blockchain log crawler', async () => {
      const plugin = {
        network: NetworksEnum.polygonMainnet,
        tokenAddress: '0x1234567890123456789012345678901234567890',
        address: '0x1234567890123456789012345678901234567890',
      } as any

      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const saveAndGetTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves({
        blockNumber: 123213,
      } as any)
      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      await LogGovernanceErc20.start(plugin)

      expect(crawlStub.calledOnce).to.be.true
      expect(saveAndGetTokenStub.calledOnce).to.be.true
      expect(saveAndGetTokenStub.calledWith(plugin.tokenAddress, plugin.network)).to.be.true
      expect(verboseStub.calledWith('Start LogGovernanceErc20' as any)).to.be.true
      expect(verboseStub.calledWith('End LogGovernanceErc20' as any)).to.be.true
    })
  })

  describe('processLog', () => {
    it('should process the transfer log', async () => {
      const txLog = {
        data: '0x1234567890123456789012345678901234567890',
        topics: ['0x1234567890123456789012345678901234567890'],
      } as any

      const network = NetworksEnum.polygonMainnet
      const verboseStub = sandbox.stub(logger, 'verbose')

      const fakeLogInfo = {
        network: network,
        blockNumber: 123213,
        transactionHash: '0x1234567890123456789012345678901234567890',
        address: '0x1234567890123456789012345678901234567890',
        eventName: 'Transfer',
      }

      const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'Transfer' } as any)

      const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns(fakeLogInfo)

      const GovernanceErc20HandlerStub = sandbox.stub(GovernanceErc20Handler, 'transfer').resolves()

      await LogGovernanceErc20.processLog(txLog, network)

      expect(parseLogStub.calledOnce).to.be.true
      expect(parseInfoLogStub.calledOnce).to.be.true
      expect(GovernanceErc20HandlerStub.calledOnce).to.be.true
      expect(parseInfoLogStub.calledWith(txLog, 'Transfer', network)).to.be.true
      expect(verboseStub.calledWith('Transfer' as any)).to.be.true
    })

    it('should process the delegate votes changed log', async () => {
      const txLog = {
        data: '0x1234567890123456789012345678901234567890',
        topics: ['0x1234567890123456789012345678901234567890'],
      } as any

      const network = NetworksEnum.polygonMainnet
      const verboseStub = sandbox.stub(logger, 'verbose')

      const fakeLogInfo = {
        network: network,
        blockNumber: 123213,
        transactionHash: '0x1234567890123456789012345678901234567890',
        address: '0x1234567890123456789012345678901234567890',
        eventName: 'DelegateVotesChanged',
      }

      const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'DelegateVotesChanged' } as any)

      const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns(fakeLogInfo)

      const GovernanceErc20HandlerStub = sandbox.stub(GovernanceErc20Handler, 'delegateVotesChanged').resolves()

      await LogGovernanceErc20.processLog(txLog, network)

      expect(parseLogStub.calledOnce).to.be.true
      expect(parseInfoLogStub.calledOnce).to.be.true
      expect(GovernanceErc20HandlerStub.calledOnce).to.be.true
      expect(parseInfoLogStub.calledWith(txLog, 'DelegateVotesChanged', network)).to.be.true
      expect(verboseStub.calledWith('DelegateVotesChanged' as any)).to.be.true
    })

    it('should log an error for unhandled event', async () => {
      const txLog = {
        data: '0x1234567890123456789012345678901234567890',
        topics: ['0x1234567890123456789012345678901234567890'],
      } as any

      const network = NetworksEnum.polygonMainnet
      const errorStub = sandbox.stub(logger, 'error')

      const fakeLogInfo = {
        network: network,
        blockNumber: 123213,
        transactionHash: '0x1234567890123456789012345678901234567890',
        address: '0x1234567890123456789012345678901234567890',
        eventName: 'Unknown',
      }

      const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'Unknown' } as any)

      const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns(fakeLogInfo)

      await LogGovernanceErc20.processLog(txLog, network)

      expect(parseLogStub.calledOnce).to.be.true
      expect(parseInfoLogStub.calledOnce).to.be.true
      expect(errorStub.calledWith('Unhandled event' as any)).to.be.true
    })
  })
})
