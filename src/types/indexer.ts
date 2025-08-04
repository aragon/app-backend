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
  permission = 'permission',
  transferList = 'transferList',
  lockManager = 'lockManager',
}

export enum IEnumIndexerService {
  depositTxs = 'depositTxs',
  withdrawTxs = 'withdrawTxs',
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
  | TransferListLogService
  | LockManagerLogService
  | null

// Individual pattern types
export type DepositLogService = `${IndexerType.deposit}-${NetworksEnum}-${string}-${IEnumIndexerService.depositTxs}`
export type WithdrawLogService = `${IndexerType.withdraw}-${NetworksEnum}-${string}-${IEnumIndexerService.withdrawTxs}`
export type IndexerLogService = `${IndexerType.indexer}-${NetworksEnum}`
export type PluginLogService = `${IPluginInterfaceType}-${NetworksEnum}-${string}`
export type DaoLogService = `${IndexerType.dao}-${NetworksEnum}-${string}`
export type PermissionLogService = `${IndexerType.permission}-${NetworksEnum}-${string}`
export type TransferListLogService = `${IndexerType.transferList}-${NetworksEnum}-${string}`
export type TokenLogService = `${ITokenType}-${NetworksEnum}-${string}`
export type LockManagerLogService = `${IndexerType.lockManager}-${NetworksEnum}-${string}`

// Type for parsed log service info
export type LogServiceInfo =
  | { type: IndexerType.deposit; network: NetworksEnum; address: string; service: IEnumIndexerService.depositTxs }
  | { type: IndexerType.withdraw; network: NetworksEnum; address: string; service: IEnumIndexerService.withdrawTxs }
  | { type: IndexerType.indexer; network: NetworksEnum }
  | { type: IndexerType.dao; network: NetworksEnum; address: string }
  | { type: IndexerType.permission; network: NetworksEnum; address: string }
  | { type: IndexerType.transferList; network: NetworksEnum; address: string }
  | { type: IndexerType.plugin; interfaceType: IPluginInterfaceType; network: NetworksEnum; address: string }
  | { type: IndexerType.token; tokenType: ITokenType; network: NetworksEnum; address: string }
  | { type: IndexerType.lockManager; network: NetworksEnum; address: string }
