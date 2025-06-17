import { Models } from '@dbModels'
import {
  ErrorKeyEnum,
  IndexCheckTypeToModel,
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
  type ITransactionExtraParams,
  ITransactionIndexCheckType,
  type ITransactionIndexingStatusResponse,
  type ITransactionResponse,
  type NetworksEnum,
} from '@types'
import type Transaction from '@models/schema/transaction'
import PairDataModule from '@modules/pairData'
import { assert } from '@errors'
import logger from '@logger'
import { type ExternalBodyResult } from '@models/schema/proposal'

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
  ): Promise<ITransactionIndexingStatusResponse> => {
    const response: ITransactionIndexingStatusResponse = { isProcessed: false }

    try {
      const model = IndexCheckTypeToModel[action]
      assert(!!model, 'action is required')

      const queryToCheck = TransactionController._getQueryForAction(action, txHash, network)
      const data = await Models[model].findOne(queryToCheck)
      response.isProcessed = Boolean(data)

      if (data && action === ITransactionIndexCheckType.PROPOSAL_CREATE) {
        let pluginAddress = data.pluginAddress
        const plugin = await Models.Plugin.findByAddress(pluginAddress, data.network)

        if (plugin.parentPlugin) {
          const parentProposal = await Models.Proposal.findOne({
            transactionHash: data.transactionHash,
            network: data.network,
            pluginAddress: plugin.parentPlugin,
          })

          if (!parentProposal) {
            response.isProcessed = false
            return response
          }

          pluginAddress = plugin.parentPlugin
        }

        const pluginSlug = await Models.PluginSlug.findOne({
          pluginAddress,
          network: data.network,
        })
        if (!pluginSlug) {
          logger.error('PluginSlug not found', llo({ pluginAddress, network: data.network }))
        } else {
          response.slug = `${pluginSlug.slug}-${data.incrementalId}`
        }
      } else if (data && action === ITransactionIndexCheckType.PROPOSAL_REPORT_RESULTS) {
        const result: ExternalBodyResult = data.results.find(
          (result: ExternalBodyResult) => result.transactionHash === txHash,
        )
        assert(!!result, ErrorKeyEnum.unknownError)
        response.stage = result.stage
        response.resultType = result.resultType
      } else if (data && action === ITransactionIndexCheckType.PLUGIN_CREATE) {
        response.isSupported = data.isSupported
        response.interfaceType = data.interfaceType
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
      case ITransactionIndexCheckType.PROPOSAL_REPORT_RESULTS:
        return { 'results.transactionHash': txHash, network }
      case ITransactionIndexCheckType.LOCK_CREATE:
        return { transactionHash: txHash, network }
      case ITransactionIndexCheckType.EXIT_CREATE:
        return { 'lockExit.transactionHash': txHash, network, 'lockExit.status': true }
      case ITransactionIndexCheckType.WITHDRAW_CREATE:
        return { 'lockWithdraw.transactionHash': txHash, network, 'lockWithdraw.status': true }
      case ITransactionIndexCheckType.PLUGIN_CREATE:
        return { transactionHash: txHash, network }
      default:
        return { transactionHash: txHash, network }
    }
  },
}

export default TransactionController
