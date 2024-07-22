import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'
import { expect } from 'chai'
import TransactionController from '@services/aragon-api/controllers/transaction'
import { ITokenType, ITransactionCategory, ITransactionType, NetworksEnum } from '@types'
import { Models } from '@dbModels'
import Transaction from '@models/schema/transaction'
import PairDataModule from '@modules/pairData'

describe('Controller: Transaction', () => {
  let sandbox: SinonSandbox
  let rawTransaction: Partial<Transaction>

  beforeEach(async () => {
    sandbox = sinon.createSandbox()

    rawTransaction = {
      transactionHash: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      blockNumber: 1,
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
})
