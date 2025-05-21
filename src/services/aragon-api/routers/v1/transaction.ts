import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import TransactionSchema from '@api/routers/schema/transaction'
import TransactionController from '@api/controllers/transaction'
import {
  type HexAddress,
  type IPairParams,
  type ITransactionCategory,
  type ITransactionExtraParams,
  type ITransactionIndexCheckType,
  type NetworksEnum,
} from '@types'
import PaginationSchema from '@api/routers/schema/pagination'
import Utils from '@helpers/utils'

const TransactionRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'blockNumber' })
    const extraParams: ITransactionExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.address as HexAddress,
      tokenAddress: ctx.query.tokenAddress as HexAddress,
      category: ctx.query.category as ITransactionCategory,
      fromAddress: ctx.query.fromAddress as HexAddress,
      toAddress: ctx.query.toAddress as HexAddress,
    }
    const pairParams: IPairParams = {
      daoId: ctx.query.daoId as string,
    }
    const anyInvalidParams = Utils.extractAdditionalParams(
      { ...paginationParams, ...extraParams, ...pairParams },
      ctx.query,
      ['address'],
    )

    const [formattedPaginationParams, formattedExtraParams, formattedPairParams] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(TransactionSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(PaginationSchema.getPairParams, pairParams),
      ValidationSchema.validateParams(PaginationSchema.getNotAllowedParams, anyInvalidParams),
    ])

    ctx.body = await TransactionController.getTransactionsWithPagination(
      formattedPaginationParams,
      formattedExtraParams,
      formattedPairParams,
    )
  },
  getTransactionIndexingStatus: async function (ctx: RouterContext) {
    const params = {
      transactionHash: ctx.params.txHash,
      network: ctx.params.network,
      type: ctx.query.type as ITransactionIndexCheckType,
    }

    const formattedParams = await ValidationSchema.validateParams(
      TransactionSchema.getTransactionIndexingStatus,
      params,
    )

    ctx.body = await TransactionController.getTransactionIndexingStatus(
      formattedParams.transactionHash,
      formattedParams.type,
      formattedParams.network,
    )
  },

  router() {
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
