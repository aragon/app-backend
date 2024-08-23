import { type HexAddress, type NetworksEnum } from '@src/types/networks'
import { type IPluginRawStatus } from '@src/types/plugin'

export interface IQueryGetPlugin {
  transactionHash: HexAddress
  blockNumber: number
  network: NetworksEnum
  address: string
  daoAddress: HexAddress
  tokenAddress: HexAddress
  preparedSetupId: string
  appliedSetupId: string
  pluginSetupRepoAddress: HexAddress
  sender: HexAddress
  release: string
  build: string
  action: IPluginRawStatus
  permissions: any[]
  subdomain: string
}
