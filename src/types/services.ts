import { type IPluginInterfaceType } from '@src/types/plugin'
import { type NetworksEnum } from '@src/types/networks'

export enum EnumConnection {
  MONGODB = 'MONGODB',
  BLOCKCHAIN = 'BLOCKCHAIN',
  RABBITMQ = 'RABBITMQ',
}

export interface IMigration {
  start: () => Promise<any>

  stop: () => void | Promise<void>
}

export interface IService {
  NEED_CONNECTIONS: EnumConnection[]

  start: () => Promise<any>

  stop: () => void | Promise<void>
}

export enum IEnumTaskStatus {
  PENDING = 'PENDING',
  RUNNING = 'RUNNING',
  DONE = 'DONE',
  ERROR = 'ERROR',
}

export enum IEnumIndexerService {
  depositTxs = 'depositTxs',
  withdrawTxs = 'withdrawTxs',
}

export type IEnumIndexerServiceStatic =
  `${'indexer' | 'token' | 'deposit' | 'dao' | 'permission' | NetworksEnum | IPluginInterfaceType}-${string}-${string}`
