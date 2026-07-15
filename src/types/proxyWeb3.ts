import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export enum IContractAddressType {
  ADDRESS = 'address',
  TOKEN = 'token',
}

export enum IWeb3ProxyMethod {
  fetchContractCreation = 'fetchContractCreation',
  fetchContractSourceCode = 'fetchContractSourceCode',
  searchDetailsOfContract = 'searchDetailsOfContract',
}

export interface IWeb3Provider {
  fetchContractCreation: ({
    address,
    network,
  }: {
    address: string
    network: NetworksEnum
  }) => Promise<IWeb3ContractCreation>
  fetchContractSourceCode: ({ address, network }: { address: string; network: NetworksEnum }) => Promise<any>
  searchDetailsOfContract: ({ address, network }: { address: string; network: NetworksEnum }) => Promise<any>
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
