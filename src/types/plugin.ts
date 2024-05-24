import {HexAddress, IPluginType, NetworksEnum} from '@types'

export interface IAPlugin {
  transactionHash: string
  blockNumber: number
  network: NetworksEnum
  address: HexAddress
  implementationAddress: HexAddress | null
  daoAddress: HexAddress
  tokenAddress: HexAddress | null
  pluginSetupRepoAddress: HexAddress | null
  build: string | null
  release: string | null
  sender: HexAddress | null
  type: IPluginType
}
