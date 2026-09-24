import config from '@config'
import RabbitMQHelper from '@helpers/rabbitMQ'
import Web3Helper from '@helpers/web3'
import logger from '@logger'
import SafeRelationsModule from '@modules/safe/safeRelations'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import { EnumQueueName, type HexAddress, type ILogInfo } from '@types'
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

  try {
    if (!(await SafeRelationsModule.isTracked(info.network, safeAddress))) return

    const blockTimestamp = info.context
      ? await info.context.getBlockTimestamp(info.blockNumber)
      : await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)

    const settled = await SafeTransactionsModule.markExecuted(info.network, safeAddress, safeTxHash, {
      transactionHash: info.transactionHash,
      blockNumber: info.blockNumber,
      blockTimestamp: blockTimestamp || undefined,
      succeeded,
    })

    if (settled) {
      logger.verbose('Safe transaction settled', llo({ ...info, safeTxHash, succeeded }))
      return
    }

    const historyPages = config.SAFE_API.BACKFILL_HISTORY_PAGES
    await RabbitMQHelper.sendMessage(EnumQueueName.safeRefresh, {
      id: `safe-refresh-${info.network}-${safeAddress}-${historyPages}`,
      params: { network: info.network, address: safeAddress, historyPages },
    })
  } catch (error) {
    logger.warn('Unable to settle a Safe transaction', llo({ ...info, safeTxHash, error }))
  }
}

export const SafeExecutionHandler = {
  executionSuccess: async (parsedEvent: LogDescription, info: ILogInfo) => settle(parsedEvent, info, true),

  executionFailure: async (parsedEvent: LogDescription, info: ILogInfo) => settle(parsedEvent, info, false),
}
