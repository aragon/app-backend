// DAO MEMBER
import { type ENS, type HexAddress } from '@src/types/networks'

export interface SubgraphQueryParam {
  where: any
  block?: number | null
  first?: number
  skip?: number
  orderBy?: string
  orderDirection?: string
}

// DAOs
export enum EnumProposalType {
  TokenVotingProposal = 'TokenVotingProposal',
  MultisigProposal = 'MultisigProposal',
}

export enum EnumPluginType {
  MultisigPlugin = 'MultisigPlugin',
  TokenVotingPlugin = 'TokenVotingPlugin',
  AddresslistVotingPlugin = 'AddresslistVotingPlugin',
  AdminPlugin = 'AdminPlugin',
}

export interface SubgraphTokenVotingPlugin {
  pluginAddress: HexAddress
  __typename: EnumPluginType.TokenVotingPlugin
  members: { votingPower?: number }[]
}

export interface SubgraphMultisigPlugin {
  pluginAddress: HexAddress
  __typename: EnumPluginType.MultisigPlugin
  members: { address?: string }[]
}

export interface SubgraphAddresslistVotingPlugin {
  pluginAddress: HexAddress
  __typename: EnumPluginType.AddresslistVotingPlugin
  members: undefined
}

export interface SubgraphAdminPlugin {
  pluginAddress: HexAddress
  __typename: EnumPluginType.AdminPlugin
  members: undefined
}

export interface SubgraphProposal {
  id: string
  executed: boolean
  __typename: EnumProposalType
}

export interface IDaoSubgraph {
  id: HexAddress
  subdomain: string
  creator: HexAddress
  daoURI: ENS
  metadata: string
  createdAt: number
  proposals: SubgraphProposal[]
  plugins: {
    plugin:
      | SubgraphTokenVotingPlugin
      | SubgraphMultisigPlugin
      | SubgraphAddresslistVotingPlugin
      | SubgraphAdminPlugin
  }[]
}
