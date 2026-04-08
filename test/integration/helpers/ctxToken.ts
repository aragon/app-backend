import { ethers } from 'ethers'
import { getAnvilProvider } from './constants'

export const CTX_ADDRESS = '0x321c2fe4446c7c963dc41dd58879af648838f98d'

// CTX storage layout (pragma 0.7.5):
//   0: totalSupply, 1: minter, 2: mintingAllowedAfter,
//   3: allowances, 4: balances, 5: delegates
const BALANCES_SLOT = 4n

export const CTX_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
] as const

/**
 * Mint CTX by writing `balances[to]` directly via `anvil_setStorageAt`. Safe because
 * CTX never reconciles `totalSupply` against the sum of balances. Capped at uint96.
 */
export async function mintCtx(to: string, amount: bigint): Promise<void> {
  if (amount > (1n << 96n) - 1n) {
    throw new Error(`mintCtx amount ${amount} exceeds uint96 max`)
  }
  const slot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [to, BALANCES_SLOT]))
  const value = ethers.toBeHex(amount, 32)
  await getAnvilProvider().send('anvil_setStorageAt', [CTX_ADDRESS, slot, value])
}

export function ctxAs(signer: ethers.Signer): ethers.Contract {
  return new ethers.Contract(CTX_ADDRESS, CTX_ABI, signer)
}
