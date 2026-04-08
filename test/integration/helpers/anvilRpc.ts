import { ethers } from 'ethers'
import { getAnvilProvider, MAINNET_RPC } from './constants'

const toHex = (n: bigint | number): string => `0x${BigInt(n).toString(16)}`

export async function resetFork(blockNumber: number): Promise<void> {
  await getAnvilProvider().send('anvil_reset', [{ forking: { jsonRpcUrl: MAINNET_RPC, blockNumber } }])
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

/**
 * Mine `count` blocks. If `intervalSeconds` is provided, anvil spaces them by that interval.
 * Uses anvil_mine which mines all blocks in a single RPC call.
 */
export async function mine(count: number, intervalSeconds?: number): Promise<void> {
  const provider = getAnvilProvider()
  const params: string[] = [toHex(count)]
  if (intervalSeconds !== undefined) params.push(toHex(intervalSeconds))
  await provider.send('anvil_mine', params)
}

export async function getBlockTimestamp(): Promise<number> {
  const block = await getAnvilProvider().getBlock('latest')
  if (!block) throw new Error('No latest block on anvil')
  return block.timestamp
}
