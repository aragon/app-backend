import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import VoteInfo from '@services/aragon-dao/voteInfo'
import { ProposalList } from '@test/mock/fakeProposal'
import { PluginList } from '@test/mock/fakePlugins'
import { Models } from '@dbModels'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import Web3Helper from '@helpers/web3'
import { IPluginInterfaceType } from '@types'
describe('VoteInfo', () => {
  let sandbox: SinonSandbox
  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    await Models.Proposal.create({
      ...ProposalList[1],
      endDate: Math.floor(Date.now() / 1000 + 1000e6),
      executed: {
        status: false,
      },
    })

    await Models.Plugin.create({
      ...PluginList[0],
      address: ProposalList[1].pluginAddress,
    })
  })
  afterEach(() => {
    sandbox.restore()
  })

  describe('getVoteInfo', () => {
    it('should return false if proposal is not found', async () => {
      const result = await VoteInfo.getVoteInfo({ proposalId: 'nonexistent', userAddress: '0xUserAddress' })
      expect(result).to.be.false
    })

    it('should return false if plugin is not found', async () => {
      const proposal = await Models.Proposal.findOne({})
      await proposal.update({
        pluginAddress: '0x00',
      })
      const result = await VoteInfo.getVoteInfo({ proposalId: proposal.id, userAddress: '0xUserAddress' })
      expect(result).to.be.false
    })

    it('should return false if proposal is expired', async () => {
      const proposal = await Models.Proposal.findOne({})

      await proposal.update({
        endDate: ProposalList[1].endDate,
      })

      const result = await VoteInfo.getVoteInfo({ proposalId: proposal.id, userAddress: '0xUserAddress' })
      expect(result).to.be.false
    })

    it('should return false if proposal is executed', async () => {
      const proposal = await Models.Proposal.findOne({})

      await proposal.update({
        executed: {
          status: true,
        },
      })

      const result = await VoteInfo.getVoteInfo({ proposalId: proposal.id, userAddress: '0xUserAddress' })
      expect(result).to.be.false
    })

    it('should return true for token voting if user has sufficient voting power', async () => {
      const getPastVotesStub = sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('160000')

      const result = await VoteInfo.getVoteInfo({ proposalId: ProposalList[1].id!, userAddress: '0xUserAddress' })

      expect(getPastVotesStub.calledOnce).to.be.true
      expect(getPastVotesStub.calledWith('0xUserAddress')).to.be.true
      expect(result).to.be.true
    })

    it('should return false for token voting if user does not have sufficient voting power', async () => {
      const getPastVotesStub = sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('0')

      const result = await VoteInfo.getVoteInfo({ proposalId: ProposalList[1].id!, userAddress: '0xUserAddress' })
      expect(result).to.be.false

      expect(getPastVotesStub.calledOnce).to.be.true
      expect(getPastVotesStub.calledWith('0xUserAddress')).to.be.true
    })

    it('should return true for multisig if user is a member', async () => {
      const plugin = await Models.Plugin.findOne({})

      await plugin.update({
        interfaceType: IPluginInterfaceType.multisig,
      })

      const proposal = await Models.Proposal.findOne({})

      await proposal.update({
        settings: {
          onlyListed: true,
        },
      })

      const isMultisigMemberAtBlockStub = sandbox.stub(Web3Helper, 'isMultisigMemberAtBlock').resolves(true)

      const result = await VoteInfo.getVoteInfo({ proposalId: ProposalList[1].id!, userAddress: '0xUserAddress' })

      expect(result).to.be.true
      expect(isMultisigMemberAtBlockStub.calledOnce).to.be.true
      expect(isMultisigMemberAtBlockStub.calledWith('0xUserAddress')).to.be.true
    })

    it('should return false if error occurs', async () => {
      const proposal = await Models.Proposal.findOne({})

      const _handleForTokenVotingStub = sandbox.stub(VoteInfo, '_handleForTokenVoting').throws(new Error('error'))

      const result = await VoteInfo.getVoteInfo({ proposalId: proposal.id, userAddress: '0xUserAddress' })
      expect(result).to.be.false
      expect(_handleForTokenVotingStub.calledOnce).to.be.true
    })
  })
})
