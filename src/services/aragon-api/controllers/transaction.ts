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
import { assert } from '@errors'
import logger from '@logger'

const llo = logger.logMeta.bind(null, { service: 'TransactionController' })

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
    const response: any = { isProcessed: false }

    try {
      const model = IndexCheckTypeToModel[action]
      assert(!!model, 'action is required')

      const queryToCheck = TransactionController._getQueryForAction(action, txHash, network)
      const data = await Models[model].findOne(queryToCheck)
      response.isProcessed = Boolean(data)

      if (data && action === ITransactionIndexCheckType.PROPOSAL_CREATE) {
        const pluginSlug = await Models.PluginSlug.findOne({
          pluginAddress: data.pluginAddress,
          network: data.network,
        })
        if (!pluginSlug) {
          logger.error('PluginSlug not found', llo({ pluginAddress: data.pluginAddress, network: data.network }))
        }
        response.slug = `${pluginSlug.slug}-${data.incrementalId}`
      }
      return response
    } catch (error) {
      return response
    }
  },

  _getQueryForAction(action: ITransactionIndexCheckType, txHash: string, network: NetworksEnum): Record<string, any> {
    switch (action) {
      case ITransactionIndexCheckType.PROPOSAL_CREATE:
        return { transactionHash: txHash, network }
      case ITransactionIndexCheckType.PROPOSAL_EXECUTE:
        return { 'executed.transactionHash': txHash, network }
      case ITransactionIndexCheckType.PROPOSAL_ADVANCE_STAGE:
        return { 'stageExecutions.transactionHash': txHash, network }
      default:
        return { transactionHash: txHash, network }
    }
  },
}

export default TransactionController
