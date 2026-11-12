import { Models } from '@dbModels'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import SafeBodyMembersModule from '@modules/safe/safeBodyMembers'
import SafeDaoAssociationsModule from '@modules/safe/safeDaoAssociations'
import SafeExecutionTransactionsModule from '@modules/safe/safeExecutionTransactions'
import SafeTrackingModule from '@modules/safe/safeTracking'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import { type HexAddress, type ILogInfo } from '@types'
import { getAddress, type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'handlers:SafeExecutionHandler' })

/**
 * Executions of every Safe on the network arrive here, so the tracking gate runs first. The event
 * carries the `safeTxHash` the stored row is keyed by. An execution we hold no row for is synced
 * from the history at full depth, which is as far back as recovery reaches.
 */
const settle = async (parsedEvent: LogDescription, info: ILogInfo, succeeded: boolean) => {
  const safeAddress = getAddress(info.address) as HexAddress
  const safeTxHash = String(parsedEvent.args.txHash ?? parsedEvent.args[0])
  let pullOnFailure = false
  try {
    if (!(await SafeBodyMembersModule.isTrackedOrRegistered(safeAddress, info.network))) return
    pullOnFailure = true

    await Models.SafeCache.invalidateInfo(info.network, safeAddress)

    const blockTimestamp = info.context
      ? await info.context.getBlockTimestamp(info.blockNumber)
      : await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)

    const row = await SafeTransactionsModule.markExecuted(info.network, safeAddress, safeTxHash, {
      transactionHash: info.transactionHash,
      blockNumber: info.blockNumber,
      blockTimestamp: blockTimestamp || undefined,
      succeeded,
    })

    if (row) {
      logger.verbose('Safe transaction settled', llo({ ...info, safeTxHash, succeeded }))
    } else {
      await SafeDaoAssociationsModule.queueBackfill(info.network, safeAddress)
      pullOnFailure = false
    }

    await SafeTrackingModule.onExecution(info.network, safeAddress)

    if (!blockTimestamp) throw new Error('Safe execution block timestamp not found')
    await SafeExecutionTransactionsModule.record(info, safeTxHash, succeeded, blockTimestamp, row)
  } catch (error) {
    logger.warn('Unable to settle a Safe transaction', llo({ ...info, safeTxHash, error }))
    if (pullOnFailure) await SafeDaoAssociationsModule.queueBackfill(info.network, safeAddress)
  }
}

export const SafeExecutionHandler = {
  executionSuccess: async (parsedEvent: LogDescription, info: ILogInfo) => settle(parsedEvent, info, true),

  executionFailure: async (parsedEvent: LogDescription, info: ILogInfo) => settle(parsedEvent, info, false),
}
