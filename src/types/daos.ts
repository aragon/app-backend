import { type HexAddress } from '@src/types/networks'
import { type EnumPluginType } from '@src/types/subgraph'
import Dao from "@models/schema/dao";

export interface DaoResourceLink {
  name: string
  url: string
}

export interface IDaoSatsumaResponse {
  daos: Dao[]
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

