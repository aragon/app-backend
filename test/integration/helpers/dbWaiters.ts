import { Models } from '@dbModels'
import TransactionController from '@api/controllers/transaction'
import { ICollectionNames, ITransactionIndexCheckType, type NetworksEnum } from '@types'

export type WaitOpts = {
  timeoutMs?: number
  intervalMs?: number
  label?: string
}

const DEFAULT_TIMEOUT = 30_000
const DEFAULT_INTERVAL = 200

/**
 * Generic predicate-based DB waiter. Polls `fetch()` every `intervalMs` until
 * `predicate(value)` returns true OR `timeoutMs` elapses. Throws with the last
 * observed value on timeout for easier debugging.
 */
export async function waitForDb<T>(
  fetch: () => Promise<T | null | undefined>,
  predicate: (value: T) => boolean,
  opts: WaitOpts = {},
): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT
  const intervalMs = opts.intervalMs ?? DEFAULT_INTERVAL
  const start = Date.now()
  let last: T | null | undefined
  while (Date.now() - start < timeoutMs) {
    last = await fetch()
    if (last != null && predicate(last)) return last
    await new Promise(r => setTimeout(r, intervalMs))
  }
  const label = opts.label ?? 'waitForDb'
  throw new Error(`${label}: predicate did not pass within ${timeoutMs}ms. Last value: ${JSON.stringify(last)}`)
}

/**
 * Wait until a single document in `collection` matching `filter` satisfies `predicate`.
 * Uses the `Models[name]` lookup so callers only need the enum, not the model class.
 */
export async function waitForOne(
  collection: ICollectionNames,
  filter: Record<string, unknown>,
  predicate: (doc: any) => boolean,
  opts: WaitOpts = {},
): Promise<any> {
  return waitForDb(() => Models[collection].findOne(filter).lean(), predicate, {
    label: `${collection}.findOne(${JSON.stringify(filter)})`,
    ...opts,
  })
}

/** Wait until `collection` has at least `expected` docs matching `filter`. */
export async function waitForCount(
  collection: ICollectionNames,
  filter: Record<string, unknown>,
  expected: number,
  opts: WaitOpts = {},
): Promise<void> {
  await waitForDb(
    () => Models[collection].countDocuments(filter),
    (n: number) => n >= expected,
    { label: `${collection}.count(${JSON.stringify(filter)}) >= ${expected}`, ...opts },
  )
}

/**
 * Wait for the indexer to have processed a specific tx for a specific action,
 * using the same logic the public API uses (`TransactionController.getTransactionIndexingStatus`).
 *
 * Best for "I just sent a proposal create / vote / lock — has it been indexed?"
 * For collection-shape assertions (e.g. firstActivity advanced) use waitForOne instead.
 */
export async function waitForTxIndexed(
  txHash: string,
  action: ITransactionIndexCheckType,
  network: NetworksEnum,
  opts: WaitOpts = {},
): Promise<void> {
  await waitForDb(
    () => TransactionController.getTransactionIndexingStatus(txHash, action, network),
    status => status.isProcessed,
    { label: `tx ${txHash} indexed for ${action}`, ...opts },
  )
}
