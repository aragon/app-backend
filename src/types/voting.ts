import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export interface ICanCreateProposal {
  memberAddress?: HexAddress
  pluginAddress: HexAddress
  network: NetworksEnum
  ens?: string
}
