import { ITransactionIndexCheckType, type NetworksEnum } from '@types'
import { waitForTxIndexed, type WaitOpts } from './dbWaiters'
import { waitForIndexerCatchup } from './services'
import type { TxResult } from './txActions'

/**
 * Run a chain transaction and block until the indexer has consumed up to (or past)
 * the tx's block. Coarse-grained — a true sync to the block number, not action-specific.
 */
export async function txAndWaitBlock<T extends TxResult>(fn: () => Promise<T>, timeoutMs = 180_000): Promise<T> {
  const result = await fn()
  await waitForIndexerCatchup(result.blockNumber, timeoutMs)
  return result
}

/**
 * Run a chain transaction and block until the indexer has processed it for `action`.
 * Uses the same probe the public API exposes (TransactionController.getTransactionIndexingStatus).
 *
 * Use this when you want "is this *specific tx* visible in the API yet" rather than
 * "is the chain block synced." For PROPOSAL_CREATE / PROPOSAL_VOTE / LOCK_CREATE etc.
 */
export async function txAndWaitIndexed<T extends TxResult>(
  fn: () => Promise<T>,
  action: ITransactionIndexCheckType,
  network: NetworksEnum,
  opts: WaitOpts = {},
): Promise<T> {
  const result = await fn()
  await waitForTxIndexed(result.txHash, action, network, opts)
  return result
}
