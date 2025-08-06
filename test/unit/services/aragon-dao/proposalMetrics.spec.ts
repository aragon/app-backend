import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import { NetworksEnum } from '@types'
import { ProposalList } from '@test/mock/fakeProposal'
import logger from '@logger'

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
      sandbox.stub(Models.Vote, 'find').resolves(votes as any)
      sandbox.stub(Models.DaoMemberMapping, 'findAllMembersOfPlugin').resolves(members as any)
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

    it('should only include votes where voteCleared.status is false or does not exist', async () => {
      const rawProposal: any = ProposalList[0]
      const proposal = await Models.Proposal.create(rawProposal)

      const allVotes = [
        { voteOption: 1, votingPower: '100', voteCleared: { status: false } }, // Should be included
        { voteOption: 1, votingPower: '200', voteCleared: { status: true } }, // Should be excluded
        { voteOption: 2, votingPower: '50' }, // Should be included (no voteCleared)
        { voteOption: 2, votingPower: '150', voteCleared: {} }, // Should be included (voteCleared exists but no status)
      ]

      const members = [{}, {}, {}, {}]
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)

      const findStub = sandbox.stub(Models.Vote, 'find')
      findStub.callsFake((filter: any) => {
        // Verify the filter includes the correct $or condition
        expect(filter).to.have.property('$or')
        expect(filter.$or).to.deep.equal([
          { 'voteCleared.status': false },
          { 'voteCleared.status': { $exists: false } },
        ])

        // Return only votes that match the filter
        return Promise.resolve(
          allVotes.filter(vote => {
            if (!vote.voteCleared || vote.voteCleared.status === undefined) return true
            return vote.voteCleared.status === false
          }),
        )
      })

      sandbox.stub(Models.DaoMemberMapping, 'findAllMembersOfPlugin').resolves(members as any)
      const logVerbose = sandbox.stub(logger, 'verbose')

      const result = await ProposalMetrics.proposalTokenVotingMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result.id).to.eq(proposal.id)
      expect(result.metrics.totalVotes).to.eq(3) // Only 3 votes should be counted (excluding the one with status: true)
      expect(logVerbose.calledOnce).to.be.true
    })

    it('should correctly filter votes with voteCleared.status = true', async () => {
      const rawProposal: any = ProposalList[0]
      const proposal = await Models.Proposal.create(rawProposal)

      const votes = [
        { voteOption: 1, votingPower: '100', voteCleared: { status: true } },
        { voteOption: 1, votingPower: '200', voteCleared: { status: true } },
      ]

      const members = [{}, {}]
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)

      const findStub = sandbox.stub(Models.Vote, 'find')
      findStub.resolves([]) // All votes are cleared, so none should be returned

      sandbox.stub(Models.DaoMemberMapping, 'findAllMembersOfPlugin').resolves(members as any)
      const logVerbose = sandbox.stub(logger, 'verbose')

      const result = await ProposalMetrics.proposalTokenVotingMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result.id).to.eq(proposal.id)
      expect(result.metrics.totalVotes).to.eq(0) // No votes should be counted
      expect(result.metrics.missingVotes).to.eq(2) // All members are missing votes
      expect(logVerbose.calledOnce).to.be.true
    })

    it('should include votes with voteCleared.status = false', async () => {
      const rawProposal: any = ProposalList[0]
      const proposal = await Models.Proposal.create(rawProposal)

      const votes = [
        { voteOption: 1, votingPower: '100', voteCleared: { status: false } },
        { voteOption: 2, votingPower: '200', voteCleared: { status: false } },
      ]

      const members = [{}, {}]
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'find').resolves(votes as any)
      sandbox.stub(Models.DaoMemberMapping, 'findAllMembersOfPlugin').resolves(members as any)
      const logVerbose = sandbox.stub(logger, 'verbose')

      const result = await ProposalMetrics.proposalTokenVotingMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result.id).to.eq(proposal.id)
      expect(result.metrics.totalVotes).to.eq(2) // Both votes should be counted
      expect(result.metrics.missingVotes).to.eq(0) // No missing votes
      expect(logVerbose.calledOnce).to.be.true
    })

    it('should include votes without voteCleared field', async () => {
      const rawProposal: any = ProposalList[0]
      const proposal = await Models.Proposal.create(rawProposal)

      const votes = [
        { voteOption: 1, votingPower: '100' }, // No voteCleared field
        { voteOption: 2, votingPower: '200' }, // No voteCleared field
      ]

      const members = [{}, {}]
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'find').resolves(votes as any)
      sandbox.stub(Models.DaoMemberMapping, 'findAllMembersOfPlugin').resolves(members as any)
      const logVerbose = sandbox.stub(logger, 'verbose')

      const result = await ProposalMetrics.proposalTokenVotingMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result.id).to.eq(proposal.id)
      expect(result.metrics.totalVotes).to.eq(2) // Both votes should be counted
      expect(result.metrics.missingVotes).to.eq(0) // No missing votes
      expect(logVerbose.calledOnce).to.be.true
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
  })
})
