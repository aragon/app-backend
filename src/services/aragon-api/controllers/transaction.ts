import { Models } from '@dbModels'
import {
  type IPaginatedResult,
  type IPaginationParams,
  type ITransactionExtraParams,
  type ITransactionResponse,
} from '@types'
import ModelUtils from '@models/utils/models'

const TransactionController = {
  getTransactionsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: ITransactionExtraParams = {},
    daoId?: string,
  ): Promise<IPaginatedResult<ITransactionResponse>> => {
    if (daoId) {
      const daoDb = await Models.Dao.findByEntityId(daoId)
      if (!daoDb) {
        return ModelUtils.paginateEmptyResponse(paginationParams.pageSize!)
      }
      extraParams.daoAddress = daoDb.address
      extraParams.network = daoDb.network
    }
    return await Models.Transaction.findWithPagination({ extraParams, paginationParams })
  },
}

export default TransactionController
