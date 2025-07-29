export enum EnumConnection {
  MONGODB = 'MONGODB',
  BLOCKCHAIN = 'BLOCKCHAIN',
  RABBITMQ = 'RABBITMQ',
}

export interface IMigration {
  start: () => Promise<any>

  stop: () => void | Promise<void>
}

export interface IOptionService {
  mongoSync: boolean
}

export interface IService {
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
