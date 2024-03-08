import {
  arbitrum,
  arbitrumGoerli,
  base,
  baseGoerli,
  goerli,
  mainnet,
  polygon,
  polygonMumbai,
  sepolia,
} from 'viem/chains'
import { type INetworks } from '@src/types/networks'

export const ViemChains = {
  ethereum: mainnet,
  goerli,
  sepolia,
  mumbai: polygonMumbai,
  polygon,
  base,
  baseGoerli,
  arbitrum,
  arbitrumGoerli,
}

export const ChainRpcGateway: Record<INetworks, string> = {
  ethereum: 'ethereum/mainnet',
  goerli: 'ethereum/goerli',
  sepolia: 'ethereum/sepolia',
  polygon: 'polygon/mainnet',
  mumbai: 'polygon/mumbai',
  arbitrum: 'arbitrum/mainnet',
  arbitrumGoerli: 'arbitrum/goerli',
  base: 'base/mainnet',
  baseGoerli: 'base/goerli',
}
