import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export interface ICanCreateProposal {
  memberAddress?: HexAddress
  pluginAddress: HexAddress
  network: NetworksEnum
  ens?: string
}

export interface ICanVote {
  pluginAddress: HexAddress
  memberAddress: HexAddress
  network: NetworksEnum
  proposalIndex: string
}
