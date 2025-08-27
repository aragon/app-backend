import Router, { type RouterContext } from '@koa/router'
import ValidationSchema, { RequireRules } from '@helpers/validationSchema'
import TransactionSchema from '@api/routers/schema/transaction'
import TransactionController from '@api/controllers/transaction'
import {
  type HexAddress,
  type IPaginationParams,
  type IPairParams,
  type ITransactionCategory,
  type ITransactionExtraParams,
  type ITransactionIndexCheckType,
  type NetworksEnum,
} from '@types'
import PaginationSchema from '@api/routers/schema/pagination'

const TransactionRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      paginationSort: 'blockNumber',
      extraParams: {
        network: ctx.query.network as NetworksEnum,
        daoAddress: ctx.query.address as HexAddress,
        tokenAddress: ctx.query.tokenAddress as HexAddress,
        category: ctx.query.category as ITransactionCategory,
        fromAddress: ctx.query.fromAddress as HexAddress,
        toAddress: ctx.query.toAddress as HexAddress,
      },
      pairParams: {
        daoId: ctx.query.daoId as string,
      },
      skipParams: ['address'],
      requireRule: RequireRules.daoIdOrNetworkWithAddress(['daoAddress', 'tokenAddress', 'fromAddress', 'toAddress']),
      schemas: {
        extra: TransactionSchema.getExtraParams,
        pair: PaginationSchema.getPairParams,
      },
    })

    ctx.body = await TransactionController.getTransactionsWithPagination(
      result.paginationParams as IPaginationParams,
      result.extraParams as ITransactionExtraParams,
      result.pairParams as IPairParams,
    )
  },

  getTransactionIndexingStatus: async function (ctx: RouterContext) {
    const result = await ValidationSchema.validateRoute(ctx, {
      params: {
        transactionHash: ctx.params.txHash,
        network: ctx.params.network,
        type: ctx.query.type as ITransactionIndexCheckType,
      },
      schemas: {
        params: TransactionSchema.getTransactionIndexingStatus,
      },
    })

    ctx.body = await TransactionController.getTransactionIndexingStatus(
      result.params.transactionHash,
      result.params.type,
      result.params.network,
    )
  },

  router(): Router {
    const router = new Router()

    /**
     * @api {get} /:network/:txHash/status Get Transaction Indexing Status
     * @apiName TransactionIndexingStatus
     * @apiGroup Transactions
     * @apiDescription Get Transaction Indexing Status
     * @apiParam {String} Network
     * @apiParam {String} txHash Transaction Hash
     * @queryParam {String} [type] Transaction Type
     */
    router.get('/:network/:txHash/status', TransactionRouter.getTransactionIndexingStatus)

    /**
     * @api {get} / Get Transactions
     * @apiName Transactions
     * @apiGroup Transactions
     * @apiDescription Get Transactions
     *
     * @apiSampleRequest /
     *
     */
    router.get('/', TransactionRouter.getWithPagination)

    return router
  },
}

export default TransactionRouter
