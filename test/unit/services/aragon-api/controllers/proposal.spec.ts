import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import ProposalController from '@services/aragon-api/controllers/proposal'
import { NetworksEnum } from '@types'
import { Models } from '@dbModels'
import Proposal from '@models/schema/proposal'

describe('Controller: Proposal', () => {
  let sandbox: SinonSandbox
  let rawProposal: Partial<Proposal>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawProposal = {
      transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
      blockNumber: 3,
      network: NetworksEnum.ethereumMainnet,
      daoAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      pluginAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5409',
      title: 'Fractal batch payment',
      description: 'test desc',
      summary: 'Batch payment was initiated via Fractal platform, please approve',
      proposalId: 0,
      allowFailureMap: 0,
      creatorAddress: '0x17366cae2b9c6c3055e9e3c78936a69006be5400',
      startDate: 234234223,
      endDate: 334234223,
      metadataUri: 'some-uri',
      actions: [],
      voteEvents: [],
      executed: {
        status: true,
        transactionHash: '0xBaDCAFebab823C9A60A84009702Fa4b25d6F1969',
        blockNumber: 3,
      },
    }
    await Models.Proposal.create(rawProposal)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getProposalsWithPagination', () => {
    it('should get proposals with pagination - all params', async () => {
      const paginationParams = {
        search: '',
        endDate: '',
        startDate: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        network: rawProposal.daos?.[0].network,
        daoAddress: rawProposal.daos?.[0].daoAddress,
        pluginAddress: rawProposal.daos?.[0].pluginAddress,
        creatorAddress: rawProposal.daos?.[0].creatorAddress,
      }

      const spyReq = sandbox.spy(Models.Proposal, 'findWithPagination')

      const response = await ProposalController.getProposalsWithPagination(paginationParams, filterParams)

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: filterParams,
          paginationParams: {
            search: '',
            endDate: '',
            startDate: '',
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
        endDate: '',
        startDate: '',
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
            endDate: '',
            startDate: '',
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
  })
})
