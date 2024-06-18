import Router, { type RouterContext } from '@koa/router'
import ValidationSchema from '@helpers/validationSchema'
import ModelUtils from '@models/utils/models'
import TransactionSchema from '@api/routers/schema/transaction'
import TransactionController from '@api/controllers/transaction'
import { type HexAddress, type ITransactionCategory, type ITransactionExtraParams, type NetworksEnum } from '@types'

const TransactionRouter = {
  getWithPagination: async function (ctx: RouterContext) {
    const paginationParams = ModelUtils.parsePaginationParams(ctx, { defaultSort: 'blockNumber' })
    const extraParams: ITransactionExtraParams = {
      network: ctx.query.network as NetworksEnum,
      daoAddress: ctx.query.daoAddress as HexAddress,
      category: ctx.query.category as ITransactionCategory,
    }

    await ValidationSchema.validateParams(TransactionSchema.getWithPagination, {
      ...paginationParams,
      ...extraParams,
    })

    ctx.body = await TransactionController.getTransactionsWithPagination(paginationParams, extraParams)
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
