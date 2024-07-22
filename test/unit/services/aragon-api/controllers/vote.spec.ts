import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import VoteController from '@services/aragon-api/controllers/vote'
import { ITokenType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import Vote from '@models/schema/vote'
import PairDataModule from '@modules/pairData'

describe('Controller: Vote', () => {
  let sandbox: SinonSandbox
  let rawVote: Partial<Vote>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawVote = {
      network: NetworksEnum.ethereumSepolia,
      pluginAddress: '0x8B7AfAA4BD333dEE5fDbE0e3B6D89121e05d4D2F',
      proposalId: 3,
      memberAddress: '0x284803C34A3F049f787E2562e6F8C084bdBC3197',
      voteOption: 2,
      votingPower: '4000000000000000000',
      transactionHash: '0x2cfefef4716452284b5c3152d3cc112d1512c9c2faf5e67347d6d4d2c03bd22d',
      blockNumber: 4879275,
      daoAddress: '0xDb8a4b71D328F4B883Ea891a038519Afe07F3804',
      token: {
        network: NetworksEnum.ethereumSepolia,
        address: '0x3949F15155D4b85d0159aB79cbf38DC51c41DD9F',
        type: ITokenType.GovernanceERC20,
        logo: 'https://logos.covalenthq.com/tokens/11155111/0x3949f15155d4b85d0159ab79cbf38dc51c41dd9f.png',
        name: 'T5673',
        decimals: 18,
        symbol: 'T5673',
      },
    }

    await Models.Vote.create(rawVote)
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
        tokenAddress: rawVote.token?.address,
        proposalId: rawVote.proposalId,
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
      expect(response.data[0].memberAddress).to.eq(rawVote.memberAddress)
      expect(response.data[0].pluginAddress).to.eq(rawVote.pluginAddress)
      expect(response.data[0].daoAddress).to.eq(rawVote.daoAddress)
      expect(response.data[0].pluginAddress).to.eq(rawVote.pluginAddress)
      expect(response.data[0].voteOption).to.eq(rawVote.voteOption)
      expect(response.data[0].votingPower).to.eq(rawVote.votingPower)
      expect(response.data[0].token.type).to.eq(rawVote.token?.type)
      expect(response.data[0].token.address).to.eq(rawVote.token?.address)
      expect(response.data[0].token.decimals).to.eq(rawVote.token?.decimals)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get vote no params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}

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
      expect(response.data[0].memberAddress).to.eq(rawVote.memberAddress)
      expect(response.data[0].pluginAddress).to.eq(rawVote.pluginAddress)
      expect(response.data[0].daoAddress).to.eq(rawVote.daoAddress)
      expect(response.data[0].pluginAddress).to.eq(rawVote.pluginAddress)
      expect(response.data[0].voteOption).to.eq(rawVote.voteOption)
      expect(response.data[0].votingPower).to.eq(rawVote.votingPower)
      expect(response.data[0].token.type).to.eq(rawVote.token?.type)
      expect(response.data[0].token.address).to.eq(rawVote.token?.address)
      expect(response.data[0].token.decimals).to.eq(rawVote.token?.decimals)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get vote with pagination - ens', async () => {
      const ens = 'test.eth'
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const pairParams: any = { ens }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({
        memberAddress: rawVote.memberAddress,
      })
      const spyReq = sandbox.spy(Models.Vote, 'findWithPagination')

      const response = await VoteController.getVoteWithPagination(paginationParams, {}, pairParams)

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
      expect(response.data[0].memberAddress).to.eq(rawVote.memberAddress)
      expect(response.data[0].pluginAddress).to.eq(rawVote.pluginAddress)
      expect(response.data[0].daoAddress).to.eq(rawVote.daoAddress)
      expect(response.data[0].pluginAddress).to.eq(rawVote.pluginAddress)
      expect(response.data[0].voteOption).to.eq(rawVote.voteOption)
      expect(response.data[0].votingPower).to.eq(rawVote.votingPower)
      expect(response.data[0].token.type).to.eq(rawVote.token?.type)
      expect(response.data[0].token.address).to.eq(rawVote.token?.address)
      expect(response.data[0].token.decimals).to.eq(rawVote.token?.decimals)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get delegate with pagination - daoId not found', async () => {
      const ens = 'test.eth'
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const pairParams: any = { ens }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({})

      const spyReq = sandbox.spy(Models.Vote, 'findWithPagination')

      const response = await VoteController.getVoteWithPagination(paginationParams, {}, pairParams)

      expect(spyReq.calledOnce).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
    })
  })
})
