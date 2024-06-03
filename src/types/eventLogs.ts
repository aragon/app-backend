import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export interface ILogInfo {
  network: NetworksEnum
  blockNumber: number
  transactionHash: HexAddress | string
  address: HexAddress | string
  eventName: string
}
