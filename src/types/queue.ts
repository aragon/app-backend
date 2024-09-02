import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export enum EnumQueueName {
  daoTransactions = 'dao.transactions',
  daoAssets = 'dao.assets',
}

export interface IQueueDao {
  address: HexAddress
  network: NetworksEnum
}

export interface IQueueMessage {
  id: string
  params: IQueueDao
}

export interface ISendOptions {
  waitResponse?: boolean
  timeout?: number // reject response after timeout
}
