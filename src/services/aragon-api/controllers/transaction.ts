import { Models } from '@dbModels'
import {
  IndexCheckTypeToModel,
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
  type ITransactionExtraParams,
  ITransactionIndexCheckType,
  type ITransactionResponse,
  type NetworksEnum,
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

  getTransactionIndexingStatus: async (
    txHash: string,
    action: ITransactionIndexCheckType,
    network: NetworksEnum,
  ): Promise<{ isProcessed: boolean }> => {
    const response = { isProcessed: false }

    try {
      const model = IndexCheckTypeToModel[action]
      let queryToCheck: any
      switch (action) {
        case ITransactionIndexCheckType.PROPOSAL_EXECUTE:
          queryToCheck = {
            'executed.transactionHash': txHash,
            network,
          }
          break
        case ITransactionIndexCheckType.PROPOSAL_ADVANCE_STAGE:
          queryToCheck = {
            'stageExecutions.transactionHash': txHash,
            network,
          }
          break
        default:
          queryToCheck = { transactionHash: txHash, network }
          break
      }

      response.isProcessed = !!(await Models[model].findOne(queryToCheck))
      return response
    } catch (error) {
      return response
    }
  },
}

export default TransactionController
