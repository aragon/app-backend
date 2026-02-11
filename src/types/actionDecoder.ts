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
}

export interface ILightDecodeResult {
  from: string
  to: string
  data: string
  value: string | number
  type: string
  inputData: ILightDecodeInputData | null
}
