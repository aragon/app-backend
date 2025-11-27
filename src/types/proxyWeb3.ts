import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export enum IWeb3ProxyMethod {
  getNativeBalance = 'getNativeBalance',
  getTokenBalances = 'getTokenBalances',
  fetchContractCreation = 'fetchContractCreation',
  fetchContractSourceCode = 'fetchContractSourceCode',
  searchDetailsOfContract = 'searchDetailsOfContract',
  fetchHistoricalTokenPrice = 'fetchHistoricalTokenPrice',
}

export interface IWeb3Provider {
  getNativeBalance: ({ address, network }: { address: string; network: NetworksEnum }) => Promise<string>
  getTokenBalances: ({ address, network }: { address: string; network: NetworksEnum }) => Promise<IWeb3TokenBalance[]>
  fetchContractCreation: ({
    address,
    network,
  }: {
    address: string
    network: NetworksEnum
  }) => Promise<IWeb3ContractCreation>
  fetchContractSourceCode: ({ address, network }: { address: string; network: NetworksEnum }) => Promise<any>
  searchDetailsOfContract: ({ address, network }: { address: string; network: NetworksEnum }) => Promise<any>
  fetchHistoricalTokenPrice: ({
    address,
    network,
    date,
    symbol,
  }: {
    address?: string
    network: NetworksEnum
    date?: string | number
    symbol?: string
  }) => Promise<any>
}

export interface IWeb3TokenBalance {
  contractAddress: HexAddress
  tokenBalance: string
  originalBalance?: any
  decimals?: number
  name?: string
  symbol?: string
  priceUsd?: string
}

export interface IWeb3ContractCreation {
  blockNumber: number
  transactionHash: HexAddress | null
  address: HexAddress
}
