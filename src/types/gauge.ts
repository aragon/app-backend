import { type HexAddress, NetworksEnum } from '@src/types/networks'

export interface ActiveVoter {
  voter: string
  usedVP: bigint
  latestTxHash: string
  latestBlock: number
  latestLogIndex: number
  latestBlockTimestamp: number
}

export interface DelegationEntry {
  tokenId: string
  delegator: string
  voter: string
}

export interface DelegationResult {
  delegations: DelegationEntry[]
}

export interface RewardEntry {
  tokenId: string
  owner: string
  voter: string
  votingPower: bigint
}

export interface OwnerReward {
  owner: string
  tokenIds: string[]
  votingPower: bigint
  rewardAmount: bigint
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
  votingPower: bigint
}

export interface VoterDetail {
  voter: string
  usedVP: bigint
  tokenVPSum: bigint
  latestBlock: number
}

export interface RewardDistributionResult {
  epoch: number
  writeEpochId: number
  hookEnabled: boolean
  pluginAddress: string
  network: string
  contractTotal: bigint
  rewardTotalAmount: bigint
  votingPeriod: {
    epochStart: number
    voteEnd: number
  }
  addresses: {
    clock: string
    escrow: string
    adapter: string
    lockNFT: string
  }
  invariants: InvariantCheck[]
  gauges: GaugeVP[]
  voters: VoterDetail[]
  ownerRewards: OwnerReward[]
}

export interface RewardDistributionParams {
  epochId: number
  pluginAddress: string
  network: NetworksEnum
  rewardTotalAmount: bigint
}

export interface CumulativeRewardParams {
  capitalDistributorAddress: string
  network: NetworksEnum
  epochId: number
  currentRewards: Array<{ address: string; amount: string }>
  gaugeVoterPlugin?: string
}

export interface AdjustedRewardParams extends CumulativeRewardParams {
  gaugeVoterPlugin: HexAddress
  votingPeriod: { voteEnd: number; epochStart: number; epochDuration: number }
}
