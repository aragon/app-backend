import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export enum IWeb3ProxyMethod {
  getNativeBalance = 'getNativeBalance',
  getTokenBalances = 'getTokenBalances',
  fetchTokenDetails = 'fetchTokenDetails',
  fetchContractCreation = 'fetchContractCreation',
  fetchContractSourceCode = 'fetchContractSourceCode',
  fetchBasicTokenInfo = 'fetchBasicTokenInfo',
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
}

export interface IWeb3TokenBalance {
  contractAddress?: HexAddress | undefined
  tokenBalance: string
  originalBalance?: any
}

export interface IWeb3ContractCreation {
  blockNumber: number
  transactionHash: HexAddress | null
  address: HexAddress
}
