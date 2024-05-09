export enum EnumConnection {
  MONGODB = 'MONGODB',
  BLOCKCHAIN = 'BLOCKCHAIN',
}

export interface IService {
  NEED_CONNECTIONS: EnumConnection[]

  start: () => Promise<any>

  stop: () => void | Promise<void>
}
