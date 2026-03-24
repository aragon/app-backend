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
  context?: TickContext
}

export interface IFormattedLog {
  event: LogDescription
  info: ILogInfo
  handler: any
  batchHandler?: any
}
