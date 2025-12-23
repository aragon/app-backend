import TransactionController from '@api/controllers/transaction'
import TransactionRouter from '@api/routers/v1/transaction'
import { ITransactionIndexCheckType, NetworksEnum } from '@types'
import { expect } from 'chai'
import * as sinon from 'sinon'
import { SinonSandbox } from 'sinon'

describe('RouterV1: Transaction', () => {
  let sandbox: SinonSandbox

  beforeEach(async () => {
    sandbox = sinon.createSandbox()
  })

  afterEach(() => {
    sandbox?.restore()
  })

  describe('getWithPagination', async () => {
    it('Should get transaction with pagination - all params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
        sort: 'createdAt',
      }

      const stubCtrl = sandbox.stub(TransactionController, 'getTransactionsWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await TransactionRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
      }
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({
        network: filterParams.network,
        daoAddress: undefined,
        fromAddress: undefined,
        toAddress: undefined,
        tokenAddress: undefined,
      })
    })

    it('Should get transaction with pagination - daoId', async () => {
      const filterParams = {
        daoId: 'ethereum-mainnet-0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
      }
      const paginationParams = {
        pageSize: 10,
        page: 1,
        order: 'asc',
      }

      const stubCtrl = sandbox.stub(TransactionController, 'getTransactionsWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await TransactionRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
        sort: 'blockNumber',
      }

      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({
        network: undefined,
        daoAddress: undefined,
        fromAddress: undefined,
        toAddress: undefined,
        tokenAddress: undefined,
      })
      expect(stubCtrl.args[0][2]).to.deep.eq(filterParams)
    })

    it('Should get transaction with pagination - missing pagination params', async () => {
      const filterParams = {
        network: NetworksEnum.ethereumMainnet,
      }
      const paginationParams = {
        sort: 'createdAt',
      }

      const stubCtrl = sandbox.stub(TransactionController, 'getTransactionsWithPagination').returns(true as any)

      const ctx: any = {
        query: { ...filterParams, ...paginationParams },
      }

      await TransactionRouter.getWithPagination(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      const missingParams = {
        endDateProp: undefined,
        startDateProp: undefined,
        endDate: undefined,
        startDate: undefined,
        search: undefined,
        order: 'desc',
        page: 1,
        pageSize: 10,
      }
      expect(stubCtrl.args[0][0]).to.deep.eq({ ...paginationParams, ...missingParams })
      expect(stubCtrl.args[0][1]).to.deep.eq({
        ...filterParams,
        ...{
          fromAddress: undefined,
          toAddress: undefined,
          tokenAddress: undefined,
          daoAddress: undefined,
        },
      })
    })
  })

  describe('getTransactionIndexingStatus', async () => {
    it('Should get transaction indexing status', async () => {
      const stubCtrl = sandbox.stub(TransactionController, 'getTransactionIndexingStatus').returns(true as any)

      const ctx: any = {
        params: {
          txHash: '0x0eB63a3565942D16C1c1211bD78F1B3Dcfe1A254',
          network: NetworksEnum.ethereumMainnet,
        },
        query: {
          type: ITransactionIndexCheckType.PROPOSAL_CREATE,
        },
      }

      await TransactionRouter.getTransactionIndexingStatus(ctx)

      expect(ctx.body).to.eq(true)
      expect(stubCtrl.calledOnce).to.be.true

      expect(stubCtrl.args[0][0]).to.eq(ctx.params.txHash)
      expect(stubCtrl.args[0][1]).to.eq(ctx.query.type)
      expect(stubCtrl.args[0][2]).to.eq(ctx.params.network)
    })
  })
})
