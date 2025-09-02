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
  tokenDeposit = 'tokenDeposit',
  tokenWithdraw = 'tokenWithdraw',
  nativeDeposit = 'nativeDeposit',
  nativeWithdraw = 'nativeWithdraw',
  campaignStrategy = 'campaignStrategy',
}

export enum IEnumIndexerService {
  tokenDeposit = 'tokenDeposit',
  tokenWithdraw = 'tokenWithdraw',
}

// Define a discriminated union for all possible logService patterns
export type LogServicePattern =
  | IndexerLogService
  | PluginLogService
  | DaoLogService
  | TokenLogService
  | PermissionLogService
  | TransferListLogService
  | LockManagerLogService
  | TokenDepositLogService
  | TokenWithdrawLogService
  | NativeDepositLogService
  | NativeWithdrawLogService
  | CampaignStrategyLogService
  | null

// Individual pattern types
export type IndexerLogService = `${IndexerType.indexer}-${NetworksEnum}`
export type PluginLogService = `${IPluginInterfaceType}-${NetworksEnum}-${string}`
export type DaoLogService = `${IndexerType.dao}-${NetworksEnum}-${string}`
export type PermissionLogService = `${IndexerType.permission}-${NetworksEnum}-${string}`
export type TransferListLogService = `${IndexerType.transferList}-${NetworksEnum}-${string}`
export type TokenLogService = `${ITokenType}-${NetworksEnum}-${string}`
export type LockManagerLogService = `${IndexerType.lockManager}-${NetworksEnum}-${string}`
export type CampaignStrategyLogService = `${IndexerType.campaignStrategy}-${NetworksEnum}-${string}`
export type TokenDepositLogService = `${IndexerType.tokenDeposit}-${NetworksEnum}-${string}`
export type TokenWithdrawLogService = `${IndexerType.tokenWithdraw}-${NetworksEnum}-${string}`
export type NativeDepositLogService = `${IndexerType.nativeDeposit}-${NetworksEnum}-${string}`
export type NativeWithdrawLogService = `${IndexerType.nativeWithdraw}-${NetworksEnum}-${string}`

// Type for parsed log service info
export type LogServiceInfo =
  | {
      type: IndexerType.deposit
      network: NetworksEnum
      address: string
      service: IEnumIndexerService.tokenDeposit
    }
  | {
      type: IndexerType.withdraw
      network: NetworksEnum
      address: string
      service: IEnumIndexerService.tokenWithdraw
    }
  | { type: IndexerType.indexer; network: NetworksEnum }
  | { type: IndexerType.dao; network: NetworksEnum; address: string }
  | { type: IndexerType.permission; network: NetworksEnum; address: string }
  | { type: IndexerType.transferList; network: NetworksEnum; address: string }
  | { type: IndexerType.plugin; interfaceType: IPluginInterfaceType; network: NetworksEnum; address: string }
  | { type: IndexerType.token; tokenType: ITokenType; network: NetworksEnum; address: string }
  | { type: IndexerType.lockManager; network: NetworksEnum; address: string }
  | { type: IndexerType.tokenDeposit; network: NetworksEnum; address: string }
  | { type: IndexerType.tokenWithdraw; network: NetworksEnum; address: string }
  | { type: IndexerType.nativeDeposit; network: NetworksEnum; address: string }
  | { type: IndexerType.nativeWithdraw; network: NetworksEnum; address: string }
  | { type: IndexerType.campaignStrategy; network: NetworksEnum; address: string }
