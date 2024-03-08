// DAO MEMBER
import { type ENS, type HexAddress } from '@src/types/networks'

export interface IDaosOfMember {
  tokenVotingMembers: SubgraphMemberOfDao[]
  multisigApprovers: SubgraphMemberOfDao[]
}

export interface SubgraphQueryParam {
  where: any
  block?: number | null
  first?: number
  skip?: number
  orderBy?: string
  orderDirection?: string
}

export interface SubgraphMemberOfDao {
  address: string
  plugin: {
    pluginAddress: string
    dao: {
      id: string
      metadata: string
      subdomain: string
      createdAt: string
      proposals: { __typename: string, id: string }[]
    }
  }
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
  __typename: EnumPluginType.TokenVotingPlugin
  members: { votingPower?: number }[]
}

export interface SubgraphMultisigPlugin {
  __typename: EnumPluginType.MultisigPlugin
  members: { address?: string }[]
}

export interface SubgraphAddresslistVotingPlugin {
  __typename: EnumPluginType.AddresslistVotingPlugin
}

export interface SubgraphAdminPlugin {
  __typename: EnumPluginType.AdminPlugin
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
