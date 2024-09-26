import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import logger from '@logger'
import { ILogInfo, NetworksEnum } from '@types'
import { beforeEach } from 'mocha'
import { ProposalHandler } from '@services/aragon-indexer/handlers/proposalHandler'
import Web3Helper from '@helpers/web3'
import { Models } from '@dbModels'
import { ProxyMember } from '@modules/proxyMember'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import { RabbitMQHelper } from '@helpers/redditMQ'
import { ProxyToken } from '@modules/proxyToken'
import { ProposalList } from '@test/mock/fakeProposal'

describe('ProposalHandler', () => {
  let sandbox: SinonSandbox

  beforeEach(() => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox.restore()
  })

  describe('proposalCreated', () => {
    it('should create a proposal successfully', async () => {
      const metadataUri = 'fake-uri'
      const network = NetworksEnum.ethereumMainnet
      const pluginAddress = '0x123456'
      const proposalIndex = 1

      const info: ILogInfo = {
        transactionHash: '0x123',
        transactionIndex: 1,
        logIndex: 1,
        address: pluginAddress,
        blockNumber: 1,
        network,
        eventName: 'proposalCreated',
      }

      const fakeEvent = {
        args: {
          creator: '0x456',
          proposalId: BigInt(proposalIndex),
          startDate: 0,
          endDate: 0,
          allowFailureMap: BigInt(1),
          metadata: 'test',
          actions: [
            {
              to: '0x0',
              value: BigInt(1),
              data: '0x',
            },
          ],
        },
      }

      const stubFetchDate = sandbox.stub(ProposalHandler, 'handleStartEndDate').resolves({
        startDate: Number(213123),
        endDate: Number(123123),
      })
      const stubFindPlugin = sandbox.stub(Models.Plugin, 'findByAddress').resolves({
        daoAddress: '0xDaoAddress',
        subdomain: 'plugin-subdomain',
        address: pluginAddress,
        network,
      })
      const stubSetting = sandbox.stub(Models.Setting, 'findLastSettingByBlockNumber').returns({
        id: 'fake-id',
        transactionHash: 'fake-tx-hash',
        blockNumber: info.blockNumber,
        blockTimestamp: 321312,
        network: info.network,
        daoAddress: 'fake-dao-address',
        pluginAddress: 'fake-plugin-address',
        pluginSubdomain: 'fake-plugin-subdomain',
        tokenAddress: 'fake-token-address',
        onlyListed: true,
        minApprovals: 1,
        votingMode: 1,
        supportThreshold: 2,
        minParticipation: 2,
        minDuration: 2,
        minProposerVotingPower: 2,
      })
      const stubExtractMetadataUri = sandbox.stub(Web3Helper, 'extractMetadataUri').returns(metadataUri)
      const stubGetBlockTimestamp = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123456789)
      const stubProposalMetadata = sandbox.stub(ProposalHandler, 'fetchProposalMetadata').resolves({
        title: 'test-title',
        description: 'test-description',
        summary: 'test-summary',
        resources: [],
      } as any)
      const stubTotalSupply = sandbox.stub(GovernanceErc20Helper, 'getPastTotalSupply').resolves(20000 as any)
      const stubUpdateActivity = sandbox.stub(ProxyMember, 'updateActivity').resolves()

      const stubActions = sandbox.stub(ProposalHandler, 'parseActions').resolves()
      const stubMetrics = sandbox.stub(ProxyMember, 'updateMetricsByAction').resolves()
      const stubMessagingQueue = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      expect(stubGetBlockTimestamp.calledOnce).to.be.true
      expect(stubFetchDate.calledOnce).to.be.true
      expect(stubFindPlugin.calledOnce).to.be.true
      expect(stubSetting.calledOnce).to.be.true
      expect(stubExtractMetadataUri.calledOnceWith(fakeEvent.args.metadata)).to.be.true
      expect(stubProposalMetadata.calledOnceWith(metadataUri)).to.be.true
      expect(stubUpdateActivity.calledOnce).to.be.true
      expect(stubTotalSupply.calledOnce).to.be.true
      expect(stubActions.calledOnce).to.be.true
      expect(stubMetrics.calledOnce).to.be.true
      expect(stubMessagingQueue.calledOnce).to.be.true

      const proposalDb = await Models.Proposal.findOne({
        transactionHash: info.transactionHash,
        daoAddress: '0xDaoAddress',
        pluginAddress,
        proposalIndex,
      })
      expect(proposalDb).to.exist
    })

    it('should handle plugin not found', async () => {
      const info: ILogInfo = {
        transactionHash: '0x123',
        transactionIndex: 1,
        logIndex: 1,
        address: '0x456',
        blockNumber: 1,
        network: NetworksEnum.ethereumMainnet,
        eventName: 'proposalCreated',
      }

      const fakeEvent = {
        args: {
          sender: '0x123',
          amount: 10n,
          _reference: 'some reference',
        },
      }

      const stubLogger = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Plugin, 'findByAddress').resolves(null)

      await ProposalHandler.proposalCreated(fakeEvent as any, info)

      expect(stubLogger.calledOnceWith('Plugin not found' as any)).to.be.true
    })
  })

  describe('approved', () => {
    it('should handle approved event', async () => {
      const network = NetworksEnum.ethereumMainnet
      const info: ILogInfo = {
        transactionHash: '0x123',
        transactionIndex: 1,
        logIndex: 1,
        address: '0x456',
        blockNumber: 1,
        network,
        eventName: 'approved',
      }

      const fakeEvent = {
        args: {
          proposalId: BigInt(1),
          approver: '0xApprover',
        },
      }

      const stubFindProposal = sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves({
        daoAddress: '0xDaoAddress',
        network,
        pluginAddress: info.address,
      } as any)
      const stubFindExistingLog = sandbox.stub(Models.Vote, 'findExistingLog').resolves(null)
      const stubGetBlockTimestamp = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123456789)
      const stubUpdateActivity = sandbox.stub(ProxyMember, 'updateActivity').resolves()
      const stubUpdateMetricsByAction = sandbox.stub(ProxyMember, 'updateMetricsByAction').resolves()
      const stubMessagingQueue = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()

      await ProposalHandler.approved(fakeEvent as any, info)

      expect(stubFindProposal.calledOnce).to.be.true
      expect(stubGetBlockTimestamp.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(stubUpdateActivity.calledOnce).to.be.true
      expect(stubUpdateMetricsByAction.calledOnce).to.be.true
      expect(stubMessagingQueue.calledTwice).to.be.true

      const proposalDb = await Models.Vote.findOne({
        transactionHash: info.transactionHash,
        daoAddress: '0xDaoAddress',
        pluginAddress: info.address,
        proposalIndex: 1,
      })
      expect(proposalDb).to.exist
    })

    it('should handle proposal not found in approved', async () => {
      const info: ILogInfo = {
        transactionHash: '0x123',
        transactionIndex: 1,
        logIndex: 1,
        address: '0x456',
        blockNumber: 1,
        network: NetworksEnum.ethereumMainnet,
        eventName: 'approved',
      }

      const fakeEvent = {
        args: {
          proposalId: BigInt(1),
          approver: '0xApprover',
        },
      }

      const stubLogger = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)

      await ProposalHandler.approved(fakeEvent as any, info)

      expect(stubLogger.calledOnceWith('Approved - Proposal not found' as any)).to.be.true
    })
  })

  describe('voteCast', () => {
    it('should handle voteCast event', async () => {
      const network = NetworksEnum.ethereumMainnet
      const info: ILogInfo = {
        transactionHash: '0x123',
        transactionIndex: 1,
        logIndex: 1,
        address: '0xPluginAddress',
        blockNumber: 1,
        network,
        eventName: 'voteCast',
      }

      const fakeEvent = {
        args: {
          proposalId: BigInt(1),
          voter: '0xVoter',
          voteOption: BigInt(1),
          votingPower: BigInt(1000),
        },
      }

      const stubFindProposal = sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves({
        daoAddress: '0xDaoAddress',
        network,
        pluginAddress: '0xPluginAddress',
        settings: { tokenAddress: '0xTokenAddress' },
      } as any)
      const stubFindExistingLog = sandbox.stub(Models.Vote, 'findExistingLog').resolves(null)
      const stubFindExistingVote = sandbox.stub(Models.Vote, 'findVoteOnPlugin').resolves(null)
      const stubProxyToken = sandbox.stub(ProxyToken, 'saveAndGetToken').resolves()
      const stubUpdateMetricsByAction = sandbox.stub(ProxyMember, 'updateMetricsByAction').resolves()
      const stubUpdateActivity = sandbox.stub(ProxyMember, 'updateActivity').resolves()
      const stubMessagingQueue = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const stubGetBlockTimestamp = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123456789)

      await ProposalHandler.voteCast(fakeEvent as any, info)

      expect(stubFindProposal.calledOnce).to.be.true
      expect(stubFindExistingLog.calledOnce).to.be.true
      expect(stubFindExistingVote.calledOnce).to.be.true
      expect(stubUpdateActivity.calledOnce).to.be.true
      expect(stubProxyToken.calledOnce).to.be.true
      expect(stubUpdateMetricsByAction.calledOnce).to.be.true
      expect(stubMessagingQueue.calledTwice).to.be.true
      expect(stubGetBlockTimestamp.calledOnce).to.be.true

      const voteDb = await Models.Vote.findOne({
        transactionHash: info.transactionHash,
        daoAddress: '0xDaoAddress',
        memberAddress: '0xVoter',
        pluginAddress: '0xPluginAddress',
        proposalIndex: 1,
      })
      expect(voteDb).to.exist
    })

    it('should handle proposal not found in voteCast', async () => {
      const info: ILogInfo = {
        transactionHash: '0x123',
        transactionIndex: 1,
        logIndex: 1,
        address: '0x456',
        blockNumber: 1,
        network: NetworksEnum.ethereumMainnet,
        eventName: 'voteCast',
      }

      const fakeEvent = {
        args: {
          proposalId: BigInt(1),
          voter: '0xVoter',
          voteOption: BigInt(1),
          votingPower: BigInt(1000),
        },
      }

      const stubLogger = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)

      await ProposalHandler.voteCast(fakeEvent as any, info)

      expect(stubLogger.calledOnceWith('VoteCast - Proposal not found' as any)).to.be.true
    })
  })

  describe('proposalExecuted', () => {
    it('should handle proposalExecuted event', async () => {
      const rawProposalTokenVoting = ProposalList[0]
      const createdProposal = await Models.Proposal.create(rawProposalTokenVoting)

      const network = NetworksEnum.polygonMainnet
      const info: ILogInfo = {
        transactionHash: createdProposal.transactionHash,
        transactionIndex: createdProposal.transactionIndex,
        logIndex: createdProposal.logIndex,
        address: createdProposal.pluginAddress,
        blockNumber: createdProposal.blockNumber,
        network,
        eventName: 'proposalExecuted',
      }

      const fakeEvent = {
        args: {
          proposalId: rawProposalTokenVoting.proposalIndex,
        },
      }

      const stubMessagingQueue = sandbox.stub(RabbitMQHelper, 'sendMessage').resolves()
      const stubGetBlockTimestamp = sandbox.stub(Web3Helper, 'getBlockTimestamp').resolves(123456789)

      await ProposalHandler.proposalExecuted(fakeEvent as any, info)

      expect(stubMessagingQueue.calledOnce).to.be.true
      expect(stubGetBlockTimestamp.calledOnce).to.be.true

      const proposalDb = await Models.Proposal.findOne({
        transactionHash: rawProposalTokenVoting.transactionHash,
        daoAddress: rawProposalTokenVoting.daoAddress,
        pluginAddress: rawProposalTokenVoting.pluginAddress,
        proposalIndex: rawProposalTokenVoting.proposalIndex,
      })
      expect(proposalDb).to.exist
      expect(proposalDb.executed.status).to.be.true
    })

    it('should handle proposal not found in proposalExecuted', async () => {
      const info: ILogInfo = {
        transactionHash: '0x123',
        transactionIndex: 1,
        logIndex: 1,
        address: '0x456',
        blockNumber: 1,
        network: NetworksEnum.polygonMainnet,
        eventName: 'proposalExecuted',
      }

      const fakeEvent = {
        args: {
          proposalId: BigInt(1),
        },
      }

      const stubLogger = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)

      await ProposalHandler.proposalExecuted(fakeEvent as any, info)

      expect(stubLogger.calledOnceWith('proposal not found' as any)).to.be.true
    })
  })
})
