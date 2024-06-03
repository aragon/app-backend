import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export interface ILogInfo {
  eventName: string
  network: NetworksEnum
  transactionHash: HexAddress
  blockNumber: number
}
