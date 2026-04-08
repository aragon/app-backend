import { ethers } from 'ethers'

export const ANVIL_RPC = process.env.ANVIL_RPC || 'http://localhost:8545'
export const MAINNET_RPC = process.env.ETH_RPC_URL || 'https://eth.llamarpc.com'

let _anvilProvider: ethers.JsonRpcProvider | null = null
let _mainnetProvider: ethers.JsonRpcProvider | null = null

export function getAnvilProvider(): ethers.JsonRpcProvider {
  if (!_anvilProvider) _anvilProvider = new ethers.JsonRpcProvider(ANVIL_RPC)
  return _anvilProvider
}
