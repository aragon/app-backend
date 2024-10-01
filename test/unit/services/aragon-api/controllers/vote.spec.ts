import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import VoteController from '@services/aragon-api/controllers/vote'
import { Models } from '@dbModels'
import Vote from '@models/schema/vote'
import PairDataModule from '@modules/pairData'
import { FakeVote } from '@test/mock/fakeVote'
import { FakeToken } from '@test/mock/fakeToken'
import { ProposalList } from '@test/mock/fakeProposal'
import { FakeMember } from '@test/mock/fakeMember'
import { FakeDaoMemberMappings } from '@test/mock/fakeDaoMappings'
import Proposal from '@models/schema/proposal'
import Member from '@models/schema/member'
import DaoMemberMapping from '@models/schema/daoMemberMapping'
import Token from '@models/schema/token'
import { fakeSettings } from '@test/mock/fakeSettings'
import type { IMemberVotesInfo } from '@src/types/voting'
import { HexAddress, NetworksEnum } from '@types'
import { PluginList } from '@test/mock/fakePlugins'

describe('Controller: Vote', () => {
  let sandbox: SinonSandbox
  let rawVote: Partial<Vote>
  let rawToken: Partial<Token>
  let rawProposal: Partial<Proposal>
  let rawMember: Partial<Member>
  let rawDaoMemberMappings: Partial<DaoMemberMapping>

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

    rawDaoMemberMappings = {
      ...(FakeDaoMemberMappings[0] as any),
      daoAddress: rawProposal.daoAddress,
      pluginAddress: rawProposal.pluginAddress,
      memberAddress: rawMember.address,
    }

    await Promise.all([
      Models.Vote.create(rawVote),
      Models.Token.create(rawToken),
      Models.Proposal.create(rawProposal),
      Models.Member.create(rawMember),
      Models.DaoMemberMapping.create(rawDaoMemberMappings),
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
    it('should get member votes info', async () => {
      const params: IMemberVotesInfo = {
        memberAddress: rawVote.memberAddress as HexAddress,
        pluginAddress: rawVote.pluginAddress as HexAddress,
        network: rawVote.network as NetworksEnum,
        proposalIndex: rawVote.proposalIndex as number,
      }

      const response = await VoteController.memberVotesInfo(params)

      expect(response).to.have.property('transactionHash').to.eq(rawVote.transactionHash)
    })

    it('should return false if user voting status is not exist', async () => {
      const params: IMemberVotesInfo = {
        memberAddress: '0x123' as HexAddress,
        pluginAddress: rawVote.pluginAddress as HexAddress,
        network: rawVote.network as NetworksEnum,
        proposalIndex: rawVote.proposalIndex as number,
      }

      const response = await VoteController.memberVotesInfo(params)

      expect(response).to.be.false
    })
  })

  describe('canVote', () => {
    it('should return true if the user can vote', async () => {
      const params = {
        pluginAddress: rawVote.pluginAddress as HexAddress,
        memberAddress: rawVote.memberAddress as HexAddress,
        network: rawVote.network as NetworksEnum,
        proposalIndex: rawVote.proposalIndex as number,
      }

      const proposals = await Models.Proposal.find({})

      const firstProposal = proposals[0]
      firstProposal.endDate = Math.floor(Date.now() / 1000) + 10000
      await firstProposal.save()

      const activeSettings = await Models.Setting.findActive({
        daoAddress: rawProposal.daoAddress,
        pluginAddress: rawProposal.pluginAddress,
        network: rawProposal.network,
      } as any)

      activeSettings.votingMode = 2
      await activeSettings.save()

      const response = await VoteController.canVote(params)
      expect(response).to.be.true
    })

    it('should return false if the proposal is expired', async () => {
      const params = {
        pluginAddress: rawVote.pluginAddress as HexAddress,
        memberAddress: rawVote.memberAddress as HexAddress,
        network: rawVote.network as NetworksEnum,
        proposalIndex: rawVote.proposalIndex as number,
      }

      const proposals = await Models.Proposal.find({})

      const firstProposal = proposals[0]
      firstProposal.endDate = Math.floor(Date.now() / 1000) - 10000
      await firstProposal.save()

      const response = await VoteController.canVote(params)
      expect(response).to.be.false
    })

    it('should return false if the proposal is executed', async () => {
      const params = {
        pluginAddress: rawVote.pluginAddress as HexAddress,
        memberAddress: rawVote.memberAddress as HexAddress,
        network: rawVote.network as NetworksEnum,
        proposalIndex: rawVote.proposalIndex as number,
      }

      const proposals = await Models.Proposal.find({})

      const firstProposal = proposals[0]
      firstProposal.executed = { status: true }
      await firstProposal.save()

      const response = await VoteController.canVote(params)
      expect(response).to.be.false
    })

    it('should return true if the user has not voted yet', async () => {
      const params = {
        pluginAddress: rawVote.pluginAddress as HexAddress,
        memberAddress: rawVote.memberAddress as HexAddress,
        network: rawVote.network as NetworksEnum,
        proposalIndex: 15,
      }

      const proposals = await Models.Proposal.find({})
      const firstProposal = proposals[0]
      firstProposal.endDate = Math.floor(Date.now() / 1000) + 10000
      firstProposal.proposalIndex = 15
      await firstProposal.save()

      const response = await VoteController.canVote(params)
      expect(response).to.be.true
    })

    it('should throw error and return false if member or plugin not found', async () => {
      const params = {
        pluginAddress: '0x123' as HexAddress,
        memberAddress: '0x123' as HexAddress,
        network: rawVote.network as NetworksEnum,
        proposalIndex: rawVote.proposalIndex as number,
      }

      const response = await VoteController.canVote(params)
      expect(response).to.be.false
    })
  })
})
