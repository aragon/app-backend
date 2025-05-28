import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export enum IWeb3ProxyMethod {
  getNativeBalance = 'getNativeBalance',
  getTokenBalances = 'getTokenBalances',
  fetchTokenDetails = 'fetchTokenDetails',
  fetchContractCreation = 'fetchContractCreation',
  fetchContractSourceCode = 'fetchContractSourceCode',
  fetchBasicTokenInfo = 'fetchBasicTokenInfo',
  fetchTokenHolderAndSupply = 'fetchTokenHolderAndSupply',
  fetchAddressTxns = 'fetchAddressTxns',
  fetchTokenPrice = 'fetchTokenPrice',
  searchDetailsOfContract = 'searchDetailsOfContract',
  getAllTokenHolders = 'getAllTokenHolders',
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
  fetchBasicTokenInfo: ({ address, network }: { address: string; network: NetworksEnum }) => Promise<any>
  fetchTokenHolderAndSupply: ({ address, network }: { address: string; network: NetworksEnum }) => Promise<any>
  fetchAddressTxns: ({
    address,
    network,
    blockNumber,
  }: {
    address: string
    network: NetworksEnum
    blockNumber: number
  }) => Promise<any>
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
  getAllTokenHolders: ({
    address,
    network,
    callback,
    syncKey,
  }: {
    address: string
    network: NetworksEnum
    callback: (holder: { address: string; value: string }) => Promise<void> | void
    syncKey: any
  }) => Promise<any>
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
}

export interface IWeb3ContractCreation {
  blockNumber: number
  transactionHash: HexAddress | null
  address: HexAddress
}
