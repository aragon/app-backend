import { execFileSync } from 'child_process'
import { ethers } from 'ethers'

const ANVIL_RPC = process.env.ANVIL_RPC || 'http://localhost:8545'

let _wallet: ethers.HDNodeWallet | null = null

export function generateWallet(): ethers.HDNodeWallet {
  _wallet = ethers.Wallet.createRandom()
  execFileSync('curl', [
    '-sf',
    '-X',
    'POST',
    ANVIL_RPC,
    '-H',
    'Content-Type: application/json',
    '-d',
    JSON.stringify({
      jsonrpc: '2.0',
      method: 'anvil_setBalance',
      params: [_wallet.address, '0x56BC75E2D63100000'], // 100 ETH
      id: 1,
    }),
  ])
  return _wallet
}

export function getWallet(): ethers.HDNodeWallet {
  if (!_wallet) throw new Error('Wallet not yet generated — call generateWallet() first')
  return _wallet
}
