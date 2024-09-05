import { type HexAddress, type NetworksEnum } from '@src/types/networks'
import { type ProposalActionType } from '@src/types/proposalAction'

export interface ILogInfo {
  network: NetworksEnum
  blockNumber: number
  transactionIndex: number
  logIndex: number
  transactionHash: HexAddress
  address: HexAddress
  eventName: string
}

export interface ILogAction {
  to: string
  value: string
  data: string
}

export interface IDecodedData {
  parameters?: any
  notice?: string
  contractName?: string
  functionName: any
  decoded: any
  textSignature: string
  type?: ProposalActionType
}
