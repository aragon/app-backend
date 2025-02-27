import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import TransactionController from '@services/aragon-api/controllers/transaction'
import { ITokenType, ITransactionCategory, ITransactionIndexCheckType, ITransactionType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import Transaction from '@models/schema/transaction'
import PairDataModule from '@modules/pairData'
import { DaoList } from '@test/mock/fakeDao'
import { ProposalList } from '@test/mock/fakeProposal'

describe('Controller: Transaction', () => {
  let sandbox: SinonSandbox
  let rawTransaction: Partial<Transaction>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawTransaction = {
      transactionHash: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      blockNumber: 1,
      uniqueId: '0x123213',
      network: NetworksEnum.ethereumMainnet,
      type: ITransactionType.deposit,
      category: ITransactionCategory.Internal,
      fromAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc0',
      toAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc1',
      value: '0x0',
      tokenAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc9',
      daoAddress: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc8',
      tokenId: '1',
      erc721TokenId: '1',
      erc1155Metadata: [
        {
          tokenId: '1',
          value: '0',
        },
      ],
      proposalId: '18',
      token: {
        network: NetworksEnum.ethereumMainnet,
        address: '0x2902b792af43ea1481569bc35b62a31bb2c20e95',
        symbol: 'FREE',
        name: 'FREEthereum',
        type: ITokenType.ERC20,
        decimals: 18,
        logo: 'fake-logo',
        snapshot: {
          priceUsd: '0',
          priceUpdatedAt: 1,
        },
      },
    }
    await Models.Transaction.create(rawTransaction)
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getTransactionsWithPagination', () => {
    it('should get transactions with pagination - all params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {
        network: rawTransaction.daos?.[0].network,
        daoAddress: rawTransaction.daos?.[0].daoAddress,
        pluginAddress: rawTransaction.daos?.[0].pluginAddress,
      }

      const spyReq = sandbox.spy(Models.Transaction, 'findWithPagination')

      const response = await TransactionController.getTransactionsWithPagination(paginationParams, filterParams)

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
      expect(response.data[0].transactionHash).to.eq(rawTransaction.transactionHash)
      expect(response.data[0].category).to.eq(rawTransaction.category)
      expect(response.data[0].network).to.eq(rawTransaction.network)
      expect(response.data[0].token.type).to.eq(rawTransaction.token?.type)
      expect(response.data[0].token.address).to.eq(rawTransaction.token?.address)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get transactions no params', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}

      const spyReq = sandbox.spy(Models.Transaction, 'findWithPagination')

      const response = await TransactionController.getTransactionsWithPagination(paginationParams, filterParams)

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
      expect(response.data[0].transactionHash).to.eq(rawTransaction.transactionHash)
      expect(response.data[0].category).to.eq(rawTransaction.category)
      expect(response.data[0].network).to.eq(rawTransaction.network)
      expect(response.data[0].token.address).to.eq(rawTransaction.token?.address)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get transactions with pagination - daoId', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}
      const pairParams: any = {
        daoId: `${rawTransaction.network}-${rawTransaction.daoAddress}`,
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({
        daoAddress: rawTransaction.daoAddress,
        network: rawTransaction.network,
      })
      const spyReq = sandbox.spy(Models.Transaction, 'findWithPagination')

      const response = await TransactionController.getTransactionsWithPagination(
        paginationParams,
        filterParams,
        pairParams,
      )

      expect(spyReq.calledOnce).to.be.true
      expect(
        spyReq.calledWith({
          extraParams: {
            daoAddress: rawTransaction.daoAddress,
            network: rawTransaction.network,
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
      expect(response.data[0].transactionHash).to.eq(rawTransaction.transactionHash)
      expect(response.data[0].category).to.eq(rawTransaction.category)
      expect(response.data[0].network).to.eq(rawTransaction.network)
      expect(response.data[0].token.address).to.eq(rawTransaction.token?.address)
      expect(response.metadata.page).to.eq(1)
      expect(response.metadata.totalPages).to.eq(1)
      expect(response.metadata.totalRecords).to.eq(1)
    })

    it('should get transactions with pagination - daoId not found', async () => {
      const paginationParams = {
        search: '',
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const filterParams: any = {}
      const pairParams: any = {
        daoId: `${rawTransaction.network}-${rawTransaction.daoAddress}`,
      }
      sandbox.stub(PairDataModule, 'pairFromExtraParams').resolves({})
      const spyReq = sandbox.spy(Models.Transaction, 'findWithPagination')

      const response = await TransactionController.getTransactionsWithPagination(
        paginationParams,
        filterParams,
        pairParams,
      )

      expect(spyReq.calledOnce).to.be.true
      expect(response).to.have.property('data').with.lengthOf(1)
    })
  })

  describe('getTransactionIndexingStatus', () => {
    it('should get transaction indexing status', async () => {
      const fakeDao = DaoList[0]
      await Models.Dao.create(fakeDao)

      const txHash = fakeDao.transactionHash
      const network = fakeDao.network
      const spyReq = sandbox.spy(Models.Dao, 'findOne')
      const response = await TransactionController.getTransactionIndexingStatus(
        txHash!,
        ITransactionIndexCheckType.DAO_CREATE,
        network!,
      )
      expect(spyReq.calledOnce).to.be.true
      expect(response).to.deep.eq({
        isProcessed: true,
      })
    })

    it('should get transaction indexing status - proposal advance', async () => {
      await Models.Proposal.create({
        ...ProposalList[0],
        stageExecutions: [
          {
            transactionHash: '0x123',
          },
        ],
      })

      const network = ProposalList[0].network
      const spyReq = sandbox.spy(Models.Proposal, 'findOne')

      const response = await TransactionController.getTransactionIndexingStatus(
        '0x123',
        ITransactionIndexCheckType.PROPOSAL_ADVANCE_STAGE,
        network!,
      )
      expect(spyReq.calledOnce).to.be.true
      expect(response).to.deep.eq({
        isProcessed: true,
      })
    })

    it('should get transaction indexing status - proposal executed', async () => {
      await Models.Proposal.create({
        ...ProposalList[0],
        executed: {
          transactionHash: '0x123',
        },
      })

      const network = ProposalList[0].network
      const spyReq = sandbox.spy(Models.Proposal, 'findOne')

      const response = await TransactionController.getTransactionIndexingStatus(
        '0x123',
        ITransactionIndexCheckType.PROPOSAL_EXECUTE,
        network!,
      )
      expect(spyReq.calledOnce).to.be.true
      expect(response).to.deep.eq({
        isProcessed: true,
      })
    })

    it('should get transaction indexing status - not found', async () => {
      const txHash = '0x123'
      const network = rawTransaction.network
      const spyReq = sandbox.spy(Models.Proposal, 'findOne')

      const response = await TransactionController.getTransactionIndexingStatus(
        txHash,
        ITransactionIndexCheckType.PROPOSAL_CREATE,
        network!,
      )
      expect(spyReq.calledOnce).to.be.true
      expect(response).to.deep.eq({
        isProcessed: false,
      })
    })

    it('should return false when error', async () => {
      const txHash = '0x'
      const network = rawTransaction.network
      sandbox.stub(Models.Proposal, 'findOne').rejects(new Error('fake-error'))

      const response = await TransactionController.getTransactionIndexingStatus(
        txHash,
        ITransactionIndexCheckType.PROPOSAL_ADVANCE_STAGE,
        network!,
      )
      expect(response).to.deep.eq({
        isProcessed: false,
      })
    })
  })
})
