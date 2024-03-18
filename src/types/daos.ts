import { type ENS, type HexAddress } from '@src/types/networks'

export interface DaoResourceLink {
  name: string
  url: string
}

export interface IDaoDune {
  block_time: string
  creator_address: HexAddress
  dao_address: HexAddress
  ens: ENS
  hide_dao: boolean
  members: number
  metadata_ipfs: string
  network: string
  plugin_name: string
  proposals_created: number
  proposals_executed: number
  tvl_usd: number
  tx_hash: HexAddress
  unique_voters: number
  votes: number
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

export interface IDao extends IDaoMetadata {
  creatorAddress: HexAddress
  daoAddress: HexAddress
  block: number
  createdAt: Date
  ens: ENS
  members: number
  metadataIpfs: string | null
  network: string
  pluginName: string | null
  proposalsCreated: number
  proposalsExecuted: number
  tvlUSD: number
  txHash: HexAddress | null
  uniqueVoters: number
  votes: number
  hideDao: boolean
}
