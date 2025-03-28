import { type HexAddress, type NetworksEnum } from '@src/types/networks'
import type { ITokenMetrics } from '@src/types/covalent'
import { type ITokenType } from '@src/types/token'
import type Dao from '@models/schema/dao'
import { type ITransactionType } from '@src/types/db'
import { type ITransactionCategory } from '@src/types/alchemy'
import type Token from '@models/schema/token'

export interface IProviderAsset {
  contractAddress: HexAddress
  tokenBalance: string
}

export interface ITokenDetailsProvider {
  fetchTokenDetails: (
    tokenTypeInfo: ITokenProviderInfoArg,
    tokenAddress: HexAddress,
    network: NetworksEnum,
  ) => Promise<ITokenProviderInfo>

  fetchContractCreation: (tokenAddress: HexAddress, network: NetworksEnum) => Promise<any>
  fetchContractSourceCode: (contractAddress: HexAddress, network: NetworksEnum) => Promise<any>
  fetchBasicTokenInfo: (tokenDb: Token) => Promise<any>
}

export interface IAccountBalancesProvider {
  getAccountBalances: (address: HexAddress, network: NetworksEnum) => Promise<IProviderAsset[]>
}

export interface IAssetTransferProvider {
  getAssetTransfers: (
    dao: Dao,
    onTx: (txLog: IAssetTransferTxLog, side: ITransactionType, dao: Dao) => Promise<void>,
  ) => Promise<any>
}

export interface IAssetTransferTxLog {
  blockNum: number
  blockTimestamp: number
  uniqueId: string
  hash: string
  from: string
  to: string
  value: number | string
  erc721TokenId?: string | null
  erc1155Metadata?: any | null
  tokenId?: string | null
  asset?: string
  category: ITransactionCategory | undefined
  rawContract?: {
    address: string
    decimals: number
    priceUsd: string
    name: string
    symbol: string
    priceUpdatedAt: number
    logo?: string | null
    type: ITokenType
  }
}

export interface ITokenDetails {
  address: HexAddress
  name: string
  symbol: string
  decimals: number
  logo?: string | null
  priceUsd?: string
  type?: ITokenType
  totalSupply?: string
  totalHolders?: number
  priceChangeOnDayUsd?: string | undefined
  lastUpdatedAt?: any
}

export interface ITokenProviderInfo {
  tokenDetails: ITokenDetails
  tokenMetrics: ITokenMetrics
}

export interface ITokenProviderInfoArg {
  type: ITokenType
  isGovernance: boolean
}
