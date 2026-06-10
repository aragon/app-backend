import { ethers } from 'ethers'
import { getAnvilProvider, getMainnetProvider, MAINNET_RPC } from './constants'

const toHex = (n: bigint | number): string => `0x${BigInt(n).toString(16)}`

// Known contract code on mainnet — used as a post-reset sanity probe so we
// catch drpc serving an empty/stale fork before downstream callers blow up
// with a confusing `estimateGas` revert.
const POST_RESET_PROBE_ADDRESS = '0x246503df057A9a85E0144b6867a828c99676128B' // Aragon DAOFactory

// Fork near chain head so anvil's lazy state fetches hit the upstream node's
// hot state (last ~128 blocks) instead of archive. Archive reads are what drpc
// rate-limits, and that rate-limiting is the root cause of the intermittent
// `missing revert data` failures during fork setup. A fixed historical block
// becomes archive within ~25 min, so we resolve `head - margin` at runtime and
// cache it for the whole run so every spec forks at the same deterministic block.
const FORK_HEAD_MARGIN = 64 // past finality (~2 epochs) yet still inside the hot-state window
let _recentForkBlock: number | null = null

export async function getRecentForkBlock(): Promise<number> {
  if (_recentForkBlock === null) {
    const head = await getMainnetProvider().getBlockNumber()
    _recentForkBlock = head - FORK_HEAD_MARGIN
  }
  return _recentForkBlock
}

async function sendWithRetry(method: string, params: unknown[], attempts = 4): Promise<unknown> {
  const provider = getAnvilProvider()
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await provider.send(method, params)
    } catch (err) {
      lastError = err
      if (i === attempts - 1) break
      const backoffMs = 1000 * 2 ** i
      await new Promise(r => setTimeout(r, backoffMs))
    }
  }
  throw lastError
}

/**
 * Reset the anvil fork to a block. The `anvil_reset` call hits the upstream RPC
 * (drpc.live / llama / whatever ETH_RPC_URL points at) which can transiently time out
 * or return an inconsistent fork state. Retry with exponential backoff, and probe a
 * known contract afterwards so callers don't race against a half-warm fork.
 *
 * Defaults to a near-head block (see {@link getRecentForkBlock}) so state fetches stay
 * out of archive territory; pass an explicit block only when a spec needs a fixed point.
 */
export async function resetFork(blockNumber?: number, attempts = 4): Promise<void> {
  const targetBlock = blockNumber ?? (await getRecentForkBlock())
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      await sendWithRetry('anvil_reset', [{ forking: { jsonRpcUrl: MAINNET_RPC, blockNumber: targetBlock } }], 1)
      const code = await sendWithRetry('eth_getCode', [POST_RESET_PROBE_ADDRESS, 'latest'], 1)
      if (typeof code === 'string' && code !== '0x') return
      lastError = new Error(
        `anvil_reset probe returned empty code for ${POST_RESET_PROBE_ADDRESS} — upstream RPC likely stale`,
      )
    } catch (err) {
      lastError = err
    }
    if (i === attempts - 1) break
    const backoffMs = 1000 * 2 ** i
    await new Promise(r => setTimeout(r, backoffMs))
  }
  throw lastError
}

export async function setBalance(address: string, wei: bigint): Promise<void> {
  await sendWithRetry('anvil_setBalance', [address, toHex(wei)])
}

export async function impersonate(address: string): Promise<ethers.JsonRpcSigner> {
  await sendWithRetry('anvil_impersonateAccount', [address])
  return getAnvilProvider().getSigner(address)
}

export async function stopImpersonate(address: string): Promise<void> {
  await sendWithRetry('anvil_stopImpersonatingAccount', [address])
}

export async function increaseTime(seconds: number | bigint): Promise<void> {
  await sendWithRetry('evm_increaseTime', [Number(seconds)])
}

export async function setNextBlockTimestamp(ts: number | bigint): Promise<void> {
  await sendWithRetry('evm_setNextBlockTimestamp', [Number(ts)])
}

/** Mine `count` blocks via `anvil_mine`, optionally spaced by `intervalSeconds`. */
export async function mine(count: number, intervalSeconds?: number): Promise<void> {
  const params: string[] = [toHex(count)]
  if (intervalSeconds !== undefined) params.push(toHex(intervalSeconds))
  await sendWithRetry('anvil_mine', params)
}
