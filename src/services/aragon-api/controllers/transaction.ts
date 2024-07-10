import { Models } from '@dbModels'
import {
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
  type ITransactionExtraParams,
  type ITransactionResponse,
} from '@types'
import type Transaction from '@models/schema/transaction'
import PairDataModule from '@modules/pairData'

const TransactionController = {
  getTransactionsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: ITransactionExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<ITransactionResponse>> => {
    paginationParams = await PairDataModule.pairFromPaginationParams(paginationParams)
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)
    const result = await Models.Transaction.findWithPagination({ extraParams, paginationParams })
    result.data = result.data.map((m: Transaction) => m.filterKeys())

    return result
  },
}

export default TransactionController
