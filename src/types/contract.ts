import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export interface IContractAbiFunction {
  // Name of the function
  name: string
  // Parameters of the function
  parameters: IContractAbiFunctionParams[]
}

export interface IContractAbiFunctionParams {
  // Name of the parameter
  name: string
  // Type of the parameter
  type: string
  // NatSpec comment for the parameter
  notice?: string
  // Array of parameters for typle and typle[] types
  components?: IContractAbiFunctionParams[]
}

export interface IContractAbi {
  // Address of the implementation contract
  implementationAddress: string | null
  // Name of the contract
  name: string | null
  // Functions of the contract
  functions: IContractAbiFunction[]

  address: HexAddress

  network: NetworksEnum

  proxyName?: string | null
}

export interface IContractDeployInfo {
  blockNumber: number
  transactionHash: HexAddress | null
  address: HexAddress
}

export interface ISelectorActionData {
  functionName: string
  contractName: string
  proxyName?: string
  implementationAddress?: string | null
  inputs?: any[]
  notice?: string
}
