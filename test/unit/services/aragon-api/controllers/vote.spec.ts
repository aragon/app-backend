import { Models } from '@dbModels'
import Member from '@models/schema/member'
import Proposal from '@models/schema/proposal'
import Token from '@models/schema/token'
import TokenMember from '@models/schema/tokenMember'
import Vote from '@models/schema/vote'
import PairDataModule from '@modules/pairData'
import VoteController from '@services/aragon-api/controllers/vote'
import { FakeMember } from '@test/mock/fakeMember'
import { PluginList } from '@test/mock/fakePlugins'
import { ProposalList } from '@test/mock/fakeProposal'
import { fakeSettings } from '@test/mock/fakeSettings'
import { FakeToken } from '@test/mock/fakeToken'
import { fakeTokenMembers } from '@test/mock/fakeTokenMember'
import { FakeVote } from '@test/mock/fakeVote'
import { IPluginInterfaceType } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('Controller: Vote', () => {
  let sandbox: SinonSandbox
  let rawVote: Partial<Vote>
  let rawToken: Partial<Token>
  let rawProposal: Partial<Proposal>
  let rawMember: Partial<Member>
  let rawTokenMember: Partial<TokenMember>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawToken = {
      ...(FakeToken as any),
    }

    rawProposal = {
      ...(ProposalList[0] as any),
      daoAddress: ProposalList[0].daoAddress,
      settings: {
        ...(ProposalList[0].settings as any),
        tokenAddress: FakeToken.address,
      },
    }

    rawVote = {
      ...FakeVote,
      tokenAddress: FakeToken.address,
      memberAddress: FakeMember.address,
      proposalIndex: rawProposal.proposalIndex,
    }

    rawMember = {
      ...(FakeMember as any),
    }

    rawTokenMember = {
      memberAddress: rawMember.address,
      tokenAddress: rawToken.address,
      network: rawProposal.network,
      votingPower: '1000000000000000000',
      delegateReceivedCount: 0,
      tokenIds: [],
    }

    await Promise.all([
      Models.Vote.create(rawVote),
      Models.Token.create(rawToken),
      Models.Proposal.create(rawProposal),
      Models.Member.create(rawMember),
      Models.TokenMember.create(rawTokenMember),
      Models.Setting.create({
        ...fakeSettings,
        pluginAddress: rawProposal.pluginAddress,
        daoAddress: rawProposal.daoAddress,
      }),
      Models.Plugin.create({
        ...PluginList[0],
        daoAddress: rawProposal.daoAddress,
        network: rawProposal.network,
        address: rawProposal.pluginAddress,
        tokenAddress: FakeToken.address,
        interfaceType: IPluginInterfaceType.tokenVoting,
      }),
    ])
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getVoteWithPagination', () => {
    it('should get vote with pagination - all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        network: rawVote.network,
        pluginAddress: rawVote.pluginAddress,
        daoAddress: rawVote.daoAddress,
        tokenAddress: rawVote.tokenAddress,
        proposalIndex: rawVote.proposalIndex,
        memberAddress: rawVote.memberAddress,
      }

      const spyReq = sandbox.spy(Models.Vote, 'findWithPagination')

      const response = await VoteController.getVoteWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)
      expect(response.data[0].network).to.eq(rawVote.network)
      expect(response.data[0].blockNumber).to.eq(rawVote.blockNumber)
      expect(response.data[0].transactionHash).to.eq(rawVote.transactionHash)
      expect(response.data[0].member.address).to.eq(rawVote.memberAddress)
      expect(response.data[0].member.ens).to.eq(rawMember.ens)
      expect(response.data[0].votingPower).to.eq(rawVote.votingPower)
      expect(response.data[0].token.type).to.eq(rawToken.type)
      expect(response.data[0].token.address).to.eq(rawToken.address)
      expect(response.data[0].token.decimals).to.eq(rawToken.decimals)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get vote with pagination - ens', async () => {
      const ens = rawMember.ens
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const pairParams: any = { ens }

      const spyReq = sandbox.spy(Models.Vote, 'findWithPagination')

      const pairDatModuleSpy = sandbox.spy(PairDataModule, 'pairFromExtraParams')

      const response = await VoteController.getVoteWithPagination(paginationParams, {}, pairParams)

      const pairDataModuleReturnedValue = await pairDatModuleSpy.returnValues[0]

      expect(pairDataModuleReturnedValue).to.have.property('memberAddress').to.eq(rawVote.memberAddress)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: {
            memberAddress: rawVote.memberAddress,
          },
          paginationParams: {
            search: '',
            pageSize: 10,
            page: 1,
            order: 'asc',
            sort: 'createdAt',
          },
        }),
      ).to.be.true

      expect(response).to.have.property('data').with.lengthOf(1)

      expect(response.data[0].network).to.eq(rawVote.network)
      expect(response.data[0].blockNumber).to.eq(rawVote.blockNumber)
      expect(response.data[0].transactionHash).to.eq(rawVote.transactionHash)
      expect(response.data[0].member.address).to.eq(rawVote.memberAddress)
      expect(response.data[0].member.ens).to.eq(rawMember.ens)
      expect(response.data[0].votingPower).to.eq(rawVote.votingPower)
      expect(response.data[0].token.type).to.eq(rawToken.type)
      expect(response.data[0].token.address).to.eq(rawToken.address)
      expect(response.data[0].token.decimals).to.eq(rawToken.decimals)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should return empty response if filter params is not exist', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        network: rawVote.network,
        daoAddress: '0xxx',
      }

      const spyReq = sandbox.spy(Models.Vote, 'findWithPagination')

      const response = await VoteController.getVoteWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true

      expect(response).to.have.property('data').with.lengthOf(0)
    })
  })

  describe('memberVotesInfo', () => {
    it('should return vote information when user has voted', async () => {
      const params = {
        memberAddress: rawVote.memberAddress!,
        pluginAddress: rawVote.pluginAddress!,
        network: rawVote.network!,
        proposalIndex: rawVote.proposalIndex!,
      }

      const spyReq = sandbox.spy(Models.Vote, 'findVoteOnPlugin')

      const response = await VoteController.memberVotesInfo(params)

      expect(spyReq.calledOnce).to.be.true
      expect(spyReq.calledWith(params)).to.be.true

      expect(response).to.be.an('object')
      expect(response).to.not.be.false

      if (response !== false) {
        expect(response.transactionHash).to.eq(rawVote.transactionHash)
        expect(response.transactionIndex).to.eq(rawVote.transactionIndex)
        expect(response.blockNumber).to.eq(rawVote.blockNumber)
        expect(response.blockTimestamp).to.eq(rawVote.blockTimestamp)
        expect(response.voteOption).to.eq(rawVote.voteOption)
        expect(response.votingPower).to.eq(rawVote.votingPower)
        expect(response.replacedTransactionHash).to.eq(rawVote.replacedTransactionHash || null)
        expect(response.daoAddress).to.eq(rawVote.daoAddress)
        expect(response.pluginAddress).to.eq(rawVote.pluginAddress)
        expect(response.proposalIndex).to.eq(rawVote.proposalIndex)
        expect(response.network).to.eq(rawVote.network)
      }
    })

    it('should return false when user has not voted', async () => {
      const params = {
        memberAddress: '0xNonExistentMember',
        pluginAddress: rawVote.pluginAddress!,
        network: rawVote.network!,
        proposalIndex: rawVote.proposalIndex!,
      }

      const spyReq = sandbox.spy(Models.Vote, 'findVoteOnPlugin')

      const response = await VoteController.memberVotesInfo(params)

      expect(spyReq.calledOnce).to.be.true
      expect(spyReq.calledWith(params)).to.be.true

      expect(response).to.be.false
    })

    it('should return false when proposal does not exist', async () => {
      const params = {
        memberAddress: rawVote.memberAddress!,
        pluginAddress: rawVote.pluginAddress!,
        network: rawVote.network!,
        proposalIndex: 'nonExistentProposal',
      }

      const spyReq = sandbox.spy(Models.Vote, 'findVoteOnPlugin')

      const response = await VoteController.memberVotesInfo(params)

      expect(spyReq.calledOnce).to.be.true
      expect(spyReq.calledWith(params)).to.be.true

      expect(response).to.be.false
    })
  })
})
