import { ethers } from 'ethers'
import { getAnvilProvider } from './constants'

let _wallet: ethers.HDNodeWallet | null = null

export async function generateWallet(): Promise<ethers.HDNodeWallet> {
  if (_wallet) {
    await getAnvilProvider().send('anvil_setBalance', [_wallet.address, '0x56BC75E2D63100000']) // 100 ETH
    return _wallet
  }

  _wallet = ethers.Wallet.createRandom()
  await getAnvilProvider().send('anvil_setBalance', [_wallet.address, '0x56BC75E2D63100000']) // 100 ETH
  return _wallet
}

export function getWallet(): ethers.HDNodeWallet {
  if (!_wallet) throw new Error('Wallet not yet generated — call generateWallet() first')
  return _wallet
}
