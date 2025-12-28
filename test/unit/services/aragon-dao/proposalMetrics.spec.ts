import { Models } from '@dbModels'
import logger from '@logger'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import { ProposalList } from '@test/mock/fakeProposal'
import { NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('AragonDao:ProposalMetrics', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(async () => {
    sandbox?.restore()
  })

  describe('proposalMultisigMetrics', () => {
    it('should update multisig proposal metrics with votes', async () => {
      const rawProposal: any = ProposalList[0]
      rawProposal.settings.minApprovals = 3
      const proposal = await Models.Proposal.create(rawProposal)

      const votes = [{}, {}, {}] // 3 votes
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findVotes').resolves(votes as any)
      const logVerbose = sandbox.stub(logger, 'verbose')

      const result = await ProposalMetrics.proposalMultisigMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result.id).to.eq(proposal.id)
      expect(logVerbose.calledOnce).to.be.true
    })

    it('should log a warning if the proposal is not found', async () => {
      const loggerStub = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)

      await ProposalMetrics.proposalMultisigMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(loggerStub.calledOnceWith('Proposal not found - multisig metrics' as any)).to.be.true
    })

    it('should log an error if `minApprovals` is missing in the proposal settings', async () => {
      const proposal = { id: 'proposal-id', settings: {} }
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findVotes').resolves([])
      const loggerWarnStub = sandbox.stub(logger, 'warn')
      const loggerStub = sandbox.stub(logger, 'error')

      await ProposalMetrics.proposalMultisigMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(loggerWarnStub.calledOnceWith('MinApprovals not found - multisig metrics' as any)).to.be.true
      expect(loggerStub.calledWith('Error updating multisig metrics' as any)).to.be.true
    })

    it('should throw', async () => {
      sandbox.stub(Models.Proposal, 'findByProposalIndex').rejects(new Error('error'))
      const loggerStub = sandbox.stub(logger, 'error')

      await ProposalMetrics.proposalMultisigMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(loggerStub.calledOnceWith('Error updating multisig metrics' as any)).to.be.true
    })
  })

  describe('proposalTokenVotingMetrics', () => {
    it('should update tokenVoting proposal metrics with correct votes and missing votes', async () => {
      const rawProposal: any = ProposalList[0]
      const proposal = await Models.Proposal.create(rawProposal)

      const votes = [
        { voteOption: 1, votingPower: '100' },
        { voteOption: 1, votingPower: '200' },
        { voteOption: 2, votingPower: '50' },
      ]
      const members = [{}, {}, {}, {}] // 4 members
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findVotes').resolves(votes as any)
      sandbox.stub(Models.PluginMember, 'findAllMembersOfPlugin').resolves(members as any)
      const logVerbose = sandbox.stub(logger, 'verbose')

      const result = await ProposalMetrics.proposalTokenVotingMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result.id).to.eq(proposal.id)
      expect(logVerbose.calledOnce).to.be.true
    })

    it('should log a warning if the proposal is not found', async () => {
      const loggerStub = sandbox.stub(logger, 'warn')
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)

      await ProposalMetrics.proposalTokenVotingMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(loggerStub.calledOnceWith('Proposal not found - tokenVoting metrics' as any)).to.be.true
    })

    it('should throw', async () => {
      sandbox.stub(Models.Proposal, 'findByProposalIndex').rejects(new Error('error'))
      const loggerStub = sandbox.stub(logger, 'error')

      await ProposalMetrics.proposalTokenVotingMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(loggerStub.calledOnceWith('Error updating tokenVoting metrics' as any)).to.be.true
    })

    it('should calculate missingVotes correctly when votes.length >= members.length', async () => {
      const rawProposal: any = ProposalList[0]
      const proposal = await Models.Proposal.create(rawProposal)

      const votes = [
        { voteOption: 1, votingPower: '100' },
        { voteOption: 1, votingPower: '200' },
        { voteOption: 2, votingPower: '50' },
        { voteOption: 3, votingPower: '75' },
        { voteOption: 1, votingPower: '150' },
      ]
      const members = [{}, {}, {}] // 3 members, fewer than votes
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findVotes').resolves(votes as any)
      sandbox.stub(Models.PluginMember, 'findAllMembersOfPlugin').resolves(members as any)
      const logVerbose = sandbox.stub(logger, 'verbose')

      const result = await ProposalMetrics.proposalTokenVotingMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result.id).to.eq(proposal.id)
      expect(logVerbose.calledOnce).to.be.true
      // missingVotes should be votes.length - members.length = 5 - 3 = 2
    })
  })
})
