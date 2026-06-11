import { Models } from '@dbModels'
import DecodeActions from '@helpers/decodeAction'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import Transaction from '@models/schema/transaction'
import {
  EnumQueueName,
  type HexAddress,
  type ILogInfo,
  IPluginInterfaceType,
  type IRawAction,
  ITransactionSide,
  ITransactionType,
  type NetworksEnum,
  ProposalActionType,
} from '@types'
import { getAddress, type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'handlers:DaoExecutionHandler' })

const EXECUTION_DECODE_DELAY_MS = 2_000

export const DaoExecutionHandler = {
  /**
   * DAO `Executed` event — the on-chain execution itself. Records one `execution`
   * Transaction row per event. The event topic is network-wide, so only known DAOs are indexed.
   */
  executedEvent: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const dao = await Models.Dao.findByAddress(info.address, info.network)
    if (!dao) return

    await DaoExecutionHandler.saveExecutionTransaction(parsedEvent, info)
  },

  saveExecutionTransaction: async (parsedEvent: LogDescription, info: ILogInfo) => {
    const daoAddress = info.address
    const rawActor = parsedEvent.args?.actor ?? parsedEvent.args?.[0]
    let actor: HexAddress
    try {
      actor = getAddress(rawActor)
    } catch {
      actor = rawActor
    }

    const existing = await Models.Transaction.findExistingLog({
      transactionHash: info.transactionHash,
      network: info.network,
      daoAddress,
      type: ITransactionType.execution,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
    })
    if (existing) {
      logger.verbose('Execution transaction already exists', llo({ id: existing.id, txHash: info.transactionHash }))
      return
    }

    const blockTimestamp = info.context
      ? await info.context.getBlockTimestamp(info.blockNumber)
      : await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)

    const callIdIndex = DaoExecutionHandler.callIdToProposalIndex(parsedEvent)
    const isPluginExecution = !!callIdIndex && callIdIndex !== '0'
    const rawActions = DaoExecutionHandler.extractEventActions(parsedEvent)

    const execution = await DaoExecutionHandler.createExecutionTransaction({
      transactionHash: info.transactionHash,
      blockNumber: info.blockNumber,
      transactionIndex: info.transactionIndex,
      logIndex: info.logIndex,
      blockTimestamp,
      network: info.network,
      fromAddress: actor,
      toAddress: daoAddress,
      daoAddress,
      pluginAddress: isPluginExecution ? actor : undefined,
      proposalIndex: isPluginExecution ? callIdIndex : null,
      actionCount: rawActions.length,
      rawActions,
    })

    await RabbitMQHelper.sendDelayedMessage(
      EnumQueueName.executionActions,
      { id: execution.id, params: { id: execution.id } },
      EXECUTION_DECODE_DELAY_MS,
    )
  },

  /**
   * Async worker (executionActions queue). The execution was already classified at write time
   * (a plugin execution carries `proposalIndex`; a direct one does not). This only finalizes the
   * row off the crawl hot path: resolve `source` for both, and for a direct execution decode and
   * store its actions — a plugin execution's actions are served by reading through to the proposal.
   * A plugin-classified row with no backing proposal (custom callId) gets its actions decoded too.
   */
  decodeExecutionTransaction: async (id: string) => {
    const execution = await Models.Transaction.findByEntityId(id)
    if (!execution || execution.type !== ITransactionType.execution) {
      return
    }

    const { fromAddress: actor, daoAddress, network } = execution
    const source = await DaoExecutionHandler.resolveExecutionSource(actor, daoAddress, network)

    if (execution.pluginAddress) {
      const proposal = await Models.Proposal.findByProposalIndex(
        execution.proposalIndex!,
        execution.pluginAddress,
        network,
      )
      if (proposal) {
        await execution.update({ source })
        return
      }
    }

    const actions = await DaoExecutionHandler.decodeExecutionActions(execution.rawActions, {
      daoAddress,
      network,
      blockNumber: execution.blockNumber,
    })
    await execution.update({ source, actions })
  },

  extractEventActions: (parsedEvent: LogDescription): IRawAction[] => {
    const actions = parsedEvent.args?.[2]
    if (!Array.isArray(actions)) {
      return []
    }
    return actions.map((action: any) => ({
      to: action.to ?? action[0],
      value: (action.value ?? action[1])?.toString() ?? '0',
      data: action.data ?? action[2] ?? '0x',
    }))
  },

  decodeExecutionActions: async (
    rawActions: IRawAction[],
    context: { daoAddress: HexAddress; network: NetworksEnum; blockNumber: number; pluginAddress?: HexAddress },
  ) => {
    if (rawActions.length === 0) {
      return []
    }

    const decodeActions = new DecodeActions()

    return Promise.all(
      rawActions.map(async (action: IRawAction) => {
        try {
          const decoded =
            action.data?.length >= 10
              ? await decodeActions.decodeData(action, context)
              : await decodeActions.decodeTransfer(action, context)
          if (decoded) {
            return decoded
          }
        } catch (error) {
          logger.warn('Failed to decode execution action', llo({ error, to: action.to, network: context.network }))
        }
        return {
          from: context.daoAddress,
          to: action.to,
          data: action.data,
          value: action.value,
          type: ProposalActionType.Unknown,
          inputData: null,
        }
      }),
    )
  },

  createExecutionTransaction: async (data: Partial<Transaction>) => {
    return Models.Transaction.create({
      ...data,
      side: ITransactionSide.execution,
      type: ITransactionType.execution,
      value: '0',
    })
  },

  callIdToProposalIndex: (parsedEvent: LogDescription): string | null => {
    const callId = parsedEvent.args?.callId ?? parsedEvent.args?.[1]
    if (callId == null) {
      return null
    }
    try {
      return BigInt(callId).toString()
    } catch {
      return null
    }
  },

  resolveExecutionSource: async (actor: HexAddress, daoAddress: HexAddress, network: NetworksEnum): Promise<string> => {
    const pluginSlug = await Models.PluginSlug.findPluginSlug(actor, daoAddress, network)
    if (pluginSlug?.slug) {
      return pluginSlug.slug
    }
    const plugin = await Models.Plugin.findByAddress(actor, network)
    if (plugin?.interfaceType && plugin.interfaceType !== IPluginInterfaceType.unknown) {
      return plugin.interfaceType
    }

    const daoExisted = await Models.Dao.findByAddress(actor, network)
    if (daoExisted) {
      return daoExisted.name || actor
    }

    return actor
  },
}
