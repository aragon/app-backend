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

    it('should log a warning and return early if `minApprovals` is missing in the proposal settings', async () => {
      const proposal = { id: 'proposal-id', settings: {} }
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      const findVotesStub = sandbox.stub(Models.Vote, 'findVotes').resolves([])
      const loggerWarnStub = sandbox.stub(logger, 'warn')
      const loggerErrorStub = sandbox.stub(logger, 'error')

      await ProposalMetrics.proposalMultisigMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(loggerWarnStub.calledOnceWith('MinApprovals not found - multisig metrics' as any)).to.be.true
      expect(findVotesStub.called).to.be.false
      expect(loggerErrorStub.called).to.be.false
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

    it('should compute the effective objection tally from the initial stage-1 values', async () => {
      const rawProposal: any = {
        ...ProposalList[0],
        id: 'objection-proposal-metrics',
        transactionHash: '0xObjectionMetricsTx',
        initialTally: { abstain: '300', yes: '1000', no: '50' },
      }
      const proposal = await Models.Proposal.create(rawProposal)

      const votes = [
        // stage-1 Yes voter objecting with 400
        { voteOption: 3, votingPower: '400', objectionFromVoteOption: 2 },
        // stage-1 Abstain voter objecting with 100
        { voteOption: 3, votingPower: '100', objectionFromVoteOption: 1 },
        // never voted in stage 1 — adds straight to no
        { voteOption: 3, votingPower: '25', objectionFromVoteOption: 0 },
      ]
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findVotes').resolves(votes as any)
      sandbox.stub(Models.PluginMember, 'findAllMembersOfPlugin').resolves([] as any)
      sandbox.stub(logger, 'verbose')

      await ProposalMetrics.proposalTokenVotingMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      const updated = await Models.Proposal.findOne({ id: 'objection-proposal-metrics' })
      const byType = Object.fromEntries(updated.metrics.votesByOption.map((v: any) => [v.type, v.totalVotingPower]))
      expect(byType[1]).to.eq('200') // 300 abstain - 100 moved
      expect(byType[2]).to.eq('600') // 1000 yes - 400 moved
      expect(byType[3]).to.eq('575') // 50 no + 400 + 100 + 25
      expect(updated.metrics.totalVotes).to.eq(3)
    })

    it('should warn and count as fromNone when an objection vote is missing its source option', async () => {
      const rawProposal: any = {
        ...ProposalList[0],
        id: 'objection-proposal-missing-source',
        transactionHash: '0xObjectionMissingSourceTx',
        initialTally: { abstain: '300', yes: '1000', no: '50' },
      }
      const proposal = await Models.Proposal.create(rawProposal)

      // ObjectionCast not yet processed — no objectionFromVoteOption on the vote row
      const votes = [{ memberAddress: '0xVoter', voteOption: 3, votingPower: '400' }]
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findVotes').resolves(votes as any)
      sandbox.stub(Models.PluginMember, 'findAllMembersOfPlugin').resolves([] as any)
      sandbox.stub(logger, 'verbose')
      const warnStub = sandbox.stub(logger, 'warn')

      await ProposalMetrics.proposalTokenVotingMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(warnStub.calledOnceWith('Objection vote missing source option, counted as fromNone' as any)).to.be.true

      const updated = await Models.Proposal.findOne({ id: 'objection-proposal-missing-source' })
      const byType = Object.fromEntries(updated.metrics.votesByOption.map((v: any) => [v.type, v.totalVotingPower]))
      expect(byType[1]).to.eq('300') // untouched
      expect(byType[2]).to.eq('1000') // untouched
      expect(byType[3]).to.eq('450') // 50 no + 400
    })

    it('should warn and preserve total voting power when an objection exceeds its source bucket', async () => {
      const rawProposal: any = {
        ...ProposalList[0],
        id: 'objection-proposal-clamped',
        transactionHash: '0xObjectionClampedTx',
        initialTally: { abstain: '0', yes: '100', no: '50' },
      }
      const proposal = await Models.Proposal.create(rawProposal)

      // stage-1 Yes voter objecting with more power than the whole yes bucket holds
      const votes = [{ memberAddress: '0xVoter', voteOption: 3, votingPower: '400', objectionFromVoteOption: 2 }]
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findVotes').resolves(votes as any)
      sandbox.stub(Models.PluginMember, 'findAllMembersOfPlugin').resolves([] as any)
      sandbox.stub(logger, 'verbose')
      const warnStub = sandbox.stub(logger, 'warn')

      await ProposalMetrics.proposalTokenVotingMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(
        warnStub.calledOnceWith(
          'Objection voting power exceeds initial tally bucket, debiting available amount only' as any,
        ),
      ).to.be.true

      const updated = await Models.Proposal.findOne({ id: 'objection-proposal-clamped' })
      const byType = Object.fromEntries(updated.metrics.votesByOption.map((v: any) => [v.type, v.totalVotingPower]))
      expect(byType[1]).to.eq('0')
      expect(byType[2]).to.eq('0') // 100 yes fully drained
      expect(byType[3]).to.eq('150') // 50 no + only the 100 actually debited, not the full 400

      // total voting power is conserved against the initial tally
      const total = Object.values(byType).reduce((sum: bigint, vp: any) => sum + BigInt(vp), 0n)
      expect(total.toString()).to.eq('150')
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
