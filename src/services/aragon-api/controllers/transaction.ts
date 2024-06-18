import { Models } from '@dbModels'
import {
  type IPaginatedResult,
  type IPaginationParams,
  type ITransactionExtraParams,
  type ITransactionResponse,
} from '@types'

const TransactionController = {
  getTransactionsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: ITransactionExtraParams = {},
  ): Promise<IPaginatedResult<ITransactionResponse>> => {
    return await Models.Transaction.findWithPagination({ extraParams, paginationParams })
  },
}

export default TransactionController
