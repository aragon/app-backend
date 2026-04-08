import { ethers } from 'ethers'
import { getAnvilProvider } from './constants'

// Cryptex (CTX) ERC20 — Ethereum mainnet
export const CTX_ADDRESS = '0x321c2fe4446c7c963dc41dd58879af648838f98d'

// Storage layout (from CTX source pragma 0.7.5):
//   slot 0: totalSupply (uint256)
//   slot 1: minter (address, padded)
//   slot 2: mintingAllowedAfter (uint256)
//   slot 3: allowances (mapping(address=>mapping(address=>uint96)))
//   slot 4: balances (mapping(address=>uint96))                  ← we write here
//   slot 5: delegates (mapping(address=>address))
const BALANCES_SLOT = 4n

export const CTX_ABI = [
  'function approve(address spender, uint256 amount) returns (bool)',
  'function balanceOf(address account) view returns (uint256)',
  'function transfer(address to, uint256 amount) returns (bool)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
] as const

/**
 * Mint CTX to `to` by writing the `balances` mapping slot directly via `anvil_setStorageAt`.
 * The slot for `balances[to]` is `keccak256(abi.encode(to, BALANCES_SLOT))`.
 *
 * Note: CTX stores balances as uint96 (max ~7.9e28). Any test amount fits.
 * `totalSupply` is NOT recomputed by transfers, so writing balances directly without
 * bumping totalSupply is safe — no transfer/approve check fails.
 */
export async function mintCtx(to: string, amount: bigint): Promise<void> {
  if (amount > (1n << 96n) - 1n) {
    throw new Error(`mintCtx amount ${amount} exceeds uint96 max`)
  }
  const slot = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(['address', 'uint256'], [to, BALANCES_SLOT]))
  const value = ethers.toBeHex(amount, 32)
  await getAnvilProvider().send('anvil_setStorageAt', [CTX_ADDRESS, slot, value])
}

/** Convenience: read CTX balance via the standard ERC20 view. */
export async function ctxBalanceOf(account: string): Promise<bigint> {
  const ctx = new ethers.Contract(CTX_ADDRESS, CTX_ABI, getAnvilProvider())
  return await ctx.balanceOf(account)
}

/** Returns a Contract bound to a signer for approve / transfer. */
export function ctxAs(signer: ethers.Signer): ethers.Contract {
  return new ethers.Contract(CTX_ADDRESS, CTX_ABI, signer)
}
