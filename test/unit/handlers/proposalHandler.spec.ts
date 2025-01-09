import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { EnumQueueName, ILogInfo, IMetricAction, IPluginInterfaceType, IProposalMetadata, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { ProposalHandler } from '@handlers/proposalHandler'
import Web3Helper from '@helpers/web3'
import { Models } from '@dbModels'
import IPFSModule from '@modules/ipfs'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import { ProxyMember } from '@modules/proxyMember'
import config from '@config'
import utils from '@helpers/utils'
import { RabbitMQHelper } from '@helpers/redditMQ'
import { ProxyToken } from '@modules/proxyToken'
import { ProposalList } from '@test/mock/fakeProposal'
import ProposalHelper from '@helpers/proposal'
import { PluginList } from '@test/mock/fakePlugins'
import DecodeActions from '@helpers/decodeAction'
import DbOperations from '@models/utils/dbOperations'
import BlockchainLogCrawler from '@modules/blockchainLogCrawler'

describe('Indexer: ProposalHandler', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('proposalCreated', () => {
    it('should handle tokenVoting proposalCreated', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const network = NetworksEnum.ethereumMainnet

      const backupTime = config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME
      config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME = 0

      const info: ILogInfo = {
        transactionHash: '0x123',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }

      const fakeEvent = {
        args: {
          creator: '0xcreator',
          proposalId: 1n,
          startDate: 0n,
          endDate: 1700000000n,
          allowFailureMap: 1n,
          metadata: metadataUri,
          actions: [{ to: '0x0', value: 0n, data: '0xdata' }],
        },
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-address',
        subdomain: 'dao.subdomain',
        interfaceType: IPluginInterfaceType.tokenVoting,
      }

      const proposalMetadata = {
        title: 'Proposal Title',
        description: 'Proposal Description',
        summary: 'Proposal Summary',
        resources: [],
        media: [],
      }

      const settings = {
        tokenAddress: '0xtoken-address',
      }

      sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').resolves(settings)
      sandbox.stub(Web3Helper, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves(proposalMetadata)
      sandbox.stub(GovernanceErc20Helper, 'getPastTotalSupply').resolves(1000n as any)
      sandbox.stub(ProposalHandler, 'handleStartEndDate').resolves({
        startDate: 0,
        endDate: 0,
      })
      const stubPair = sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      const stubActions = sandbox.spy(ProposalHandler, 'parseActions')
      const stubMemberMetrics = sandbox.stub(ProxyMember, 'updateMetricsByAction').resolves()
      const stubDaoMetrics = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const updateActivityStub = sandbox.stub(ProxyMember, 'updateActivity')

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0x123',
        pluginAddress: '0xplugin-address',
        proposalIndex: '1',
      })

      expect(savedProposal).to.exist
      expect(savedProposal.daoAddress).to.eq('0xdao-address')
      expect(savedProposal.pluginAddress).to.eq('0xplugin-address')
      expect(savedProposal.rawActions[0].to).to.eq('0x0')
      expect(savedProposal.rawActions[0].value).to.eq('0')
      expect(savedProposal.rawActions[0].data).to.eq('0xdata')
      expect(savedProposal.snapshot.totalSupply).to.eq('1000')

      expect(
        updateActivityStub.calledOnceWithExactly({
          memberAddress: '0xcreator',
          pluginAddress: '0xplugin-address',
          network,
          blockNumber: 100,
        }),
      ).to.be.true

      expect(
        stubMemberMetrics.calledOnceWithExactly(IMetricAction.increaseProposalCount, {
          memberAddress: '0xcreator',
          pluginAddress: '0xplugin-address',
          network,
        }),
      ).to.be.true

      expect(stubPair.calledOnce).to.be.true
      expect(stubActions.calledOnce).to.be.true
      expect(stubMemberMetrics.calledOnce).to.be.true
      expect(stubDaoMetrics.calledOnce).to.be.true

      config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME = backupTime
    })

    it('should handle admin proposalCreated', async () => {
      const metadataUri = 'ipfs://metadata-uri'
      const network = NetworksEnum.ethereumMainnet

      const backupTime = config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME
      config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME = 0

      const info: ILogInfo = {
        transactionHash: '0xadmin-tx',
        address: '0xplugin-address',
        blockNumber: 150,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 2,
        logIndex: 2,
        interfaceType: IPluginInterfaceType.admin, // Admin plugin type
      }

      const fakeEvent = {
        args: {
          creator: '0xadmin-creator',
          proposalId: 2n,
          startDate: 0n, // Force startDate to be handled dynamically
          endDate: 1800000000n,
          allowFailureMap: 1n,
          metadata: metadataUri,
          actions: [{ to: '0xadmin-target', value: 0n, data: '0x4b3d1223' }],
        },
      }

      const plugin = {
        address: '0xplugin-address',
        daoAddress: '0xdao-admin',
        subdomain: 'dao.admin',
        interfaceType: IPluginInterfaceType.admin, // Admin plugin type
      }

      const proposalMetadata = {
        title: 'Admin Proposal Title',
        description: 'Admin Proposal Description',
        summary: 'Admin Proposal Summary',
        resources: [],
        media: [],
      }

      sandbox.stub(DecodeActions.prototype, 'parseContractNetspec')
      sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin)
      sandbox.stub(Models.Proposal, 'findExistingLog').resolves(null)
      sandbox.stub(Web3Helper, 'extractMetadataUri').returns(metadataUri)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      sandbox.stub(IPFSModule, 'fetchMetadata').resolves(proposalMetadata)
      sandbox.stub(ProposalHandler, 'handleStartEndDate').resolves({
        startDate: 0,
        endDate: 0,
      })

      const stubPair = sandbox.stub(ProposalHandler, 'pairSppProposals').resolves()
      const stubActions = sandbox.spy(ProposalHandler, 'parseActions')
      const stubMemberMetrics = sandbox.stub(ProxyMember, 'updateMetricsByAction').resolves()
      const stubDaoMetrics = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const updateActivityStub = sandbox.stub(ProxyMember, 'updateActivity')

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      const savedProposal = await Models.Proposal.findOne({
        transactionHash: '0xadmin-tx',
        pluginAddress: '0xplugin-address',
        proposalIndex: '2',
      })

      // Assertions on saved proposal
      expect(savedProposal).to.exist
      expect(savedProposal.daoAddress).to.eq('0xdao-admin')
      expect(savedProposal.pluginAddress).to.eq('0xplugin-address')
      expect(savedProposal.rawActions[0].to).to.eq('0xadmin-target')
      expect(savedProposal.rawActions[0].value).to.eq('0')
      expect(savedProposal.rawActions[0].data).to.eq('0x4b3d1223')
      expect(savedProposal.snapshot.membersCount).to.eq(0) // Admin plugin has no voting token snapshot

      // Assertions on external calls
      expect(
        updateActivityStub.calledOnceWithExactly({
          memberAddress: '0xadmin-creator',
          pluginAddress: '0xplugin-address',
          network,
          blockNumber: 150,
        }),
      ).to.be.true

      expect(
        stubMemberMetrics.calledOnceWithExactly(IMetricAction.increaseProposalCount, {
          memberAddress: '0xadmin-creator',
          pluginAddress: '0xplugin-address',
          network,
        }),
      ).to.be.true

      expect(stubPair.calledOnce).to.be.true
      expect(stubActions.calledOnce).to.be.true
      expect(stubDaoMetrics.calledOnce).to.be.true

      // Reset configuration
      config.NODES[utils.networkToAragon(network)].INTERVAL_BLOCK_TIME = backupTime
    })

    it('Plugin not found', async () => {
      const network = NetworksEnum.ethereumMainnet
      const info: ILogInfo = {
        transactionHash: '0x123',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      const stubLogger = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.LogPluginSetupProcessor, 'findByPluginAddress').resolves(false)

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      expect(stubLogger.calledOnceWith('Plugin not found' as any)).to.be.true
    })

    it('proposalCreated throw error', async () => {
      const network = NetworksEnum.ethereumMainnet
      const info: ILogInfo = {
        transactionHash: '0x123',
        address: '0xplugin-address',
        blockNumber: 100,
        network,
        eventName: 'proposalCreated',
        transactionIndex: 1,
        logIndex: 1,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }
      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      sandbox.stub(Web3Helper, 'extractMetadataUri').rejects(new Error('error'))
      const stubLogger = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(true)

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      expect(stubLogger.calledOnceWith('Error Create proposal' as any)).to.be.true
    })
  })

  describe('approved', () => {
    it('should return when plugin is not supported', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xApprovedTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'Approved',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          approver: '0xapprover-address',
        },
      }

      const plugin = {
        address: '0xplugin-address',
        network,
        interfaceType: IPluginInterfaceType.admin,
        isSupported: false,
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      const warnLoggerStub = sandbox.stub(logger, 'warn')

      const result = await ProposalHandler.approved(fakeEvent as any, info)

      expect(result).to.be.undefined
      expect(warnLoggerStub.calledOnceWith('Approved - Plugin not found' as any)).to.be.true
    })

    it('should handle approved event', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xApprovedTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'Approved',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          approver: '0xapprover-address',
        },
      }

      const proposal = {
        daoAddress: '0xdao-address',
        network,
        proposalIndex: '1',
      }

      sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findExistingLog').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)

      const updateActivityStub = sandbox.stub(ProxyMember, 'updateActivity').resolves()
      const updateMetricsStub = sandbox.stub(ProxyMember, 'updateMetricsByAction').resolves()
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await ProposalHandler.approved(fakeEvent as any, info)

      const savedVote = await Models.Vote.findOne({
        network,
        transactionHash: info.transactionHash,
        proposalIndex: '1',
      })

      expect(savedVote).to.exist
      expect(savedVote.memberAddress).to.eq('0xapprover-address')
      expect(savedVote.pluginAddress).to.eq('0xplugin-address')
      expect(savedVote.proposalIndex).to.eq('1')
      expect(savedVote.blockNumber).to.eq(10)
      expect(savedVote.blockTimestamp).to.eq(1700000000)

      expect(
        updateActivityStub.calledOnceWithExactly({
          memberAddress: '0xapprover-address',
          pluginAddress: '0xplugin-address',
          network,
          blockNumber: 10,
        }),
      ).to.be.true

      expect(
        updateMetricsStub.calledOnceWithExactly(IMetricAction.increaseVoteCount, {
          memberAddress: '0xapprover-address',
          pluginAddress: '0xplugin-address',
          network,
        }),
      ).to.be.true

      expect(rabbitMQStub.calledTwice).to.be.true
    })

    it('should log a warning if the proposal is not found', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xApprovedTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'Approved',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          approver: '0xapprover-address',
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)

      const warnLoggerStub = sandbox.stub(logger, 'warn')

      const result = await ProposalHandler.approved(fakeEvent as any, info)

      expect(result).to.be.undefined
      expect(warnLoggerStub.calledOnceWith('Approved - Proposal not found' as any)).to.be.true
    })

    it('should log an error if an exception occurs', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xApprovedTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'Approved',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          approver: '0xapprover-address',
        },
      }
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').throws(new Error('Database error'))
      const errorLoggerStub = sandbox.stub(logger, 'error')

      await ProposalHandler.approved(fakeEvent as any, info)

      expect(errorLoggerStub.calledOnceWith('Error Approved Proposal' as any)).to.be.true
    })
  })

  describe('voteCast', () => {
    it('should handle voteCast and save a new vote', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xVoteTx',
        address: '0xplugin-address',
        blockNumber: 10,
        network,
        eventName: 'voteCast',
        transactionIndex: 2,
        logIndex: 3,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          voter: '0xvoter-address',
          voteOption: 2n,
          votingPower: 1000n,
        },
      }

      const proposal = {
        daoAddress: '0xdao-address',
        settings: { tokenAddress: '0xtoken-address' },
        network,
        proposalIndex: '1',
      }

      sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Vote, 'findVoteOnPlugin').resolves(null)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1700000000)
      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()
      const updateMetricsStub = sandbox.stub(ProxyMember, 'updateMetricsByAction').resolves()
      const updateActivityStub = sandbox.stub(ProxyMember, 'updateActivity').resolves()
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await ProposalHandler.voteCast(fakeEvent as any, info)

      const savedVote = await Models.Vote.findOne({
        network,
        transactionHash: info.transactionHash,
        proposalIndex: '1',
      })

      expect(savedVote).to.exist
      expect(savedVote.memberAddress).to.eq('0xvoter-address')
      expect(savedVote.pluginAddress).to.eq('0xplugin-address')
      expect(savedVote.voteOption).to.eq(2)
      expect(savedVote.votingPower).to.eq('1000')
      expect(savedVote.blockTimestamp).to.eq(1700000000)

      expect(proxyTokenStub.calledOnceWithExactly('0xtoken-address', network)).to.be.true

      expect(
        updateMetricsStub.calledOnceWithExactly(IMetricAction.increaseVoteCount, {
          memberAddress: '0xvoter-address',
          pluginAddress: '0xplugin-address',
          network,
        }),
      ).to.be.true

      expect(
        updateActivityStub.calledOnceWithExactly({
          memberAddress: '0xvoter-address',
          pluginAddress: '0xplugin-address',
          network,
          blockNumber: 10,
        }),
      ).to.be.true

      expect(rabbitMQStub.calledTwice).to.be.true
    })

    it('should handle replacing an existing vote', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xReplaceVoteTx',
        address: '0xplugin-address',
        blockNumber: 15,
        network,
        eventName: 'voteCast',
        transactionIndex: 3,
        logIndex: 4,
      }

      const fakeEvent = {
        args: {
          proposalId: 2n,
          voter: '0xvoter-address',
          voteOption: 3n,
          votingPower: 500n,
        },
      }

      const proposal = {
        daoAddress: '0xdao-address',
        settings: { tokenAddress: '0xtoken-address' },
        network,
        proposalIndex: '2',
      }

      const existingVote = {
        transactionHash: '0xOldTx',
        proposalIndex: '2',
        deleteOne: sinon.stub().resolves(),
      }

      sandbox.stub(logger, 'verbose')
      sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findExistingLog').resolves(null)
      sandbox.stub(Models.Vote, 'findVoteOnPlugin').resolves(existingVote as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)

      const proxyTokenStub = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()
      const updateActivityStub = sandbox.stub(ProxyMember, 'updateActivity').resolves()

      await ProposalHandler.voteCast(fakeEvent as any, info)

      const savedVote = await Models.Vote.findOne({
        transactionHash: info.transactionHash,
        proposalIndex: '2',
      })

      expect(savedVote).to.exist
      expect(savedVote.replacedTransactionHash).to.eq('0xOldTx')
      expect(existingVote.deleteOne.calledOnce).to.be.true

      expect(proxyTokenStub.calledOnceWithExactly('0xtoken-address', network)).to.be.true
      expect(updateActivityStub.calledOnce).to.be.true
    })

    it('should log a warning if the plugin is not found', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xMissingPluginTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'voteCast',
        transactionIndex: 3,
        logIndex: 4,
      }

      const fakeEvent = {
        args: {
          proposalId: 3n,
          voter: '0xvoter-address',
          voteOption: 1n,
          votingPower: 200n,
        },
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)
      const warnLoggerStub = sandbox.stub(logger, 'warn')

      await ProposalHandler.voteCast(fakeEvent as any, info)

      expect(warnLoggerStub.calledOnceWith('VoteCast - Plugin not found' as any)).to.be.true
    })

    it('should log a warning if the proposal is not found', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xMissingProposalTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'voteCast',
        transactionIndex: 3,
        logIndex: 4,
      }

      const fakeEvent = {
        args: {
          proposalId: 3n,
          voter: '0xvoter-address',
          voteOption: 1n,
          votingPower: 200n,
        },
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)
      const warnLoggerStub = sandbox.stub(logger, 'warn')

      await ProposalHandler.voteCast(fakeEvent as any, info)

      expect(warnLoggerStub.calledOnceWith('VoteCast - Proposal not found' as any)).to.be.true
    })

    it('should log an error if an exception occurs', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xErrorTx',
        address: '0xplugin-address',
        blockNumber: 30,
        network,
        eventName: 'voteCast',
        transactionIndex: 3,
        logIndex: 4,
      }

      const fakeEvent = {
        args: {
          proposalId: 4n,
          voter: '0xvoter-address',
          voteOption: 2n,
          votingPower: 300n,
        },
      }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(PluginList[0] as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').throws(new Error('Database error'))
      const errorLoggerStub = sandbox.stub(logger, 'error')

      await ProposalHandler.voteCast(fakeEvent as any, info)

      expect(errorLoggerStub.calledOnceWith('Error VoteCast Proposal' as any)).to.be.true
    })
  })

  describe('proposalExecuted', () => {
    it('should update proposal as executed and send dao metrics', async () => {
      const proposal = await Models.Proposal.create({ ...(ProposalList[0] as any) })
      const network = proposal.network
      const info: ILogInfo = {
        transactionHash: '0xExecutedTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'ProposalExecuted',
        transactionIndex: 1,
        logIndex: 2,
      }
      const fakeEvent = {
        args: {
          proposalId: 1n,
        },
      }

      sandbox.stub(logger, 'verbose')
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await ProposalHandler.proposalExecuted(fakeEvent as any, info)

      const updatedProposal = await Models.Proposal.findByEntityId(proposal.id)

      expect(updatedProposal).to.exist
      expect(updatedProposal.executed.status).to.be.true
      expect(updatedProposal.executed.blockNumber).to.eq(info.blockNumber)
      expect(updatedProposal.executed.transactionHash).to.eq(info.transactionHash)
      expect(updatedProposal.executed.blockTimestamp).to.eq(1800000000)

      expect(rabbitMQStub.calledThrice).to.be.true
      expect(
        rabbitMQStub.calledWith(EnumQueueName.daoAssets, {
          id: proposal.daoAddress,
          params: { address: proposal.daoAddress, network },
        }),
      ).to.be.true
      expect(
        rabbitMQStub.calledWith(EnumQueueName.daoTransactions, {
          id: proposal.daoAddress,
          params: { address: proposal.daoAddress, network },
        }),
      ).to.be.true
      expect(
        rabbitMQStub.calledWith(EnumQueueName.daoMetrics, {
          id: proposal.daoAddress,
          params: { address: proposal.daoAddress, network },
        }),
      ).to.be.true
    })

    it('should log a warning if the proposal is not found', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xExecutedTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'ProposalExecuted',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)
      const warnLoggerStub = sandbox.stub(logger, 'warn')

      const result = await ProposalHandler.proposalExecuted(fakeEvent as any, info)

      expect(result).to.be.undefined
      expect(warnLoggerStub.calledOnceWith('proposal not found' as any)).to.be.true
    })

    it('should log an error if an exception occurs', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xExecutedTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'ProposalExecuted',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
        },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').rejects(new Error('DB Error'))
      const errorLoggerStub = sandbox.stub(logger, 'error')

      await ProposalHandler.proposalExecuted(fakeEvent as any, info)

      expect(errorLoggerStub.calledOnceWith('Error ProposalExecuted' as any)).to.be.true
    })

    it('should do nothing if proposal is already executed', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xExecutedTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'ProposalExecuted',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
        },
      }

      const executedProposal = {
        id: 'proposal-id',
        daoAddress: '0xdao-address',
        executed: { status: true },
      }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(executedProposal as any)
      const rabbitMQStub = sandbox.stub(RabbitMQHelper, 'sendMessage')

      await ProposalHandler.proposalExecuted(fakeEvent as any, info)

      expect(rabbitMQStub.notCalled).to.be.true
    })
  })

  describe('fetchProposalMetadata', () => {
    it('should fetch and parse proposal metadata', async () => {
      const metadataUri = 'ipfs://test-metadata-uri'

      const fakeIpfsMetadata = {
        title: 'Proposal Title',
        description: 'Proposal Description',
        summary: 'Proposal Summary',
      }

      const parsedMetadata: IProposalMetadata = {
        title: 'Proposal Title',
        description: 'Proposal Description',
        summary: 'Proposal Summary',
        resources: [],
        media: [] as any,
      }

      const fetchMetadataStub = sandbox.stub(IPFSModule, 'fetchMetadata').resolves(fakeIpfsMetadata)
      const parseMetadataStub = sandbox.stub(Web3Helper, 'parseProposalMetadata').returns(parsedMetadata)

      const result = await ProposalHandler.fetchProposalMetadata(metadataUri)

      expect(fetchMetadataStub.calledOnceWithExactly(metadataUri, { retries: 4 })).to.be.true
      expect(parseMetadataStub.calledOnceWithExactly(fakeIpfsMetadata)).to.be.true
      expect(result).to.deep.equal(parsedMetadata)
    })

    it('should return null if an error occurs while fetching metadata', async () => {
      const metadataUri = 'ipfs://test-metadata-uri'

      const fetchMetadataStub = sandbox.stub(IPFSModule, 'fetchMetadata').rejects(new Error('IPFS Error'))
      const parseMetadataStub = sandbox.stub(Web3Helper, 'parseProposalMetadata')

      const result = await ProposalHandler.fetchProposalMetadata(metadataUri)

      expect(fetchMetadataStub.calledOnceWithExactly(metadataUri, { retries: 4 })).to.be.true
      expect(parseMetadataStub.notCalled).to.be.true
      expect(result).to.be.null
    })
  })

  describe('proposalAdvanced', async () => {
    it('should update parent and sub-proposals correctly on stage advance', async () => {
      const network = NetworksEnum.polygonMainnet

      // Pre-populate parent proposal
      const parentProposal = await Models.Proposal.create({
        ...(ProposalList[0] as any),
        subProposals: [],
        stageExecutions: [],
      })

      // Pre-populate sub-proposal
      const subProposal = await Models.Proposal.create({
        ...ProposalList[1],
        executed: { status: false },
        parentProposal: {
          proposalIndex: parentProposal.proposalIndex,
          pluginAddress: parentProposal.pluginAddress,
        },
      })

      // Link sub-proposal to the parent proposal
      await Models.Proposal.findByIdAndUpdate(parentProposal._id, {
        $push: {
          subProposals: {
            proposalIndex: subProposal.proposalIndex,
            pluginAddress: subProposal.pluginAddress,
            stageIndex: 1,
            transactionHash: subProposal.transactionHash,
            blockNumber: subProposal.blockNumber,
          },
        },
      })

      // Create plugin with subPlugins configuration
      const plugin = await Models.Plugin.create({
        ...(PluginList[0] as any),
        interfaceType: IPluginInterfaceType.spp,
        subPlugins: [{ stageIndex: 2, addresses: [subProposal.pluginAddress] }],
      })

      // Mock event and info
      const info = {
        transactionHash: '0xAdvancedTx',
        address: parentProposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 0n,
          stageId: 2n,
        },
      }

      // Stubs
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(1)
      sandbox.stub(ProposalHelper, 'getProposal').resolves({ lastStageTransition: 1800000000 } as any)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any) // Ensure plugin is found
      sandbox.stub(logger, 'verbose')
      // Execute the handler
      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      // Validate parent proposal update
      const updatedParentProposal = await Models.Proposal.findById(parentProposal._id)
      expect(updatedParentProposal).to.exist

      // Check stageExecutions
      expect(updatedParentProposal.stageExecutions).to.have.length(1)
      expect(updatedParentProposal.stageExecutions[0]).to.include({
        stageIndex: 1,
        transactionHash: info.transactionHash,
        blockNumber: info.blockNumber,
        blockTimestamp: 1800000000,
        status: true,
      })

      // Check lastStageTransition and stageIndex
      expect(updatedParentProposal.stageIndex).to.equal(2)
      expect(updatedParentProposal.lastStageTransition).to.equal(1800000000)

      // Validate subProposal update (executed)
      const updatedSubProposal = await Models.Proposal.findById(subProposal._id)
      expect(updatedSubProposal).to.exist

      expect(updatedSubProposal.executed.status).to.be.true
      expect(updatedSubProposal.executed.blockNumber).to.equal(info.blockNumber)
      expect(updatedSubProposal.executed.transactionHash).to.equal(info.transactionHash)

      // Check subProposal parent reference
      expect(updatedSubProposal.parentProposal).to.deep.include({
        proposalIndex: parentProposal.proposalIndex,
        pluginAddress: parentProposal.pluginAddress,
        stageIndex: 2,
        transactionHash: info.transactionHash,
        blockNumber: info.blockNumber,
      })

      // Validate subProposals in parent
      expect(updatedParentProposal.subProposals).to.have.length(2) // Original + New
      expect(updatedParentProposal.subProposals[1]).to.include({
        proposalIndex: subProposal.proposalIndex,
        pluginAddress: subProposal.pluginAddress,
        stageIndex: 2,
        transactionHash: info.transactionHash,
        blockNumber: info.blockNumber,
      })
    })

    it('should log a warning when the proposal is not found', async () => {
      const network = NetworksEnum.polygonMainnet

      const info = {
        transactionHash: '0xTx',
        address: '0xInvalidPlugin',
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = { args: { proposalId: 999n, stageId: 2n } }

      const warnStub = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      expect(warnStub.calledOnceWith('Proposal not found' as any)).to.be.true
    })

    it('should skip sub-proposals already executed', async () => {
      const network = NetworksEnum.polygonMainnet

      const parentProposal = await Models.Proposal.create({
        ...(ProposalList[0] as any),
        subProposals: [],
        stageExecutions: [],
      })

      const executedSubProposal = await Models.Proposal.create({
        ...ProposalList[1],
        executed: { status: true },
        parentProposal: { proposalIndex: parentProposal.proposalIndex },
      })

      await Models.Proposal.findByIdAndUpdate(parentProposal._id, {
        $push: {
          subProposals: {
            proposalIndex: executedSubProposal.proposalIndex,
            pluginAddress: executedSubProposal.pluginAddress,
          },
        },
      })

      await Models.Plugin.create({
        ...(PluginList[0] as any),
        address: parentProposal.pluginAddress,
        interfaceType: IPluginInterfaceType.spp,
        subPlugins: [{ stageIndex: 2, addresses: [executedSubProposal.pluginAddress] }],
      })
      const info = {
        transactionHash: '0xAdvancedTx',
        address: parentProposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = { args: { proposalId: 0n, stageId: 2n } }

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      sandbox.stub(ProposalHelper, 'getProposal').resolves({ lastStageTransition: 1800000000 } as any)

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      const updatedSubProposal = await Models.Proposal.findById(executedSubProposal._id)
      expect(updatedSubProposal.executed.status).to.be.true
      expect(updatedSubProposal.executed.transactionHash).to.be.null
    })

    it('should log an error when subPlugins are missing for the stage', async () => {
      const network = NetworksEnum.polygonMainnet

      const parentProposal = await Models.Proposal.create({
        ...(ProposalList[0] as any),
        subProposals: [],
        stageExecutions: [],
      })

      const plugin = await Models.Plugin.create({
        ...(PluginList[0] as any),
        interfaceType: IPluginInterfaceType.spp,
        subPlugins: [], // No subPlugins configured
      })

      const info = {
        transactionHash: '0xAdvancedTx',
        address: parentProposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = { args: { proposalId: 0n, stageId: 2n } }

      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      const errorLoggerStub = sandbox.stub(logger, 'error')

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      expect(errorLoggerStub.calledWithMatch('Error SPP Proposal index not found' as any)).to.be.false
    })

    it('should log a warning if the sub-proposal already exists', async () => {
      const network = NetworksEnum.polygonMainnet

      // Create and populate the parent proposal
      const parentProposal = await Models.Proposal.create({
        ...(ProposalList[0] as any),
        subProposals: [],
        stageExecutions: [],
      })

      // Create the sub-proposal in the database
      const subProposal = await Models.Proposal.create({
        ...(ProposalList[1] as any),
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network,
        executed: { status: false },
      })

      // Link sub-proposal to the parent proposal
      await Models.Proposal.findByIdAndUpdate(parentProposal._id, {
        $push: {
          subProposals: {
            proposalIndex: subProposal.proposalIndex,
            stageIndex: 2,
            pluginAddress: subProposal.pluginAddress,
            transactionHash: '0xAdvancedTx',
            blockNumber: 500,
          },
        },
      })

      const plugin = await Models.Plugin.create({
        ...(PluginList[0] as any),
        interfaceType: IPluginInterfaceType.spp,
        subPlugins: [{ stageIndex: 2, addresses: ['0xPluginAddress'] }],
      })

      const info = {
        transactionHash: '0xAdvancedTx',
        address: parentProposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = { args: { proposalId: 0n, stageId: 2n } }

      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(plugin as any)
      sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(1)

      sandbox.stub(ProposalHelper, 'getProposal').resolves({
        lastStageTransition: 1800000000,
      } as any)

      const warnLoggerStub = sandbox.stub(logger, 'warn')

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      expect(warnLoggerStub.calledOnceWith('Sub-proposal already exists in the array' as any)).to.be.true

      const updatedParentProposal = await Models.Proposal.findById(parentProposal._id)
      expect(updatedParentProposal.subProposals).to.have.length(1)
    })

    it('should log an error when ProposalHelper.getSppSubPluginProposals fails', async () => {
      const network = NetworksEnum.polygonMainnet

      const parentProposal = await Models.Proposal.create({
        ...(ProposalList[0] as any),
        subProposals: [],
      })

      await Models.Plugin.create({
        ...(PluginList[0] as any),
        address: parentProposal.pluginAddress,
        interfaceType: IPluginInterfaceType.spp,
        subPlugins: [{ stageIndex: 2, addresses: ['0xPluginAddress'] }],
      })

      const info = {
        transactionHash: '0xAdvancedTx',
        address: parentProposal.pluginAddress,
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = { args: { proposalId: 0n, stageId: 2n } }

      sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(0)
      const errorLoggerStub = sandbox.stub(logger, 'error')

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      expect(errorLoggerStub.calledWithMatch('Error SPP Proposal index not found' as any)).to.be.true
    })

    it('should log an error if an exception occurs', async () => {
      const network = NetworksEnum.polygonMainnet

      const info = {
        transactionHash: '0xAdvancedTx',
        address: '0xPluginAddress',
        blockNumber: 500,
        network,
        eventName: 'ProposalAdvanced',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = { args: { proposalId: 0n, stageId: 2n } }

      sandbox.stub(Models.Proposal, 'findByProposalIndex').rejects(new Error('Unexpected Error'))
      const errorLoggerStub = sandbox.stub(logger, 'error')

      await ProposalHandler.proposalAdvanced(fakeEvent as any, info)

      expect(errorLoggerStub.calledOnceWith('Error ProposalAdvanced' as any)).to.be.true
    })
  })

  describe('handleStartEndDate', () => {
    it('should return startDate and endDate from ProposalHelper response', async () => {
      const network = NetworksEnum.polygonMainnet
      const fakeProposal: any = {
        proposalIndex: '1',
        network,
      }
      const fakePlugin: any = {
        address: '0xPluginAddress',
      }

      const response = {
        parameters: {
          startDate: 1000n,
          endDate: 2000n,
        },
      }

      const stubProposal = sandbox.stub(ProposalHelper, 'getProposal').resolves(response as any)

      const result = await ProposalHandler.handleStartEndDate(fakeProposal, fakePlugin)

      expect(result).to.deep.equal({ startDate: 1000, endDate: 2000 })
      expect(
        stubProposal.calledOnceWithExactly({
          plugin: fakePlugin,
          proposalIndex: fakeProposal.proposalIndex,
          network: fakeProposal.network,
        }),
      ).to.be.true
    })

    it('should return 0 for startDate and endDate if response is undefined', async () => {
      const network = NetworksEnum.polygonMainnet
      const fakeProposal: any = {
        proposalIndex: '1',
        network,
      }
      const fakePlugin: any = {
        address: '0xPluginAddress',
      }

      const stubProposal = sandbox.stub(ProposalHelper, 'getProposal').resolves(undefined)

      const result = await ProposalHandler.handleStartEndDate(fakeProposal, fakePlugin)

      expect(result).to.deep.equal({ startDate: 0, endDate: 0 })
      expect(
        stubProposal.calledOnceWithExactly({
          plugin: fakePlugin,
          proposalIndex: fakeProposal.proposalIndex,
          network: fakeProposal.network,
        }),
      ).to.be.true
    })

    it('should return 0 for startDate and endDate if parameters are undefined', async () => {
      const network = NetworksEnum.polygonMainnet
      const fakeProposal: any = {
        proposalIndex: '1',
        network,
      }
      const fakePlugin: any = {
        address: '0xPluginAddress',
      }

      const response = {
        parameters: undefined,
      }

      // Stub ProposalHelper.getProposal
      const stubProposal = sandbox.stub(ProposalHelper, 'getProposal').resolves(response as any)

      const result = await ProposalHandler.handleStartEndDate(fakeProposal, fakePlugin)

      expect(result).to.deep.equal({ startDate: 0, endDate: 0 })
      expect(
        stubProposal.calledOnceWithExactly({
          plugin: fakePlugin,
          proposalIndex: fakeProposal.proposalIndex,
          network: fakeProposal.network,
        }),
      ).to.be.true
    })

    it('should return 0 for startDate and endDate if startDate and endDate are missing', async () => {
      const network = NetworksEnum.polygonMainnet
      const fakeProposal: any = {
        proposalIndex: '1',
        network,
      }
      const fakePlugin: any = {
        address: '0xPluginAddress',
      }

      const response = {
        parameters: {},
      }

      const stubProposal = sandbox.stub(ProposalHelper, 'getProposal').resolves(response as any)

      const result = await ProposalHandler.handleStartEndDate(fakeProposal, fakePlugin)

      expect(result).to.deep.equal({ startDate: 0, endDate: 0 })
      expect(
        stubProposal.calledOnceWithExactly({
          plugin: fakePlugin,
          proposalIndex: fakeProposal.proposalIndex,
          network: fakeProposal.network,
        }),
      ).to.be.true
    })
  })

  describe('parseActions', () => {
    it('should return an empty array if rawActions is empty', async () => {
      const proposal = { rawActions: [] } as any
      const updateDocumentSpy = sandbox.spy(DbOperations, 'updateDocument')

      const result = await ProposalHandler.parseActions(proposal)
      expect(result).to.deep.equal([])
      expect(updateDocumentSpy.notCalled).to.be.true
    })

    it('should call decodeData for actions with data length >= 10 and decodeTransfer otherwise', async () => {
      const decodeDataStub = sandbox
        .stub(DecodeActions.prototype, 'decodeData')
        .resolves({ decoded: 'decodedData' } as any)
      const decodeTransferStub = sandbox
        .stub(DecodeActions.prototype, 'decodeTransfer')
        .resolves({ decoded: 'decodedTransfer' } as any)
      const updateDocumentSpy = sandbox.spy(DbOperations, 'updateDocument')

      const fakeProposal = await Models.Proposal.create({
        ...(ProposalList[0] as any),
        ...{
          id: 'proposal-id',
          rawActions: [
            { data: '0x1234567890abcdef', to: '0xAddress1', value: 100 }, // should call decodeData
            { data: '0xshort', to: '0xAddress2', value: 50 }, // should call decodeTransfer
            { data: null, to: '0xAddress3', value: 0 }, // should call decodeTransfer
          ],
        },
      })

      const result = await ProposalHandler.parseActions(fakeProposal as any)

      expect(decodeDataStub.calledOnceWithExactly(fakeProposal?.rawActions[0] as any, fakeProposal as any)).to.be.true

      expect(decodeTransferStub.calledTwice).to.be.true
      expect(decodeTransferStub.firstCall.calledWithExactly(fakeProposal.rawActions[1] as any, fakeProposal as any)).to
        .be.true
      expect(decodeTransferStub.secondCall.calledWithExactly(fakeProposal.rawActions[2] as any, fakeProposal as any)).to
        .be.true

      expect(
        updateDocumentSpy.calledOnceWithExactly(
          fakeProposal,
          {
            actions: [
              { decoded: 'decodedData' }, // From decodeData
              { decoded: 'decodedTransfer' }, // From decodeTransfer
              { decoded: 'decodedTransfer' }, // From decodeTransfer
            ],
          },
          { logId: fakeProposal.id },
          'Update proposalAction',
          sandbox.match.any,
        ),
      ).to.be.true

      expect(result).to.exist
    })

    it('should handle errors during decoding and log the error', async () => {
      const decodeDataStub = sandbox.stub(DecodeActions.prototype, 'decodeData').rejects(new Error('decodeData failed'))
      const decodeTransferStub = sandbox.stub(DecodeActions.prototype, 'decodeTransfer').resolves(null)
      const updateDocumentSpy = sandbox.spy(DbOperations, 'updateDocument')
      const errorLoggerStub = sandbox.stub(logger, 'error')

      const fakeProposal = {
        id: 'proposal-id',
        rawActions: [
          { data: '0x1234567890abcdef', to: '0xAddress1', value: 100 }, // decodeData
          { data: '0xshort', to: '0xAddress2', value: 50 }, // decodeTransfer
        ],
      }

      await ProposalHandler.parseActions(fakeProposal as any)

      expect(decodeDataStub.calledOnceWithExactly(fakeProposal.rawActions[0] as any, fakeProposal as any)).to.be.true
      expect(decodeTransferStub.calledOnceWithExactly(fakeProposal.rawActions[1] as any, fakeProposal as any)).to.be
        .true
      expect(updateDocumentSpy.notCalled).to.be.true
      expect(errorLoggerStub.calledOnceWith('Error parseActions' as any)).to.be.true
    })
  })

  describe('pairSppProposals', () => {
    it('should handle SPP plugin proposal and link sub-proposals', async () => {
      const plugin = {
        interfaceType: IPluginInterfaceType.spp,
        totalStages: 3,
        address: '0x0',
        subPlugins: [{ stageIndex: 2, addresses: ['0xSubPluginAddress'] }],
      }

      const info = {
        transactionHash: '0xTxHash',
        blockNumber: 100,
      }

      const proposal = await Models.Proposal.create({
        ...(ProposalList[0] as any),
        proposalIndex: '1',
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xPluginAddress',
      })

      const proposalInfo = {
        currentStage: 2n,
        lastStageTransition: 1700000000n,
      }

      const subProposalDb = {
        update: sandbox.stub().resolves(),
      }

      sandbox.stub(ProposalHelper, 'getProposal').resolves(proposalInfo as any)
      const stubSppSubPluginProposals = sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(2)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(subProposalDb as any)
      const saveStub = sandbox.stub(proposal, 'save').resolves()
      const warnStub = sandbox.stub(logger, 'warn')
      const errorStub = sandbox.stub(logger, 'error')

      await ProposalHandler.pairSppProposals(proposal, plugin as any, info as any)

      expect(
        stubSppSubPluginProposals.calledOnceWith(
          '1',
          1, // stageIndex
          '0xSubPluginAddress',
          plugin.address,
          proposal.network,
        ),
      ).to.be.true

      expect(proposal.subProposals).to.have.length(1)
      expect(proposal.subProposals[0]).to.deep.include({
        proposalIndex: '2',
        stageIndex: 1,
        pluginAddress: '0xSubPluginAddress',
        transactionHash: info.transactionHash,
        blockNumber: info.blockNumber,
      })

      expect(
        subProposalDb.update.calledOnceWithExactly({
          parentProposal: {
            pluginAddress: proposal.pluginAddress,
            proposalIndex: proposal.proposalIndex,
            stageIndex: 1,
            transactionHash: info.transactionHash,
            blockNumber: info.blockNumber,
          },
        }),
      ).to.be.true

      expect(saveStub.calledOnce).to.be.true

      expect(warnStub.notCalled).to.be.true
      expect(errorStub.notCalled).to.be.true
    })

    it('should handle missing sub-proposals and log a warning', async () => {
      const plugin = {
        interfaceType: IPluginInterfaceType.spp,
        totalStages: 3,
        subPlugins: [{ stageIndex: 2, addresses: ['0xMissingPlugin'] }],
      }

      const info = {
        transactionHash: '0xTxHash',
        blockNumber: 100,
      }

      const proposal = await Models.Proposal.create({
        ...(ProposalList[0] as any),
        proposalIndex: '1',
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xPluginAddress',
        transactionHash: '0xTxHash',
      })

      const proposalInfo = {
        currentStage: 2n,
        lastStageTransition: 1700000000n,
      }

      sandbox.stub(ProposalHelper, 'getProposal').resolves(proposalInfo as any)
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)
      sandbox.stub(ProposalHelper, 'getSppSubPluginProposals').resolves(1)
      const warnStub = sandbox.stub(logger, 'warn')
      const errorStub = sandbox.stub(logger, 'error')

      await ProposalHandler.pairSppProposals(proposal, plugin as any, info as any)

      expect(warnStub.calledOnceWith('Sub proposal not found' as any)).to.be.true
      expect(errorStub.notCalled).to.be.true
    })

    it('should handle sub-plugins for a sub-plugin proposal', async () => {
      const plugin = {
        isSubPlugin: true,
        stageIndex: 2,
      }
      const info = {
        transactionHash: '0xTxHash',
        blockNumber: 100,
      }
      const proposal = await Models.Proposal.create({
        ...(ProposalList[0] as any),
        proposalIndex: '1',
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xPluginAddress',
        transactionHash: '0xTxHash',
      })

      const saveStub = sandbox.spy(proposal, 'save')

      await ProposalHandler.pairSppProposals(proposal, plugin as any, info as any)

      expect(proposal.isSubProposal).to.be.true
      expect(proposal.stageIndex).to.equal(2)
      expect(saveStub.calledOnce).to.be.true
    })

    it('should log an error if an exception occurs', async () => {
      const plugin = {
        interfaceType: IPluginInterfaceType.spp,
      }
      const info = {
        transactionHash: '0xTxHash',
        blockNumber: 100,
      }
      const proposal = await Models.Proposal.create({
        ...(ProposalList[0] as any),
        proposalIndex: '1',
        transactionHash: '0xTxHash',
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xPluginAddress',
      })

      const errorStub = sandbox.stub(logger, 'error')
      sandbox.stub(ProposalHelper, 'getProposal').throws(new Error('Unexpected Error'))

      await ProposalHandler.pairSppProposals(proposal, plugin as any, info as any)

      expect(errorStub.calledOnceWith('Error pairSppProposals' as any)).to.be.true
    })

    it('should log an error when proposalInfo is missing', async () => {
      const plugin = {
        interfaceType: IPluginInterfaceType.spp,
        totalStages: 3,
        address: '0x0',
        subPlugins: [{ stageIndex: 2, addresses: ['0xSubPluginAddress'] }],
      }

      const info = {
        transactionHash: '0xTxHash',
        blockNumber: 100,
      }

      const proposal = await Models.Proposal.create({
        ...(ProposalList[0] as any),
        proposalIndex: '1',
        network: NetworksEnum.ethereumMainnet,
        pluginAddress: '0xPluginAddress',
      })

      sandbox.stub(ProposalHelper, 'getProposal').resolves(null)
      const errorLoggerStub = sandbox.stub(logger, 'error')
      const warnLoggerStub = sandbox.stub(logger, 'warn')
      const saveStub = sandbox.stub(proposal, 'save').resolves()

      await ProposalHandler.pairSppProposals(proposal, plugin as any, info as any)

      expect(
        errorLoggerStub.calledOnceWith(
          'Error ProposalAdvanced - proposalInfo not found missing currentStage and lastStageTransition' as any,
        ),
      ).to.be.true
      expect(saveStub.calledOnce).to.be.true
      expect(warnLoggerStub.notCalled).to.be.true
    })
  })

  describe('proposalCanceled', () => {
    it('should update the proposal as canceled', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xCanceledTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'ProposalCanceled',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
        },
      }

      const proposal = await Models.Proposal.create({
        ...(ProposalList[0] as any),
        proposalIndex: '1',
        pluginAddress: info.address,
        network,
      })

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      const updateDocumentStub = sandbox.stub(DbOperations, 'updateDocument').resolves()

      await ProposalHandler.proposalCanceled(fakeEvent as any, info)

      // Verify DbOperations.updateDocument call
      expect(
        updateDocumentStub.calledOnceWithExactly(
          proposal,
          {
            cancelTxInfo: {
              blockNumber: info.blockNumber,
              transactionHash: info.transactionHash,
              blockTimestamp: 1800000000,
            },
          },
          { logId: proposal.id, info },
          'Update proposalCanceled',
          sandbox.match.any,
        ),
      ).to.be.true
    })

    it('should log a warning if the proposal is not found', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xCanceledTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'ProposalCanceled',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
        },
      }

      const warnLoggerStub = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)

      await ProposalHandler.proposalCanceled(fakeEvent as any, info)

      expect(warnLoggerStub.calledOnceWith('Proposal not found' as any)).to.be.true
    })

    it('should log an error if an exception occurs', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xErrorTx',
        address: '0xplugin-address',
        blockNumber: 20,
        network,
        eventName: 'ProposalCanceled',
        transactionIndex: 1,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
        },
      }

      const errorLoggerStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Proposal, 'findByProposalIndex').throws(new Error('Unexpected Error'))

      await ProposalHandler.proposalCanceled(fakeEvent as any, info)

      expect(errorLoggerStub.calledOnceWith('Error proposalCanceled' as any)).to.be.true
    })
  })

  describe('proposalEdited', () => {
    it('should update the proposal metadata and actions', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xEditedTx',
        address: '0xplugin-address',
        blockNumber: 150,
        network,
        eventName: 'ProposalEdited',
        transactionIndex: 2,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          metadata: 'ipfs://metadata-uri',
          actions: [
            { to: '0xAction1', value: 100n, data: '0x1234567890abcdef' },
            { to: '0xAction2', value: 200n, data: '0xdata' },
          ],
        },
      }

      const proposal = await Models.Proposal.create({
        ...(ProposalList[0] as any),
        proposalIndex: '1',
        pluginAddress: info.address,
        network,
      })

      const proposalMetadata = {
        title: 'Updated Proposal Title',
        description: 'Updated Proposal Description',
        summary: 'Updated Proposal Summary',
        resources: [],
        media: [],
      }

      const decodedActions = [{ decoded: 'decodedData1' }, { decoded: 'decodedData2' }]

      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Web3Helper, 'extractMetadataUri').returns('ipfs://metadata-uri')
      sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves(proposalMetadata as any)
      sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(1800000000)
      sandbox.stub(DecodeActions.prototype, 'decodeData').resolves({ decoded: 'decodedData1' } as any)
      sandbox.stub(DecodeActions.prototype, 'decodeTransfer').resolves({ decoded: 'decodedData2' })
      const updateDocumentStub = sandbox.spy(DbOperations, 'updateDocument')

      await ProposalHandler.proposalEdited(fakeEvent as any, info)

      expect(
        updateDocumentStub.calledOnceWithExactly(
          proposal,
          {
            title: proposalMetadata.title,
            description: proposalMetadata.description,
            summary: proposalMetadata.summary,
            resources: proposalMetadata.resources,
            media: proposalMetadata.media,
            rawActions: [
              { to: '0xAction1', value: 100n, data: '0x1234567890abcdef' },
              { to: '0xAction2', value: 200n, data: '0xdata' },
            ],
            editedTxInfo: {
              blockNumber: info.blockNumber,
              transactionHash: info.transactionHash,
              blockTimestamp: 1800000000,
            },
            actions: decodedActions,
          },
          { logId: proposal.id, info },
          'Update proposalEdited',
          sandbox.match.any,
        ),
      ).to.be.true
    })

    it('should log a warning if the proposal is not found', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xEditedTx',
        address: '0xplugin-address',
        blockNumber: 150,
        network,
        eventName: 'ProposalEdited',
        transactionIndex: 2,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          metadata: 'ipfs://metadata-uri',
        },
      }

      const warnLoggerStub = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)

      await ProposalHandler.proposalEdited(fakeEvent as any, info)

      expect(warnLoggerStub.calledOnceWith('Proposal not found' as any)).to.be.true
    })

    it('should log an error if an exception occurs', async () => {
      const network = NetworksEnum.ethereumMainnet

      const info: ILogInfo = {
        transactionHash: '0xErrorTx',
        address: '0xplugin-address',
        blockNumber: 150,
        network,
        eventName: 'ProposalEdited',
        transactionIndex: 2,
        logIndex: 2,
      }

      const fakeEvent = {
        args: {
          proposalId: 1n,
          metadata: 'ipfs://metadata-uri',
        },
      }

      const errorLoggerStub = sandbox.stub(logger, 'error')
      sandbox.stub(Models.Proposal, 'findByProposalIndex').throws(new Error('Unexpected Error'))

      await ProposalHandler.proposalEdited(fakeEvent as any, info)

      expect(errorLoggerStub.calledOnceWith('Error proposalEdited' as any)).to.be.true
    })
  })

  describe('findIncrementalId', () => {
    it('should return null if the proposal is not found on the logs', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        blockNumber: 100,
        address: '0xPlugin',
      })

      sandbox.stub(Models.Proposal, 'findLatestProposal').resolves({
        blockNumber: 100,
        proposalIndex: 1,
      })

      const loggerErrorStub = sandbox.stub(logger, 'error')

      const crawlerStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves([])
      const result = await ProposalHandler.findIncrementalId({
        pluginAddress: '0xPlugin',
        network: NetworksEnum.ethereumSepolia,
      } as any)

      expect(result).to.be.eq(false)
      expect(loggerErrorStub.calledOnceWith('Proposal not found' as any)).to.be.true
      expect(crawlerStub.calledOnce).to.be.true
    })

    it('should return the index if found', async () => {
      sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        blockNumber: 100,
        address: '0xPlugin',
      })

      sandbox.stub(Models.Proposal, 'findLatestProposal').resolves({
        blockNumber: 100,
        proposalIndex: 1,
      })

      const crawlerStub = sandbox.stub(BlockchainLogCrawler.prototype, 'crawl').resolves([
        {
          event: {
            args: {
              proposalId: 2n,
            },
          },
        },
      ] as any)

      const result = await ProposalHandler.findIncrementalId({
        pluginAddress: '0xPlugin',
        network: NetworksEnum.ethereumSepolia,
        proposalIndex: '2',
      } as any)

      expect(result).to.be.eq(0)
      expect(crawlerStub.calledOnce).to.be.true
    })
  })
})
