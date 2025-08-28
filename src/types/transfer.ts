import { type ITransactionSide, type NetworksEnum } from './index'

export enum IDaoTransferLogs {
  NativeTokenDeposited = 'NativeTokenDeposited',
  Executed = 'Executed',
}

/**
 * Transaction types - describes the type of token/asset being transferred
 */
export enum ITransactionType {
  erc20 = 'erc20',
  native = 'native',
  erc721 = 'erc721',
}

export type TransferTokenType = `${ITransactionType}`

/**
 * Parameters for generating unique transaction IDs
 */
export interface IUniqueIdParams {
  txHash: string
  logIndex?: number
  transactionIndex?: number
  type: TransferTokenType
  tokenAddress?: string
  tokenId?: string
  proposalId?: string
  batchIndex?: number
  actionIndex?: number
}

/**
 * Parameters for saving a transaction
 */
export interface ISaveTransactionParams {
  transactionHash: string
  blockNumber: number
  blockTimestamp?: number
  network: NetworksEnum
  side: ITransactionSide // (deposit/withdraw)
  type: ITransactionType // The actual transaction type (native/erc20/erc721)
  fromAddress: string
  toAddress: string
  value: string
  daoAddress: string
  pluginAddress?: string
  tokenAddress?: string
  logIndex?: number
  transactionIndex?: number
  tokenId?: string
  erc721TokenId?: string
  proposalIndex?: string
  actionIndex?: number
}
