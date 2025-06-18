import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import { VoteInfo } from '@services/aragon-dao/voteInfo'
import { ProposalList } from '@test/mock/fakeProposal'
import { PluginList } from '@test/mock/fakePlugins'
import { Models } from '@dbModels'
import GovernanceErc20Helper from '@helpers/governanceErc20'
import Web3Helper from '@helpers/web3'
import { IPluginInterfaceType } from '@types'
import Proposal from '@models/schema/proposal'

describe('AragonDao:VoteInfo', () => {
  let sandbox: SinonSandbox
  let proposalDb: Proposal | null = null
  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    proposalDb = (await Models.Proposal.create({
      ...ProposalList[1],
      endDate: Math.floor(Date.now() / 1000 + 1000e6),
      executed: {
        status: false,
      },
    })) as Proposal

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

    it('should return if plugin setting says voting mode is revoting', async () => {
      const plugin = await Models.Plugin.findOne({})
      const proposal = await Models.Proposal.findOne({})
      await proposal.update({
        settings: {
          votingMode: 2,
        },
      })

      const findVoteOnPluginStub = sandbox.stub(Models.Vote, 'findVoteOnPlugin').resolves(true)

      const result = await VoteInfo.getVoteInfo({ proposalId: proposal.id, userAddress: '0xUserAddress' })
      expect(result).to.be.true
      expect(findVoteOnPluginStub.calledOnce).to.be.true
      expect(findVoteOnPluginStub.args[0][0].memberAddress).to.be.eq('0xUserAddress')
      expect(findVoteOnPluginStub.args[0][0].pluginAddress).to.be.eq(plugin.address)
      expect(findVoteOnPluginStub.args[0][0].proposalIndex).to.be.eq(proposal.id)
      expect(findVoteOnPluginStub.args[0][0].network).to.be.eq(plugin.network)
    })

    it('should return true for token voting if user has sufficient voting power', async () => {
      const getPastVotesStub = sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('160000')
      const plugin = await Models.Plugin.findOne({})

      const result = await VoteInfo.getVoteInfo({ proposalId: proposalDb!.id, userAddress: '0xUserAddress' })

      expect(getPastVotesStub.calledOnce).to.be.true
      expect(getPastVotesStub.calledWith('0xUserAddress')).to.be.true
      expect(result).to.be.true
      expect(getPastVotesStub.args[0][1]).to.be.eq(plugin.tokenAddress)
      expect(getPastVotesStub.args[0][2]).to.be.eq(ProposalList[1].blockNumber)
      expect(getPastVotesStub.args[0][3]).to.be.eq(ProposalList[1].blockTimestamp)
      expect(getPastVotesStub.args[0][4]).to.be.eq(plugin.network)
    })

    it('should return false for token voting if user does not have sufficient voting power', async () => {
      const getPastVotesStub = sandbox.stub(GovernanceErc20Helper, 'getPastVotes').resolves('0')

      const result = await VoteInfo.getVoteInfo({ proposalId: proposalDb!.id, userAddress: '0xUserAddress' })
      expect(result).to.be.false

      expect(getPastVotesStub.calledOnce).to.be.true
      expect(getPastVotesStub.calledWith('0xUserAddress')).to.be.true
    })

    it('should return true for multi sig if user is a member', async () => {
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

      const result = await VoteInfo.getVoteInfo({ proposalId: proposalDb!.id, userAddress: '0xUserAddress' })

      expect(result).to.be.true
      expect(isMultisigMemberAtBlockStub.calledOnce).to.be.true
      expect(isMultisigMemberAtBlockStub.args[0][0]).to.be.eq(plugin.address)
      expect(isMultisigMemberAtBlockStub.args[0][1]).to.be.eq('0xUserAddress')
      expect(isMultisigMemberAtBlockStub.args[0][2]).to.be.eq(proposal.blockNumber)
    })

    it('should return false if error occurs', async () => {
      const proposal = await Models.Proposal.findOne({})

      const _handleForTokenVotingStub = sandbox.stub(VoteInfo, '_handleForTokenVoting').throws(new Error('error'))

      const result = await VoteInfo.getVoteInfo({ proposalId: proposal.id, userAddress: '0xUserAddress' })
      expect(result).to.be.false
      expect(_handleForTokenVotingStub.calledOnce).to.be.true
    })

    it('should return false is plugin type is not multisig or token voting', async () => {
      const plugin = await Models.Plugin.findOne({})

      await plugin.update({
        interfaceType: IPluginInterfaceType.spp,
      })

      const result = await VoteInfo.getVoteInfo({ proposalId: proposalDb!.id, userAddress: '0xUserAddress' })
      expect(result).to.be.false
    })

    it('should return true if only listed is false', async () => {
      const plugin = await Models.Plugin.findOne({})

      await plugin.update({
        interfaceType: IPluginInterfaceType.multisig,
      })

      const proposal = await Models.Proposal.findOne({})

      await proposal.update({
        settings: {
          onlyListed: false,
        },
      })

      const isMultisigMemberAtBlockStub = sandbox.stub(Web3Helper, 'isMultisigMemberAtBlock').resolves(true)

      const result = await VoteInfo._handleForMultiSig('0xUserAddress', proposal, await plugin.reload())

      expect(result).to.be.true
      expect(isMultisigMemberAtBlockStub.calledOnce).to.be.false
    })
  })
})
