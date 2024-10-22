import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { LogTokenVoting } from '@services/aragon-indexer/logTokenVoting'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { NetworksEnum } from '@types'
import { UnitTestUtils } from '@test/lib/utils'
import ProviderModule from '@modules/provider'
import Web3Helper from '@helpers/web3'
import { ProposalHandler } from '@indexer/handlers/proposalHandler'
import { PluginSettingHandler } from '@indexer/handlers/pluginSettingHandler'
import { GovernanceErc20Handler } from '@indexer/handlers/governanceErc20Handler'

describe('Indexer: LogTokenVoting', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start token voting blockchain crawler', () => {
    it('should start the token voting events log crawler', async () => {
      const plugin = {
        network: NetworksEnum.polygonMainnet,
        address: '0x1234567890123456789012345678901234567890',
      } as any

      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      await LogTokenVoting.start(plugin)

      expect(crawlStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Start LogTokenVoting' as any)).to.be.true
      expect(verboseStub.calledWith('End LogTokenVoting' as any)).to.be.true
    })
  })

  // describe('should process log', () => {
  //   it('should process the vote cast log', async () => {
  //     const txLog = {
  //       data: '0x1234567890123456789012345678901234567890',
  //       topics: ['0x1234567890123456789012345678901234567890'],
  //     } as any
  //
  //     const network = NetworksEnum.polygonMainnet
  //     const verboseStub = sandbox.stub(logger, 'verbose')
  //     const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'VoteCast' } as any)
  //     const voteCastStub = sandbox.stub(ProposalHandler, 'voteCast').resolves()
  //     const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns({
  //       network: network,
  //       blockNumber: 123213,
  //       transactionHash: '0x1234567890123456789012345678901234567890',
  //     } as any)
  //
  //     await LogTokenVoting.processLog(txLog, network)
  //
  //     expect(verboseStub.calledWith('VoteCast' as any)).to.be.true
  //     expect(parseLogStub.calledOnce).to.be.true
  //     expect(parseInfoLogStub.calledOnce).to.be.true
  //     expect(voteCastStub.calledOnce).to.be.true
  //   })
  //
  //   it('should process the proposal created log', async () => {
  //     const txLog = {
  //       data: '0x1234567890123456789012345678901234567890',
  //       topics: ['0x1234567890123456789012345678901234567890'],
  //     } as any
  //
  //     const network = NetworksEnum.polygonMainnet
  //     const verboseStub = sandbox.stub(logger, 'verbose')
  //     const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'ProposalCreated' } as any)
  //     const proposalCreatedStub = sandbox.stub(ProposalHandler, 'proposalCreated').resolves()
  //     const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns({
  //       network: network,
  //       blockNumber: 123213,
  //       transactionHash: '0x1234567890123456789012345678901234567890',
  //     } as any)
  //
  //     await LogTokenVoting.processLog(txLog, network)
  //
  //     expect(verboseStub.calledWith('ProposalCreated' as any)).to.be.true
  //     expect(parseLogStub.calledOnce).to.be.true
  //     expect(parseInfoLogStub.calledOnce).to.be.true
  //     expect(proposalCreatedStub.calledOnce).to.be.true
  //   })
  //
  //   it('should process the proposal executed log', async () => {
  //     const txLog = {
  //       data: '0x1234567890123456789012345678901234567890',
  //       topics: ['0x1234567890123456789012345678901234567890'],
  //     } as any
  //
  //     const network = NetworksEnum.polygonMainnet
  //     const verboseStub = sandbox.stub(logger, 'verbose')
  //     const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'ProposalExecuted' } as any)
  //     const proposalExecutedStub = sandbox.stub(ProposalHandler, 'proposalExecuted').resolves()
  //     const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns({
  //       network: network,
  //       blockNumber: 123213,
  //       transactionHash: '0x1234567890123456789012345678901234567890',
  //     } as any)
  //
  //     await LogTokenVoting.processLog(txLog, network)
  //
  //     expect(verboseStub.calledWith('ProposalExecuted' as any)).to.be.true
  //     expect(parseLogStub.calledOnce).to.be.true
  //     expect(parseInfoLogStub.calledOnce).to.be.true
  //     expect(proposalExecutedStub.calledOnce).to.be.true
  //   })
  //
  //   it('should process the voting settings updated log', async () => {
  //     const txLog = {
  //       data: '0x1234567890123456789012345678901234567890',
  //       topics: ['0x1234567890123456789012345678901234567890'],
  //     } as any
  //
  //     const network = NetworksEnum.polygonMainnet
  //     const verboseStub = sandbox.stub(logger, 'verbose')
  //     const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'VotingSettingsUpdated' } as any)
  //     const votingSettingsUpdatedStub = sandbox.stub(PluginSettingHandler, 'votingSettingsUpdated').resolves()
  //     const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns({
  //       network: network,
  //       blockNumber: 123213,
  //       transactionHash: '0x1234567890123456789012345678901234567890',
  //     } as any)
  //
  //     await LogTokenVoting.processLog(txLog, network)
  //
  //     expect(verboseStub.calledWith('VotingSettingsUpdated' as any)).to.be.true
  //     expect(parseLogStub.calledOnce).to.be.true
  //     expect(parseInfoLogStub.calledOnce).to.be.true
  //     expect(votingSettingsUpdatedStub.calledOnce).to.be.true
  //   })
  //
  //   it('should process the transfer log', async () => {
  //     const txLog = {
  //       data: '0x1234567890123456789012345678901234567890',
  //       topics: ['0x1234567890123456789012345678901234567890'],
  //     } as any
  //
  //     const network = NetworksEnum.polygonMainnet
  //     const verboseStub = sandbox.stub(logger, 'verbose')
  //
  //     const fakeLogInfo = {
  //       network: network,
  //       blockNumber: 123213,
  //       transactionIndex: 1,
  //       logIndex: 1,
  //       transactionHash: '0x1234567890123456789012345678901234567890',
  //       address: '0x1234567890123456789012345678901234567890',
  //       eventName: 'Transfer',
  //     }
  //
  //     const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'Transfer' } as any)
  //
  //     const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns(fakeLogInfo)
  //
  //     const GovernanceErc20HandlerStub = sandbox.stub(GovernanceErc20Handler, 'transfer').resolves()
  //
  //     await LogTokenVoting.processLog(txLog, network)
  //
  //     expect(parseLogStub.calledOnce).to.be.true
  //     expect(parseInfoLogStub.calledOnce).to.be.true
  //     expect(GovernanceErc20HandlerStub.calledOnce).to.be.true
  //     expect(parseInfoLogStub.calledWith(txLog, 'Transfer', network)).to.be.true
  //     expect(verboseStub.calledWith('Transfer' as any)).to.be.true
  //   })
  //
  //   it('should process the delegate votes changed log', async () => {
  //     const txLog = {
  //       data: '0x1234567890123456789012345678901234567890',
  //       topics: ['0x1234567890123456789012345678901234567890'],
  //     } as any
  //
  //     const network = NetworksEnum.polygonMainnet
  //     const verboseStub = sandbox.stub(logger, 'verbose')
  //
  //     const fakeLogInfo = {
  //       network: network,
  //       blockNumber: 123213,
  //       transactionIndex: 1,
  //       logIndex: 1,
  //       transactionHash: '0x1234567890123456789012345678901234567890',
  //       address: '0x1234567890123456789012345678901234567890',
  //       eventName: 'DelegateVotesChanged',
  //     }
  //
  //     const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'DelegateVotesChanged' } as any)
  //
  //     const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns(fakeLogInfo)
  //
  //     const GovernanceErc20HandlerStub = sandbox.stub(GovernanceErc20Handler, 'delegateVotesChanged').resolves()
  //
  //     await LogTokenVoting.processLog(txLog, network)
  //
  //     expect(parseLogStub.calledOnce).to.be.true
  //     expect(parseInfoLogStub.calledOnce).to.be.true
  //     expect(GovernanceErc20HandlerStub.calledOnce).to.be.true
  //     expect(parseInfoLogStub.calledWith(txLog, 'DelegateVotesChanged', network)).to.be.true
  //     expect(verboseStub.calledWith('DelegateVotesChanged' as any)).to.be.true
  //   })
  //
  //   it('should process the unhandled event log', async () => {
  //     const txLog = {
  //       data: '0x1234567890123456789012345678901234567890',
  //       topics: ['0x1234567890123456789012345678901234567890'],
  //     } as any
  //
  //     const network = NetworksEnum.polygonMainnet
  //     const errorStub = sandbox.stub(logger, 'error')
  //     const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'Unknown' } as any)
  //     const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns({
  //       network: network,
  //       blockNumber: 123213,
  //       transactionHash: '0x1234567890123456789012345678901234567890',
  //     } as any)
  //
  //     await LogTokenVoting.processLog(txLog, network)
  //
  //     expect(parseLogStub.calledOnce).to.be.true
  //     expect(parseInfoLogStub.calledOnce).to.be.true
  //     expect(errorStub.calledWith('Unhandled event' as any)).to.be.true
  //   })
  // })
})
