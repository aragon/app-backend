import { type IPluginInterfaceType } from '@src/types/plugin'
import { type NetworksEnum } from '@src/types/networks'
import { type ITokenType } from '@src/types/token'

export enum IndexerType {
  indexer = 'indexer',
  deposit = 'deposit',
  withdraw = 'withdraw',
  dao = 'dao',
  plugin = 'plugin',
  token = 'token',
}

export enum IEnumIndexerService {
  depositTxs = 'depositTxs',
  withdrawTxs = 'withdrawTxs',
}

export enum ITokenSyncTagName {
  delegates = 'delegates',
  transfers = 'transfers',
  holders = 'holders',
}

// Define a discriminated union for all possible logService patterns
export type LogServicePattern =
  | DepositLogService
  | WithdrawLogService
  | IndexerLogService
  | PluginLogService
  | DaoLogService
  | TokenLogService
  | null

// Individual pattern types
export type DepositLogService = `${IndexerType.deposit}-${string}-${IEnumIndexerService.depositTxs}`
export type WithdrawLogService = `${IndexerType.withdraw}-${string}-${IEnumIndexerService.withdrawTxs}`
export type IndexerLogService = `${IndexerType.indexer}-${NetworksEnum}`
export type PluginLogService = `${IPluginInterfaceType}-${NetworksEnum}-${string}`
export type DaoLogService = `${IndexerType.dao}-${NetworksEnum}-${string}`

// Only include valid token types for logService (excluding native and unknown)
export type TokenLogService =
  // Basic token format (backward compatible)
  | `${ITokenType.ERC20}-${NetworksEnum}-${string}`
  | `${ITokenType.ERC721}-${NetworksEnum}-${string}`
  | `${ITokenType.ERC1155}-${NetworksEnum}-${string}`
  | `${ITokenType.ERC777}-${NetworksEnum}-${string}`
  | `${ITokenType.escrowAdapter}-${NetworksEnum}-${string}`
  // Token format with sync tags
  | `${ITokenType.ERC20}-${NetworksEnum}-${string}-${ITokenSyncTagName}`
  | `${ITokenType.ERC721}-${NetworksEnum}-${string}-${ITokenSyncTagName}`
  | `${ITokenType.ERC1155}-${NetworksEnum}-${string}-${ITokenSyncTagName}`
  | `${ITokenType.ERC777}-${NetworksEnum}-${string}-${ITokenSyncTagName}`
  | `${ITokenType.escrowAdapter}-${NetworksEnum}-${string}-${ITokenSyncTagName}`

// Type for parsed log service info
export type LogServiceInfo =
  | { type: 'deposit'; address: string; service: IEnumIndexerService.depositTxs }
  | { type: 'withdraw'; address: string; service: IEnumIndexerService.withdrawTxs }
  | { type: 'indexer'; network: NetworksEnum }
  | { type: 'dao'; network: NetworksEnum; address: string }
  | { type: 'token'; tokenType: ITokenType; network: NetworksEnum; address: string; syncTag?: ITokenSyncTagName }
  | { type: 'plugin'; interfaceType: IPluginInterfaceType; network: NetworksEnum; address: string }
