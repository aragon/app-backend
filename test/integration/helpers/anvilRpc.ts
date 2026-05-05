import { ethers } from 'ethers'
import { getAnvilProvider, MAINNET_RPC } from './constants'

const toHex = (n: bigint | number): string => `0x${BigInt(n).toString(16)}`

/**
 * Reset the anvil fork to a specific block. The `anvil_reset` call hits the upstream RPC
 * (drpc.live / llama / whatever ETH_RPC_URL points at) which can transiently time out.
 * Retry with exponential backoff so a single flaky RPC response doesn't tank the suite.
 */
export async function resetFork(blockNumber: number, attempts = 3): Promise<void> {
  let lastError: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      await getAnvilProvider().send('anvil_reset', [{ forking: { jsonRpcUrl: MAINNET_RPC, blockNumber } }])
      return
    } catch (err) {
      lastError = err
      if (i === attempts - 1) break
      const backoffMs = 1000 * 2 ** i
      await new Promise(r => setTimeout(r, backoffMs))
    }
  }
  throw lastError
}

export async function setBalance(address: string, wei: bigint): Promise<void> {
  await getAnvilProvider().send('anvil_setBalance', [address, toHex(wei)])
}

export async function impersonate(address: string): Promise<ethers.JsonRpcSigner> {
  const provider = getAnvilProvider()
  await provider.send('anvil_impersonateAccount', [address])
  return provider.getSigner(address)
}

export async function stopImpersonate(address: string): Promise<void> {
  await getAnvilProvider().send('anvil_stopImpersonatingAccount', [address])
}

export async function increaseTime(seconds: number | bigint): Promise<void> {
  await getAnvilProvider().send('evm_increaseTime', [Number(seconds)])
}

export async function setNextBlockTimestamp(ts: number | bigint): Promise<void> {
  await getAnvilProvider().send('evm_setNextBlockTimestamp', [Number(ts)])
}

/** Mine `count` blocks via `anvil_mine`, optionally spaced by `intervalSeconds`. */
export async function mine(count: number, intervalSeconds?: number): Promise<void> {
  const provider = getAnvilProvider()
  const params: string[] = [toHex(count)]
  if (intervalSeconds !== undefined) params.push(toHex(intervalSeconds))
  await provider.send('anvil_mine', params)
}
