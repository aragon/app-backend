import { NetworksEnum } from '@src/types/networks'

export interface ActiveVoter {
  voter: string
  usedVP: bigint
  latestTxHash: string
  latestBlock: number
  latestBlockTimestamp: number
}

export interface ActiveVotersResult {
  voters: ActiveVoter[]
  onChainTotal: bigint
  maxBlock: number
}

export interface DelegationEntry {
  tokenId: string
  delegator: string
  voter: string
}

export interface DelegationResult {
  delegations: DelegationEntry[]
}

export interface OwnerReward {
  owner: string
  tokenIds: string[]
  votingPower: bigint
}

export interface AttributionResult {
  ownerRewards: OwnerReward[]
  voterVPSums: Map<string, bigint>
}

// ── veRewardDistribution types ──

export interface InvariantCheck {
  name: string
  pass: boolean
  detail: string
  failures?: string[]
}

export interface GaugeVP {
  gauge: string
  indexedVP: bigint
  contractVP: bigint
  share: number
}

export interface VoterDetail {
  voter: string
  usedVP: bigint
  tokenVPSum: bigint
  onChainVP: bigint
  latestBlock: number
}

export interface DelegationDetail {
  voter: string
  owner: string
  tokenIds: string[]
}

export interface RewardDistributionResult {
  epoch: number
  writeEpochId: number
  hookEnabled: boolean
  pluginAddress: string
  network: string
  contractTotal: bigint
  addresses: {
    clock: string
    escrow: string
    adapter: string
    lockNFT: string
  }
  invariants: InvariantCheck[]
  gauges: GaugeVP[]
  voters: VoterDetail[]
  delegations: DelegationDetail[]
  ownerRewards: OwnerReward[]
}

export interface RewardDistributionParams {
  epochId: number
  pluginAddress: string
  network: NetworksEnum
}
