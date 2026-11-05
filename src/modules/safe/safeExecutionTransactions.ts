import { SafeExecutionEvents, SafeExecutionEventsLegacy } from '@artifacts/Safe'
import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import type SafeTransaction from '@models/schema/safeTransaction'
import type Transaction from '@models/schema/transaction'
import DbTx from '@modules/dbTx'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import {
  type HexAddress,
  type ILogInfo,
  ISafeTransactionState,
  ITransactionSide,
  ITransactionType,
  type NetworksEnum,
} from '@types'
import { getAddress, Interface, type Log } from 'ethers'
import type { ClientSession } from 'mongoose'

type Execution = Pick<
  Transaction,
  | 'network'
  | 'transactionHash'
  | 'daoAddress'
  | 'fromAddress'
  | 'blockNumber'
  | 'transactionIndex'
  | 'logIndex'
  | 'safeTxHash'
  | 'isSuccessful'
> & { blockTimestamp?: number }

type WriteResult = { inserted: boolean; enriched: boolean }
const llo = logger.logMeta.bind(null, { service: 'module:SafeExecutionTransactions' })

const SafeExecutionTransactionsModule = {
  _interface: new Interface(SafeExecutionEvents.abi),
  _legacyInterface: new Interface(SafeExecutionEventsLegacy.abi),

  async record(info: ILogInfo, safeTxHash: string, isSuccessful: boolean, blockTimestamp: number): Promise<void> {
    const safeAddress = getAddress(info.address) as HexAddress
    const receipt = await SafeExecutionTransactionsModule._receipt(info.transactionHash, info.network, info.context)
    const row = await Models.SafeTransaction.findOne({ network: info.network, safeAddress, safeTxHash })

    await SafeExecutionTransactionsModule._write(
      {
        network: info.network,
        transactionHash: info.transactionHash,
        daoAddress: safeAddress,
        fromAddress: getAddress(receipt.from) as HexAddress,
        blockNumber: info.blockNumber,
        transactionIndex: info.transactionIndex,
        logIndex: info.logIndex,
        blockTimestamp,
        safeTxHash,
        isSuccessful,
      },
      row,
    )
  },

  async sync(network: NetworksEnum, safeAddress: HexAddress, safeTxHashes: string[]): Promise<void> {
    if (!safeTxHashes.length || !(await SafeBodyMembersModule.isTrackedOrRegistered(safeAddress, network))) return

    const rows = await Models.SafeTransaction.find({
      network,
      safeAddress,
      safeTxHash: { $in: safeTxHashes },
      state: ISafeTransactionState.executed,
    })
    for (const row of rows) {
      try {
        const existing = await Models.Transaction.findOne({
          network,
          daoAddress: safeAddress,
          safeTxHash: row.safeTxHash,
          type: ITransactionType.execution,
        })
        if (existing?.source === 'safe') continue
        if (existing) {
          await SafeExecutionTransactionsModule.enrich(existing.id, row)
        } else if (row.transactionHash) {
          await SafeExecutionTransactionsModule.backfill(row)
        }
      } catch (error) {
        logger.warn('Unable to sync Safe execution', llo({ network, safeAddress, safeTxHash: row.safeTxHash, error }))
      }
    }
  },

  async backfill(row: SafeTransaction, context?: ILogInfo['context']): Promise<WriteResult> {
    if (!row.transactionHash) throw new Error('Executed Safe transaction has no transaction hash')
    const receipt = await SafeExecutionTransactionsModule._receipt(
      row.transactionHash as HexAddress,
      row.network,
      context,
    )
    const matches: Array<{ log: Log; isSuccessful: boolean }> = []
    const successTopic = SafeExecutionTransactionsModule._interface.getEvent('ExecutionSuccess')!.topicHash
    const failureTopic = SafeExecutionTransactionsModule._interface.getEvent('ExecutionFailure')!.topicHash
    for (const log of receipt.logs) {
      if (getAddress(log.address) !== row.safeAddress) continue
      if (log.topics[0] !== successTopic && log.topics[0] !== failureTopic) continue
      const abi =
        log.topics.length === 1
          ? SafeExecutionTransactionsModule._legacyInterface
          : SafeExecutionTransactionsModule._interface
      const event = abi.parseLog(log)
      if (event?.args.txHash === row.safeTxHash) {
        matches.push({ log, isSuccessful: event.name === 'ExecutionSuccess' })
      }
    }
    if (matches.length !== 1) throw new Error('Safe execution receipt must contain one matching event')

    const { log, isSuccessful } = matches[0]
    const executionDate = Date.parse(row.executionDate ?? '')
    const blockTimestamp = Number.isFinite(executionDate)
      ? Math.floor(executionDate / 1000)
      : await Web3Helper.getBlockTimestamp(log.blockNumber, row.network)
    if (!blockTimestamp) throw new Error('Safe execution block timestamp not found')
    return await SafeExecutionTransactionsModule._write(
      {
        network: row.network,
        transactionHash: log.transactionHash as HexAddress,
        daoAddress: row.safeAddress,
        fromAddress: getAddress(receipt.from) as HexAddress,
        blockNumber: log.blockNumber,
        transactionIndex: log.transactionIndex,
        logIndex: log.index,
        blockTimestamp,
        safeTxHash: row.safeTxHash,
        isSuccessful,
      },
      row,
    )
  },

  async _receipt(transactionHash: HexAddress, network: NetworksEnum, context?: ILogInfo['context']) {
    const fetch = async () => {
      const receipt = await Web3Helper.getTransactionReceipt(transactionHash, network)
      if (!receipt) throw new Error('Safe execution receipt not found')
      return receipt
    }
    return context ? context.getOrFetch(`receipt:${transactionHash}`, fetch) : fetch()
  },

  async _write(execution: Execution, row: SafeTransaction | null, retryDuplicate = true): Promise<WriteResult> {
    const id = Models.Transaction.getEntityId({
      transactionHash: execution.transactionHash,
      network: execution.network,
      daoAddress: execution.daoAddress,
      type: ITransactionType.execution,
      transactionIndex: execution.transactionIndex ?? undefined,
      logIndex: execution.logIndex ?? undefined,
    })
    const committed = await DbTx.executeTxFn(async ({ session }) => {
      const result = await Models.Transaction.updateOne(
        {
          network: execution.network,
          daoAddress: execution.daoAddress,
          type: ITransactionType.execution,
          $or: [{ safeTxHash: execution.safeTxHash }, { id }],
        },
        {
          $set: { ...execution, id },
          $setOnInsert: {
            toAddress: execution.daoAddress,
            side: ITransactionSide.execution,
            type: ITransactionType.execution,
            value: '0',
            amountUsd: '0',
            source: null,
            actionCount: null,
            rawActions: [],
            actions: [],
          },
        },
        { upsert: true, session },
      )
      const enriched = await SafeExecutionTransactionsModule.enrich(id, row, session)
      await session.commitTransaction()
      return { inserted: result.upsertedCount === 1, enriched }
    })

    if (typeof committed?.inserted === 'boolean') return committed
    if (!committed) {
      if (retryDuplicate) return SafeExecutionTransactionsModule._write(execution, row, false)
      throw new Error('Safe execution summary insert could not be confirmed')
    }
    return { inserted: false, enriched: await SafeExecutionTransactionsModule.enrich(id, row) }
  },

  async enrich(id: string, row: SafeTransaction | null, session?: ClientSession): Promise<boolean> {
    if (!session) {
      return await DbTx.executeTxFn(async ({ session }) => {
        const enriched = await SafeExecutionTransactionsModule.enrich(id, row, session)
        await session.commitTransaction()
        return enriched
      })
    }
    if (row?.decoding !== false && row) {
      row = await Models.SafeTransaction.findOne({ id: row.id }).session(session)
    }
    if (row?.decoding !== false) return false
    const result = await Models.Transaction.updateOne(
      { id },
      {
        $set: {
          source: 'safe',
          actionCount: row.rawActions.length,
          rawActions: row.rawActions,
          actions: row.actions,
        },
      },
      { session },
    )
    return result.matchedCount === 1
  },
}

export default SafeExecutionTransactionsModule
