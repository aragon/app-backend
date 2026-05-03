import type { ethers } from 'ethers'

export interface TokenVotingDaoDeployment {
  dao: string
  tokenVoting: string
  token: string
  deployer: string
  deployerWallet: ethers.HDNodeWallet
}

export interface HolderSpec {
  amount: bigint
}

export type DelegationTarget = 'memberA' | 'memberB' | 'memberC'

export interface DelegationSpec {
  fromHolder: number // index into holders[]
  to: DelegationTarget
}

export interface Erc20DelegationActivityConfig {
  holders: HolderSpec[]
  delegations: DelegationSpec[]
}

export interface ResolvedErc20Delegation {
  from: string
  to: string
  transactionHash: string
  blockNumber: number
  blockTimestamp: number
}

export interface Erc20DelegationActivityResult {
  holders: ethers.HDNodeWallet[]
  members: { memberA: string; memberB: string; memberC: string }
  delegations: ResolvedErc20Delegation[]
}
