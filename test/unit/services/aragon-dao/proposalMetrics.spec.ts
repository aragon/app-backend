import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { Models } from '@dbModels'
import Logger from '@logger'
import { ProposalMetrics } from '@services/aragon-dao/proposalMetrics'
import DbOperations from '@models/utils/dbOperations'
import { NetworksEnum } from '@types'

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
      const proposal = {
        id: 'proposal-id',
        settings: { minApprovals: 3 },
      }
      const votes = [{}, {}, {}] // 3 votes
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findVotes').resolves(votes as any)
      const updateStub = sandbox.stub(DbOperations, 'updateDocument').resolves(proposal as any)

      const result = await ProposalMetrics.proposalMultisigMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result.id).to.eq(proposal.id)
      expect(updateStub.calledOnce).to.be.true
      expect(updateStub.args[0][0].id).to.eq(proposal.id)
      expect(updateStub.args[0][1]).to.deep.include({
        metrics: { totalVotes: votes.length, missingVotes: 0 },
      })
    })

    it('should log a warning if the proposal is not found', async () => {
      const loggerStub = sandbox.stub(Logger, 'warn')
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
      const loggerStub = sandbox.stub(Logger, 'error')

      await ProposalMetrics.proposalMultisigMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(loggerStub.calledOnceWith('Proposal minApprovals not found - multisig metrics' as any)).to.be.true
    })
  })

  describe('proposalTokenVotingMetrics', () => {
    it('should update tokenVoting proposal metrics with correct votes and missing votes', async () => {
      const proposal = { id: 'proposal-id' }
      const votes = [
        { voteOption: 1, votingPower: '100' },
        { voteOption: 1, votingPower: '200' },
        { voteOption: 2, votingPower: '50' },
      ]
      const members = [{}, {}, {}, {}] // 4 members
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(proposal as any)
      sandbox.stub(Models.Vote, 'findVotes').resolves(votes as any)
      sandbox.stub(Models.DaoMemberMapping, 'findAllMembersOfPlugin').resolves(members as any)
      const updateStub = sandbox.stub(DbOperations, 'updateDocument').resolves(proposal as any)

      const result = await ProposalMetrics.proposalTokenVotingMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(result.id).to.eq(proposal.id)
      expect(updateStub.calledOnce).to.be.true
      expect(updateStub.args[0][0].id).to.eq(proposal.id)
      expect(updateStub.args[0][1]).to.deep.include({
        metrics: {
          totalVotes: votes.length,
          missingVotes: members.length - votes.length,
          votesByOption: [
            { type: '1', totalVotes: 2, totalVotingPower: '300' },
            { type: '2', totalVotes: 1, totalVotingPower: '50' },
          ],
        },
      })
    })

    it('should log a warning if the proposal is not found', async () => {
      const loggerStub = sandbox.stub(Logger, 'warn')
      sandbox.stub(Models.Proposal, 'findByProposalIndex').resolves(null)

      await ProposalMetrics.proposalTokenVotingMetrics({
        proposalIndex: '1',
        pluginAddress: '0xPluginAddress',
        network: NetworksEnum.ethereumMainnet,
      })

      expect(loggerStub.calledOnceWith('Proposal not found - tokenVoting metrics' as any)).to.be.true
    })
  })
})
