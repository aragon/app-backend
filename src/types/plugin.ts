import { type HexAddress, type NetworksEnum } from '@types'

export enum IPluginType {
  install = 'install',
  update = 'update',
  uninstall = 'uninstall',
}

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
  subdomain: string | null
  sender: HexAddress | null
  type: IPluginType
}
