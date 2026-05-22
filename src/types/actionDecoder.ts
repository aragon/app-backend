import { type IProposalActionInputDataParameter } from './proposalAction'

export interface IRawActionLight {
  from?: string
  to: string
  data: string
  value: string | number
}

export interface ILightDecodeInputData {
  function: string
  contract: string | null
  parameters: IProposalActionInputDataParameter[]
  notice?: string
  textSignature: string
  implementationAddress?: string | null
  proxyName?: string | null
  /**
   * Decoded hierarchy of nested actions carried by `execute` / `createProposal` calls.
   */
  actions?: ILightDecodeResult[]
}

export interface ILightDecodeResult {
  from: string
  to: string
  data: string
  value: string | number
  type: string
  inputData: ILightDecodeInputData | null
}
