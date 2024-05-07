import { type ENS, type HexAddress } from '@src/types/networks'
import { type EnumPluginType } from '@src/types/subgraph'

export interface DaoResourceLink {
  name: string
  url: string
}

export interface IDaoDune {
  block_number: number
  block_time: string
  creator_address: HexAddress
  dao_address: HexAddress
  ens: ENS
  hide_dao: boolean
  metadata_ipfs: string
  network: string
  tx_hash: HexAddress
  // members: number
  // plugin_name: string
  // proposals_created: number
  // proposals_executed: number
  // tvl_usd: number
  // unique_voters: number
  // votes: number
}

export interface IDaoSatsumaResponse {
  daos: IDao[]
  limit: number
  skip: number
  results: number
  nextCursor: number
  skipResult: number
  excludedResult: number
}

export interface IDaoMetadata {
  name?: string | null
  description?: string | null
  avatar?: string | null
  links?: DaoResourceLink[]
}

export interface IProposalMetadata {
  title?: string | null
  summary?: string | null
  description?: string | null
  resources?: Array<{
    url?: string
    name?: string
  }>
  media?: {
    header?: string | null
    logo?: string | null
  }
}

export interface IPermission {
  operation: number
  where: string
  who: string
  condition: string
  permissionId: string
}

export interface ILink {
  name: string
  url: string
}

export interface IPlugin {
  type: EnumPluginType
  address: HexAddress
}

export interface IDaoMultiSigMember {
  address: HexAddress
}

export interface IDaoTokenVotingMember {
  address: HexAddress
  balance: string
  votingPower: string
  delegatee: { address: HexAddress }
  delegators: { address: HexAddress; balance: string }[]
}

export interface IDaoMembersResponse {
  members: IDaoMultiSigMember[] | IDaoTokenVotingMember[]
  limit?: number
  skip?: number
  orderProp?: string
  order?: string
}

export interface IDao extends IDaoMetadata {
  creatorAddress: HexAddress
  daoAddress: HexAddress
  permalink: string | null
  block: number
  blockTime: Date
  createdAt: Date
  ens: ENS
  members: number
  metadataIpfs: string | null
  network: string
  plugins: IPlugin[]
  proposalsCreated: number
  proposalsExecuted: number
  tvlUSD: number
  txHash: HexAddress | null
  uniqueVoters: number
  votes: number
  hideDao: boolean
  links: ILink[]
}
