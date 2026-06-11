import ProposalController from '@api/controllers/proposal'
import { Models } from '@dbModels'
import { assert, assertExposable } from '@errors'
import utils from '@helpers/utils'
import logger from '@logger'
import { type ExternalBodyResult } from '@models/schema/proposal'
import type Transaction from '@models/schema/transaction'
import PairDataModule from '@modules/pairData'
import { ITransactionType } from '@src/types/transfer'
import {
  ErrorKeyEnum,
  type IExecutionActionsParams,
  type IExecutionActionsResponse,
  IndexCheckTypeToModel,
  type IPaginatedResult,
  type IPaginationParams,
  type IPairParams,
  IPluginInterfaceType,
  type ITransactionExtraParams,
  ITransactionIndexCheckType,
  type ITransactionIndexingStatusResponse,
  type ITransactionResponse,
  type NetworksEnum,
} from '@types'

const llo = logger.logMeta.bind(null, { service: 'TransactionController' })

const TransactionController = {
  getTransactionsWithPagination: async (
    paginationParams: IPaginationParams = {},
    extraParams: ITransactionExtraParams = {},
    pairParams: IPairParams = {},
  ): Promise<IPaginatedResult<ITransactionResponse>> => {
    paginationParams = await PairDataModule.pairFromPaginationParams(paginationParams)
    extraParams = await PairDataModule.pairFromExtraParams(extraParams, pairParams)

    const hasOnlyDaoAndNetwork =
      extraParams.daoAddress &&
      extraParams.network &&
      !extraParams.tokenAddress &&
      !extraParams.fromAddress &&
      !extraParams.toAddress &&
      !extraParams.side &&
      !extraParams.type

    if (hasOnlyDaoAndNetwork) {
      const dao = await Models.Dao.findByAddress(extraParams.daoAddress, extraParams.network)
      if (dao?.linkedAccounts?.length && !extraParams.onlyParent) {
        extraParams.daoAddresses = [extraParams.daoAddress, ...dao.linkedAccounts]
      }
    }

    const result = await Models.Transaction.findWithPagination({ extraParams, paginationParams })
    result.data = result.data.map((m: Transaction) => m.filterKeys())

    return result
  },

  getExecutionActions: async ({ id, network }: IExecutionActionsParams): Promise<IExecutionActionsResponse> => {
    const execution = await Models.Transaction.findOne({ id, network, type: ITransactionType.execution })
    assertExposable(execution, ErrorKeyEnum.notFound)

    const base = {
      source: execution.source ?? null,
      actionCount: execution.actionCount ?? null,
      executedBy: execution.fromAddress,
      transactionHash: execution.transactionHash,
      blockTimestamp: execution.blockTimestamp ?? null,
    }

    if (execution.pluginAddress) {
      const proposal = await Models.Proposal.findByProposalIndex(
        execution.proposalIndex,
        execution.pluginAddress,
        network,
      )
      if (proposal) {
        const pluginSlug = await Models.PluginSlug.findPluginSlug(proposal.pluginAddress, proposal.daoAddress, network)
        const proposalSlug = pluginSlug ? utils.buildSlug(pluginSlug.slug, proposal.incrementalId) : null
        return { ...base, proposalSlug, rawActions: [], ...ProposalController.decodedActions(proposal) }
      }
    }

    return {
      ...base,
      proposalSlug: null,
      decoding: execution.source == null,
      actions: execution.actions ?? [],
      rawActions: execution.rawActions ?? [],
    }
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
      const data = await Models[model].findOne(queryToCheck, null).sort({ createdAt: -1, logIndex: -1 })

      response.isProcessed = Boolean(data)

      if (data && action === ITransactionIndexCheckType.DAO_CREATE) {
        const adminPlugin = await Models.Plugin.findOne({
          interfaceType: IPluginInterfaceType.admin,
          daoAddress: data.address,
          network: data.network,
        })

        if (!adminPlugin) {
          response.isProcessed = false
          return response
        }

        const anyAdminMemberExists = await Models.PluginMember.exists({
          daoAddress: data.address,
          network: data.network,
          pluginAddress: adminPlugin.address,
        })

        if (!anyAdminMemberExists) {
          response.isProcessed = false
        }
      } else if (data && action === ITransactionIndexCheckType.PROPOSAL_CREATE) {
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
          const slugPlugin = plugin.parentPlugin
            ? await Models.Plugin.findByAddress(pluginAddress, data.network)
            : plugin
          const isUninstalled = slugPlugin?.uninstalled?.status === true
          if (!isUninstalled) {
            logger.error('PluginSlug not found', llo({ pluginAddress, network: data.network }))
          }
        } else {
          response.slug = utils.buildSlug(pluginSlug.slug, data.incrementalId)
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
    } catch (_error) {
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
