import { ethers } from 'ethers'
import { getAnvilProvider } from './constants'
import type { TokenVotingDaoDeployment } from '../types/tokenVotingFixture'

export type TxResult = {
  txHash: string
  blockNumber: number
  blockTimestamp: number
}

const TOKEN_VOTING_ABI = [
  'function createProposal(bytes _metadata, tuple(address to, uint256 value, bytes data)[] _actions, uint256 _allowFailureMap, uint64 _startDate, uint64 _endDate, uint8 _voteOption, bool _tryEarlyExecution) returns (uint256 proposalId)',
  'function vote(uint256 _proposalId, uint8 _voteOption, bool _tryEarlyExecution)',
] as const

const TOKEN_MINT_ABI = ['function mint(address to, uint256 amount)'] as const
const TOKEN_DELEGATE_ABI = ['function delegate(address delegatee)'] as const

async function blockOf(receipt: ethers.TransactionReceipt | null): Promise<TxResult> {
  if (!receipt) throw new Error('tx receipt was null')
  const block = await getAnvilProvider().getBlock(receipt.blockNumber)
  return {
    txHash: receipt.hash,
    blockNumber: receipt.blockNumber,
    blockTimestamp: Number(block!.timestamp),
  }
}

/**
 * Create a TokenVoting proposal. Defaults to no actions and an auto-Yes vote
 * (the typical "register an activity for the proposer" flow).
 */
export async function createProposalTx(
  dep: TokenVotingDaoDeployment,
  opts: {
    signer?: ethers.Signer
    actions?: Array<{ to: string; value: bigint; data: string }>
    voteOption?: number // 1=Abstain, 2=Yes, 3=No (matches VoteOption enum in tests)
    tryEarlyExecution?: boolean
    duration?: bigint // seconds, default 7200
  } = {},
): Promise<TxResult & { proposalId?: bigint }> {
  const provider = getAnvilProvider()
  const signer = opts.signer ?? dep.deployerWallet
  const tokenVoting = new ethers.Contract(dep.tokenVoting, TOKEN_VOTING_ABI, signer)

  const nowTs = (await provider.getBlock('latest'))!.timestamp
  const endDate = BigInt(nowTs) + (opts.duration ?? 7200n)
  const actions = opts.actions ?? []
  const voteOption = opts.voteOption ?? 2 // Yes
  const tryEarlyExecution = opts.tryEarlyExecution ?? true

  const tx = await tokenVoting.createProposal('0x', actions, 0, 0, endDate, voteOption, tryEarlyExecution)
  const receipt = await tx.wait()
  return blockOf(receipt)
}

/**
 * Cast a vote on an existing proposal as `signer`.
 * voteOption: 1=Abstain, 2=Yes, 3=No.
 */
export async function castVoteTx(
  dep: TokenVotingDaoDeployment,
  signer: ethers.Signer,
  proposalId: bigint,
  voteOption: number,
  tryEarlyExecution = false,
): Promise<TxResult> {
  const tokenVoting = new ethers.Contract(dep.tokenVoting, TOKEN_VOTING_ABI, signer)
  const receipt = await (await tokenVoting.vote(proposalId, voteOption, tryEarlyExecution)).wait()
  return blockOf(receipt)
}

/** Mint tokens to `to` via the deployer (admin-controlled DAO can mint via execute path; here we mint as deployer). */
export async function mintTokensTx(dep: TokenVotingDaoDeployment, to: string, amount: bigint): Promise<TxResult> {
  const tokenInterface = new ethers.Interface(TOKEN_MINT_ABI)
  const data = tokenInterface.encodeFunctionData('mint', [to, amount])
  // Mint goes through the AdminPlugin via createProposal in the existing setup.
  // For direct minting in standalone activity tests we route through TokenVoting createProposal
  // with a single mint action and an auto-Yes (deployer has voting power and DAO grants auto-execute).
  return createProposalTx(dep, {
    actions: [{ to: dep.token, value: 0n, data }],
  })
}

/** delegate(delegatee) called from the holder wallet. */
export async function delegateTx(
  dep: TokenVotingDaoDeployment,
  holder: ethers.Signer,
  delegatee: string,
): Promise<TxResult> {
  const token = new ethers.Contract(dep.token, TOKEN_DELEGATE_ABI, holder)
  const receipt = await (await token.delegate(delegatee)).wait()
  return blockOf(receipt)
}
