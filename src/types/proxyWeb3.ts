import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export enum IWeb3ProxyMethod {
  getNativeBalance = 'getNativeBalance',
  getTokenBalances = 'getTokenBalances',
  fetchContractCreation = 'fetchContractCreation',
  fetchContractSourceCode = 'fetchContractSourceCode',
  fetchTokenBalances = 'fetchTokenBalances',
  fetchBasicTokenInfo = 'fetchBasicTokenInfo',
  fetchTokenHolderAndSupply = 'fetchTokenHolderAndSupply',
  fetchTokenPrice = 'fetchTokenPrice',
  searchDetailsOfContract = 'searchDetailsOfContract',
  fetchHistoricalTokenPrice = 'fetchHistoricalTokenPrice',
  getTokenCounters = 'getTokenCounters',
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
  fetchBasicTokenInfo: ({ address, network }: { address: string; network: NetworksEnum }) => Promise<any>
  fetchTokenHolderAndSupply: ({ address, network }: { address: string; network: NetworksEnum }) => Promise<any>
  fetchTokenPrice: ({
    address,
    network,
    pastDays,
  }: {
    address: string
    network: NetworksEnum
    pastDays?: number
  }) => Promise<any>
  searchDetailsOfContract: ({ address, network }: { address: string; network: NetworksEnum }) => Promise<any>
  getTokenCounters: ({
    address,
    network,
  }: {
    address: string
    network: NetworksEnum
  }) => Promise<{ transfers: number; holders: number }>
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
