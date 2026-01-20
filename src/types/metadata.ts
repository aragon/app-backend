import { type HexAddress, type NetworksEnum } from '@src/types/networks'

export enum MetadataEntityType {
  Dao = 'Dao',
  Plugin = 'Plugin',
  Proposal = 'Proposal',
  Gauge = 'Gauge',
  Campaign = 'Campaign',
}

export enum MetadataRefetchStatus {
  pending = 'pending',
  completed = 'completed',
  discarded = 'discarded',
}

export interface IMetadataRefetchParams {
  metadataUri: string
  entityType: MetadataEntityType
  entityId: string
  network: NetworksEnum
}

export interface IQueueMetadataRefetch {
  id: string
  metadataUri: string
  entityType: MetadataEntityType
  entityId: HexAddress | string
  network: NetworksEnum
}
