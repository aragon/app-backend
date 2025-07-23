import { type IPluginInterfaceType } from '@src/types/plugin'
import { type HexAddress, type NetworksEnum } from '@src/types/networks'
import { type ITokenType } from '@src/types/token'

// TODO: this will be removed
export type IEnumIndexerServiceStatic =
  `${'indexer' | 'token' | 'deposit' | 'dao' | 'permission' | NetworksEnum | IPluginInterfaceType}-${string}-${string}`

// TODO: this will be replaced by ITokenSyncTagName
export enum TokenSyncTagName {
  Default = 'default',
  Delegation = 'delegation-event',
  Transfer = 'transfer-event',
  TokenHolders = 'token-holders',
}

export interface IServiceName {
  indexerType: IndexerType
  interfaceType: IPluginInterfaceType
  network: NetworksEnum
  pluginAddress: HexAddress
  tokenAddress?: HexAddress
}

export enum IndexerType {
  indexer = 'indexer',
  deposit = 'deposit',
  withdraw = 'withdraw',
  dao = 'dao',
  plugin = 'plugin',
  token = 'token',
  permission = 'permission',
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
  | PermissionLogService
  | null

// Individual pattern types
export type DepositLogService = `${IndexerType.deposit}-${string}-${IEnumIndexerService.depositTxs}`
export type WithdrawLogService = `${IndexerType.withdraw}-${string}-${IEnumIndexerService.withdrawTxs}`
export type IndexerLogService = `${IndexerType.indexer}-${NetworksEnum}`
export type PluginLogService = `${IPluginInterfaceType}-${NetworksEnum}-${string}`
export type DaoLogService = `${IndexerType.dao}-${NetworksEnum}-${string}`
export type PermissionLogService = `${IndexerType.permission}-${NetworksEnum}-${string}`

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
  | { type: 'permission'; network: NetworksEnum; address: string }
  | { type: 'token'; tokenType: ITokenType; network: NetworksEnum; address: string; syncTag?: ITokenSyncTagName }
  | { type: 'plugin'; interfaceType: IPluginInterfaceType; network: NetworksEnum; address: string }
