import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ProposalController from '@services/aragon-api/controllers/proposal'
import { ErrorKeyEnum } from '@types'
import { Models } from '@dbModels'
import Proposal from '@models/schema/proposal'
import PairDataModule from '@modules/pairData'
import Token from '@models/schema/token'
import Member from '@models/schema/member'
import DaoMemberMapping from '@models/schema/daoMemberMapping'
import { FakeToken } from '@test/mock/fakeToken'
import { ProposalList } from '@test/mock/fakeProposal'
import { FakeDaoMemberMappings } from '@test/mock/fakeDaoMappings'
import { FakeMember } from '@test/mock/fakeMember'

describe('Controller: Proposal', () => {
  let sandbox: SinonSandbox

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
      daoAddress: FakeDaoMemberMappings[0].daoAddress,
      settings: {
        ...(ProposalList[0].settings as any),
        tokenAddress: FakeToken.address,
      },
    }

    rawMember = {
      ...(FakeMember as any),
    }

    rawDaoMemberMappings = {
      ...(FakeDaoMemberMappings[0] as any),
    }

    await Promise.all([
      Models.Token.create(rawToken),
      Models.Proposal.create(rawProposal),
      Models.Member.create(rawMember),
      Models.DaoMemberMapping.create(rawDaoMemberMappings),
    ])
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getProposalsWithPagination', () => {
    it('should get proposals with pagination - all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        network: rawProposal.network,
        daoAddress: rawProposal.daoAddress,
        pluginAddress: rawProposal.pluginAddress,
        creatorAddress: rawProposal.creatorAddress,
      }

      const spyReq = sandbox.spy(Models.Proposal, 'findWithPagination')

      const response = await ProposalController.getProposalsWithPagination(paginationParams, filterParams)

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
      expect(response.data[0].network).to.eq(rawProposal.network)
      expect(response.data[0].blockNumber).to.eq(rawProposal.blockNumber)
      expect(response.data[0].transactionHash).to.eq(rawProposal.transactionHash)
      expect(response.data[0].daoAddress).to.eq(rawProposal.daoAddress)
      expect(response.data[0].pluginAddress).to.eq(rawProposal.pluginAddress)
      expect(response.data[0].proposalId).to.eq(rawProposal.proposalId)
      expect(response.data[0].title).to.eq(rawProposal.title)
      expect(response.data[0].executed.status).to.eq(rawProposal.executed?.status)
      expect(response.data[0].executed.transactionHash).to.eq(rawProposal.executed?.transactionHash)
      expect(response.data[0].executed.blockNumber).to.eq(rawProposal.executed?.blockNumber)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get proposals no params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}

      const spyReq = sandbox.spy(Models.Proposal, 'findWithPagination')

      const response = await ProposalController.getProposalsWithPagination(paginationParams, filterParams)

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
      expect(response.data[0].proposalId).to.eq(rawProposal.proposalId)
      expect(response.data[0].blockNumber).to.eq(rawProposal.blockNumber)
      expect(response.data[0].transactionHash).to.eq(rawProposal.transactionHash)
      expect(response.data[0].daoAddress).to.eq(rawProposal.daoAddress)
      expect(response.data[0].pluginAddress).to.eq(rawProposal.pluginAddress)
      expect(response.data[0].network).to.eq(rawProposal.network)
      expect(response.data[0].title).to.eq(rawProposal.title)
      expect(response.data[0].executed.status).to.eq(rawProposal.executed?.status)
      expect(response.data[0].executed.transactionHash).to.eq(rawProposal.executed?.transactionHash)
      expect(response.data[0].executed.blockNumber).to.eq(rawProposal.executed?.blockNumber)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get proposals with pagination - daoId', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}
      const pairParams: any = {
        daoId: `${rawProposal.network}-${rawProposal.daoAddress}`,
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({
        daoAddress: rawProposal.daoAddress,
        network: rawProposal.network,
      })
      const spyReq = sandbox.spy(Models.Proposal, 'findWithPagination')

      const response = await ProposalController.getProposalsWithPagination(paginationParams, filterParams, pairParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: {
            daoAddress: rawProposal.daoAddress,
            network: rawProposal.network,
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
      expect(response.data[0].network).to.eq(rawProposal.network)
      expect(response.data[0].blockNumber).to.eq(rawProposal.blockNumber)
      expect(response.data[0].transactionHash).to.eq(rawProposal.transactionHash)
      expect(response.data[0].daoAddress).to.eq(rawProposal.daoAddress)
      expect(response.data[0].pluginAddress).to.eq(rawProposal.pluginAddress)
      expect(response.data[0].proposalId).to.eq(rawProposal.proposalId)
      expect(response.data[0].title).to.eq(rawProposal.title)
      expect(response.data[0].executed.status).to.eq(rawProposal.executed?.status)
      expect(response.data[0].executed.transactionHash).to.eq(rawProposal.executed?.transactionHash)
      expect(response.data[0].executed.blockNumber).to.eq(rawProposal.executed?.blockNumber)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get proposals with pagination - daoId not found', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}
      const pairParams: any = {
        daoId: `${rawProposal.network}-${rawProposal.daoAddress}`,
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({})
      const spyReq = sandbox.spy(Models.Proposal, 'findWithPagination')

      const response = await ProposalController.getProposalsWithPagination(paginationParams, filterParams, pairParams)

      expect(spyReq.calledOnce).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
    })
  })

  describe('getProposalById', () => {
    it('should getProposalById', async () => {
      const proposalDbId = await Models.Proposal.getEntityId({
        transactionHash: rawProposal.transactionHash,
        pluginAddress: rawProposal.pluginAddress,
        proposalIndex: rawProposal.proposalIndex,
      })

      const proposal = await ProposalController.getProposalById(proposalDbId)
      expect(proposal.id).to.eq(proposalDbId)
    })

    it('should fail to getProposalById', async () => {
      sandbox.stub(Models.Proposal, 'findByEntityId').resolves(null)
      const proposalId = 'test-member'
      await expect(ProposalController.getProposalById(proposalId)).to.be.rejectedWith(ErrorKeyEnum.notFound)
    })
  })
})
