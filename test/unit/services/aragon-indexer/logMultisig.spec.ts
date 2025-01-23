import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { LogMultiSig } from '@plugins/logMultisig'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'
import { NetworksEnum } from '@types'
import { UnitTestUtils } from '@test/lib/utils'
import ProviderModule from '@modules/provider'

describe('AragonIndexer: LogMultiSig', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('start indexer', () => {
    it('should start the multi-sig events log crawler', async () => {
      const plugin = {
        network: NetworksEnum.polygonMainnet,
        address: '0x1234567890123456789012345678901234567890',
      } as any

      const fakeProviders = UnitTestUtils.getFakeProviders(sandbox)
      sandbox.stub(ProviderModule, 'getProvider').callsFake(network => fakeProviders[network] as any)

      const crawlStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves()
      const verboseStub = sandbox.stub(logger, 'verbose')

      await LogMultiSig.start(plugin)

      expect(crawlStub.calledOnce).to.be.true
      expect(verboseStub.calledWith('Start LogMultiSig' as any)).to.be.true
      expect(verboseStub.calledWith('End LogMultiSig' as any)).to.be.true
    })
  })

  // describe('processLog', () => {
  //   it('should process the proposal created log', async () => {
  //     const txLog = {
  //       data: '0x1234567890123456789012345678901234567890',
  //       topics: ['0x1234567890123456789012345678901234567890'],
  //     } as any
  //
  //     const network = NetworksEnum.polygonMainnet
  //     const verboseStub = sandbox.stub(logger, 'verbose')
  //     const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'ProposalCreated' } as any)
  //     const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns({
  //       network: network,
  //       blockNumber: 123213,
  //       transactionHash: '0x1234567890123456789012345678901234567890',
  //       address: '0x1234567890123456789012345678901234567890',
  //     } as any)
  //
  //     const proposalCreatedStub = sandbox.stub(ProposalHandler, 'proposalCreated').resolves()
  //
  //     await LogMultiSig.processLog(txLog, network)
  //
  //     expect(proposalCreatedStub.calledOnce).to.be.true
  //     expect(verboseStub.calledWith('ProposalCreated' as any)).to.be.true
  //     expect(parseLogStub.calledOnce).to.be.true
  //     expect(parseInfoLogStub.calledOnce).to.be.true
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
  //     const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns({
  //       network: network,
  //       blockNumber: 123213,
  //       transactionHash: '0x1234567890123456789012345678901234567890',
  //       address: '0x1234567890123456789012345678901234567890',
  //     } as any)
  //
  //     const proposalExecutedStub = sandbox.stub(ProposalHandler, 'proposalExecuted').resolves()
  //
  //     await LogMultiSig.processLog(txLog, network)
  //
  //     expect(proposalExecutedStub.calledOnce).to.be.true
  //     expect(verboseStub.calledWith('ProposalExecuted' as any)).to.be.true
  //     expect(parseLogStub.calledOnce).to.be.true
  //     expect(parseInfoLogStub.calledOnce).to.be.true
  //   })
  //
  //   it('should process the members added log', async () => {
  //     const txLog = {
  //       data: '0x1234567890123456789012345678901234567890',
  //       topics: ['0x1234567890123456789012345678901234567890'],
  //     } as any
  //
  //     const network = NetworksEnum.polygonMainnet
  //     const verboseStub = sandbox.stub(logger, 'verbose')
  //     const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'MembersAdded' } as any)
  //     const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns({
  //       network: network,
  //       blockNumber: 123213,
  //       transactionHash: '0x1234567890123456789012345678901234567890',
  //       address: '0x1234567890123456789012345678901234567890',
  //     } as any)
  //
  //     const membersAddedStub = sandbox.stub(MultisigHandler, 'membersAdded').resolves()
  //
  //     await LogMultiSig.processLog(txLog, network)
  //
  //     expect(membersAddedStub.calledOnce).to.be.true
  //
  //     expect(verboseStub.calledWith('MembersAdded' as any)).to.be.true
  //     expect(parseLogStub.calledOnce).to.be.true
  //     expect(parseInfoLogStub.calledOnce).to.be.true
  //   })
  //
  //   it('should process the members removed log', async () => {
  //     const txLog = {
  //       data: '0x1234567890123456789012345678901234567890',
  //       topics: ['0x1234567890123456789012345678901234567890'],
  //     } as any
  //
  //     const network = NetworksEnum.polygonMainnet
  //     const verboseStub = sandbox.stub(logger, 'verbose')
  //     const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'MembersRemoved' } as any)
  //     const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns({
  //       network: network,
  //       blockNumber: 123213,
  //       transactionHash: '0x1234567890123456789012345678901234567890',
  //       address: '0x1234567890123456789012345678901234567890',
  //     } as any)
  //
  //     const membersRemovedStub = sandbox.stub(MultisigHandler, 'membersRemoved').resolves()
  //
  //     await LogMultiSig.processLog(txLog, network)
  //     expect(membersRemovedStub.calledOnce).to.be.true
  //     expect(verboseStub.calledWith('MembersRemoved' as any)).to.be.true
  //     expect(parseLogStub.calledOnce).to.be.true
  //     expect(parseInfoLogStub.calledOnce).to.be.true
  //   })
  //
  //   it('should process the approved log', async () => {
  //     const txLog = {
  //       data: '0x1234567890123456789012345678901234567890',
  //       topics: ['0x1234567890123456789012345678901234567890'],
  //     } as any
  //
  //     const network = NetworksEnum.polygonMainnet
  //     const verboseStub = sandbox.stub(logger, 'verbose')
  //     const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'Approved' } as any)
  //     const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns({
  //       network: network,
  //       blockNumber: 123213,
  //       transactionHash: '0x1234567890123456789012345678901234567890',
  //       address: '0x1234567890123456789012345678901234567890',
  //     } as any)
  //
  //     const proposalHandlerStub = sandbox.stub(ProposalHandler, 'approved').resolves()
  //
  //     await LogMultiSig.processLog(txLog, network)
  //
  //     expect(proposalHandlerStub.calledOnce).to.be.true
  //     expect(verboseStub.calledWith('Approved' as any)).to.be.true
  //     expect(parseLogStub.calledOnce).to.be.true
  //     expect(parseInfoLogStub.calledOnce).to.be.true
  //   })
  //
  //   it('should process the multi-sig settings updated log', async () => {
  //     const txLog = {
  //       data: '0x1234567890123456789012345678901234567890',
  //       topics: ['0x1234567890123456789012345678901234567890'],
  //     } as any
  //
  //     const network = NetworksEnum.polygonMainnet
  //     const verboseStub = sandbox.stub(logger, 'verbose')
  //     const parseLogStub = sandbox.stub(Web3Helper, 'parseLog').returns({ name: 'MultisigSettingsUpdated' } as any)
  //     const parseInfoLogStub = sandbox.stub(Web3Helper, 'parseInfoLog').returns({
  //       network: network,
  //       blockNumber: 123213,
  //       transactionHash: '0x1234567890123456789012345678901234567890',
  //       address: '0x1234567890123456789012345678901234567890',
  //     } as any)
  //
  //     const pluginSettingHandlerStub = sandbox.stub(PluginSettingHandler, 'multisigSettingsUpdated').resolves()
  //
  //     await LogMultiSig.processLog(txLog, network)
  //
  //     expect(pluginSettingHandlerStub.calledOnce).to.be.true
  //     expect(verboseStub.calledWith('MultisigSettingsUpdated' as any)).to.be.true
  //     expect(parseLogStub.calledOnce).to.be.true
  //     expect(parseInfoLogStub.calledOnce).to.be.true
  //   })
  //
  //   it('should log an error for an unhandled event', async () => {
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
  //       address: '0x1234567890123456789012345678901234567890',
  //     } as any)
  //     await LogMultiSig.start(txLog, network)
  //
  //     expect(parseLogStub.calledOnce).to.be.true
  //     expect(parseInfoLogStub.calledOnce).to.be.true
  //     expect(errorStub.calledWith('Unhandled event' as any)).to.be
  //   })
  // })
})
