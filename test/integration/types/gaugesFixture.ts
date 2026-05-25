import type { ethers } from 'ethers'

// ─── Enums ────────────────────────────────────────────────────────────────────

/** Mirrors Aragon TokenVoting's VoteOption (None=0, Abstain=1, Yes=2, No=3).
 *  Abstain omitted intentionally — re-add as `Abstain = 1` if a test needs it. */
export enum VoteOption {
  None = 0,
  Yes = 2,
  No = 3,
}

// ─── Deployment ───────────────────────────────────────────────────────────────

/** Addresses returned by `setupGaugesDao` after deploying a fresh gauges DAO. */
export interface GaugesDaoDeployment {
  dao: string
  multisig: string
  adapter: string
  deployer: string
  deployerWallet: ethers.HDNodeWallet
  deployerSigner: ethers.NonceManager
  tokenVoting: string
  votingEscrow: string
  nftLock: string
  clock: string
  exitQueue: string
  curve: string
  gaugeVoter: string
}

// ─── Activity config (input to runGaugesActivity) ─────────────────────────────

export interface StakerSpec {
  /** CTX amount in wei. Must fit uint96. */
  amount: bigint
}

export interface DelegationSpec {
  /** Staker index doing the delegation. */
  from: number
  /** Staker index receiving the delegation, or `'self'`. */
  to: number | 'self'
}

export interface VoteSpec {
  /** Staker index of the voter (must hold non-zero VP at the snapshot, i.e. be a delegate). */
  from: number
  choice: VoteOption
}

export interface ProposalSpec {
  metadata?: string
  votes: VoteSpec[]
  /**
   * Delegations applied AFTER this proposal is created and voted on. Each delegation has
   * `blockTimestamp > proposal.blockTimestamp`, so it's invisible to this proposal's snapshot
   * but visible to any later proposal. Used to test late delegation and delegate switching.
   */
  delegationsAfter?: DelegationSpec[]
}

export interface GaugesActivityConfig {
  stakers: StakerSpec[]
  delegations?: DelegationSpec[]
  proposals?: ProposalSpec[]
}

// ─── Activity result (output of runGaugesActivity) ────────────────────────────

export interface Staker {
  wallet: ethers.HDNodeWallet
  amount: bigint
  tokenId: bigint
  startTs: bigint
  delegate?: string
}

export interface ResolvedDelegation {
  from: string
  to: string
  tokenId: bigint
  blockNumber: number
  blockTimestamp: number
}

export interface ResolvedProposal {
  proposalId: bigint
  endDate: bigint
  votes: Array<{ voter: string; choice: VoteOption }>
}

export interface GaugesActivityResult {
  stakers: Staker[]
  delegations: ResolvedDelegation[]
  proposals: ResolvedProposal[]
}

// ─── Reward calculation ───────────────────────────────────────────────────────

/** A single reward entry returned by the expected calculator. Mirrors `StakerReward`
 *  from `src/modules/governanceRewards.ts` so deep-equal comparisons work. */
export interface ExpectedReward {
  address: string
  amount: bigint
}
