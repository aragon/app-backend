export enum EnumConnection {
  MONGODB = 'MONGODB',
  BLOCKCHAIN = 'BLOCKCHAIN',
  RABBITMQ = 'RABBITMQ',
}

export enum EnumServiceName {
  ARAGON_DAO = 'aragon-dao',
  ARAGON_INDEXER = 'aragon-indexer',
  ARAGON_TRANSFERS = 'aragon-transfers',
  ARAGON_API = 'aragon-api',
  ARAGON_ADMIN_API = 'aragon-admin-api',
  ARAGON_GATEWAY = 'aragon-gateway',
  ARAGON_PLUGINS = 'aragon-plugins',
  ARAGON_RATES = 'aragon-rates',
  ARAGON_REQUEUE = 'aragon-requeue',
  ARAGON_MIGRATION = 'aragon-migration',
}

export interface IMigration {
  start: () => Promise<any>

  stop: () => void | Promise<void>
}

export interface IMigHelper {
  countDocs: number
}

export interface IOptionService {
  mongoSync: boolean
}

export interface IService {
  name: EnumServiceName
  options?: IOptionService
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
