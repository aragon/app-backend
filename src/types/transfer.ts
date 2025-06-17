import type { HexAddress } from '@src/types/networks'
import type MemberBalance from '@models/schema/memberBalance'
import { type LogDescription } from 'ethers'
import { type ILogInfo } from '@src/types/eventLogs'

export enum ITransferSide {
  incoming = 'incoming',
  outgoing = 'outgoing',
}

export enum ITransferType {
  tokenTransfer = 'tokenTransfer',
  delegate = 'delegate',
}

export interface BatchEvents {
  log: LogDescription
  info: ILogInfo
}

export interface UserTransferData {
  address: HexAddress
  events: {
    parsedEvent: LogDescription
    info: ILogInfo
    transferSide?: ITransferSide
    dbId: string
    eventType: 'transfer' | 'delegation'
  }[]
  balance?: MemberBalance
}

export interface TransferProcessorOptions {
  batchSize?: number
  parallelUsers?: number
}
