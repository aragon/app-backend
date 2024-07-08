import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import TransactionSchema from '@api/routers/schema/transaction'
import TransactionController from '@api/controllers/transaction'
import { type HexAddress, type ITransactionCategory, type ITransactionExtraParams, type NetworksEnum } from '@types'
import PaginationSchema from '@api/routers/schema/pagination'

const TransactionRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'blockNumber' })
    const extraParams: ITransactionExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.address as HexAddress,
      category: ctx.query.category as ITransactionCategory,
    }
    const daoId = ctx.query.daoId as string

    const [formattedPaginationParams, formattedExtraParams, formattedDaoId] = await Promise.all([
      ValidationSchema.validateParams(PaginationSchema.getPagination, paginationParams),
      ValidationSchema.validateParams(TransactionSchema.getExtraParams, extraParams),
      ValidationSchema.validateParams(TransactionSchema.getDaoById, { id: daoId }),
    ])

    ctx.body = await TransactionController.getTransactionsWithPagination(
      formattedPaginationParams,
      formattedExtraParams,
      formattedDaoId.id,
    )
  },

  router() {
    const router = new Router()

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
