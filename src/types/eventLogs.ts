import { type HexAddress, type NetworksEnum } from '@src/types/networks'
import type { TickContext } from '@src/modules/crawlers/tickContext'
import type { LogDescription } from 'ethers'

export interface ILogInfo {
  network: NetworksEnum
  blockNumber: number
  transactionIndex: number
  logIndex: number
  transactionHash: HexAddress
  address: HexAddress
  eventName: string
  interfaceType?: string
  tickContext?: TickContext
}

export interface IFormattedLog {
  event: LogDescription
  info: ILogInfo
  handler: any
}
