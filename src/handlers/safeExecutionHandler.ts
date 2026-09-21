import Web3Helper from '@helpers/web3'
import logger from '@logger'
import SafeTrackingModule from '@modules/safe/safeTracking'
import SafeTransactionsModule from '@modules/safe/safeTransactions'
import { type HexAddress, type ILogInfo } from '@types'
import { getAddress, type LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'handlers:SafeExecutionHandler' })

/**
 * A Safe telling us one of its transactions executed.
 *
 * This is the only onchain signal for a Safe with no DAO behind it, and for a Safe that has one it
 * still beats the DAO's own `Executed` event: the Safe names the transaction by its `safeTxHash`,
 * which is the key its stored row is written under.
 *
 * Executions of every Safe on the network arrive here, so the tracking gate runs first and answers
 * no for almost all of them.
 */
const settle = async (parsedEvent: LogDescription, info: ILogInfo, succeeded: boolean) => {
  const safeAddress = getAddress(info.address) as HexAddress
  const safeTxHash = String(parsedEvent.args.txHash ?? parsedEvent.args[0])

  try {
    if (!(await SafeTrackingModule.isTracked(info.network, safeAddress))) return

    const blockTimestamp = info.context
      ? await info.context.getBlockTimestamp(info.blockNumber)
      : await Web3Helper.getBlockTimestamp(info.blockNumber, info.network)

    const settled = await SafeTransactionsModule.markExecuted(info.network, safeAddress, safeTxHash, {
      transactionHash: info.transactionHash,
      blockNumber: info.blockNumber,
      blockTimestamp: blockTimestamp || undefined,
      succeeded,
    })

    if (settled) logger.verbose('Safe transaction settled', llo({ ...info, safeTxHash, succeeded }))
  } catch (error) {
    logger.warn('Unable to settle a Safe transaction', llo({ ...info, safeTxHash, error }))
  }
}

export const SafeExecutionHandler = {
  executionSuccess: async (parsedEvent: LogDescription, info: ILogInfo) => settle(parsedEvent, info, true),

  executionFailure: async (parsedEvent: LogDescription, info: ILogInfo) => settle(parsedEvent, info, false),
}
