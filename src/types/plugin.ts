import { type HexAddress, type NetworksEnum } from '@types'

export enum IPluginSubdomain {
  multisig = 'multisig',
  token = 'token-voting',
  address = 'address-list-voting',
  admin = 'admin',
  // subdaoPlugin = 'pattern-subdao-plugin',
}

export enum IPluginAction {
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
  action: IPluginAction
}
