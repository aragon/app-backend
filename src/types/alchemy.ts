import { type HexAddress } from '@src/types/networks'
import { type WebSocketProvider } from 'ethers'

export interface IWebSocketProvider extends WebSocketProvider {
  updateProvider: (newProvider: WebSocketProvider) => void
  websocket: WebSocket | any
  processQueue: any
}

export interface IAlchemyTokenBalance {
  contractAddress?: HexAddress | undefined
  tokenBalance: string
  originalBalance: any
}

export enum ITransactionCategory {
  External = 'external',
  Internal = 'internal',
  ERC20 = 'erc20',
  ERC721 = 'erc721',
  ERC1155 = 'erc1155',
}

export interface IAlchemyTransferOptions {
  fromBlock?: number | string
  toBlock?: number | string
  fromAddress?: HexAddress
  toAddress?: HexAddress
  category?: ITransactionCategory[]
}

export interface IAlchemyTransferResponse {
  blockNum: number // hex block number
  uniqueId: string
  blockTimestamp?: number
  block: number
  hash: HexAddress
  from: HexAddress
  to: HexAddress
  value: number | null | string
  erc721TokenId: string | null
  erc1155Metadata?: IAlchemyERC1155Metadata[]
  tokenId?: string | null
  asset?: string | null
  category?: ITransactionCategory | undefined
  rawContract: IAlchemyRawContract
}

export interface IAlchemyERC1155Metadata {
  tokenId: string
  value: string
}

export interface IAlchemyRawContract {
  value: HexAddress | null
  address: HexAddress | null
  decimal: HexAddress | null
}
