import { ethers } from 'ethers'
import { getAnvilProvider } from '../helpers/constants'
import { increaseTime, mine, setBalance, setNextBlockTimestamp } from '../helpers/anvilRpc'
import { ctxAs, mintCtx } from '../helpers/ctxToken'
import logger from '@logger'
import type { GaugesDaoDeployment } from './gaugesDaoSetup'

// ── Minimal ABIs ──────────────────────────────────────────────────────────────
const VOTING_ESCROW_ABI = [
  'function createLock(uint256 _value) returns (uint256)',
  // Standard ERC721 Transfer is emitted by the NFT lock contract on mint, not by the escrow,
  // but we read tokenId from the escrow's Deposit event below.
  'event Deposit(address indexed depositor, uint256 indexed tokenId, uint256 indexed startTs, uint256 value, uint256 newTotalLocked)',
] as const

const NFT_LOCK_ABI = ['event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)'] as const

const CLOCK_ABI = [
  'function epochNextCheckpointTs() view returns (uint256)',
  'function EPOCH_DURATION() view returns (uint256)',
  'function CHECKPOINT_INTERVAL() view returns (uint256)',
] as const

const ADAPTER_ABI = [
  // Wallet-level ERC20Votes-style delegate — re-syncs all owned NFTs to the new delegatee.
  'function delegate(address _delegatee)',
  'event TokensDelegated(address indexed sender, address indexed delegatee, uint256[] tokenIds)',
] as const

// TokenVoting v1.4 (Aragon OSx). VoteOption: 0=None, 1=Abstain, 2=Yes, 3=No.
const TOKEN_VOTING_ABI = [
  'function createProposal(bytes _metadata, tuple(address to, uint256 value, bytes data)[] _actions, uint256 _allowFailureMap, uint64 _startDate, uint64 _endDate, uint8 _voteOption, bool _tryEarlyExecution) returns (uint256 proposalId)',
  'function vote(uint256 _proposalId, uint8 _voteOption, bool _tryEarlyExecution)',
  // Indexed proposalId is enough — we read it from the topic.
  'event ProposalCreated(uint256 indexed proposalId, address indexed creator, uint64 startDate, uint64 endDate, bytes metadata, tuple(address to, uint256 value, bytes data)[] actions, uint256 allowFailureMap)',
] as const

export enum VoteOption {
  None = 0,
  Abstain = 1,
  Yes = 2,
  No = 3,
}

// ── Types ─────────────────────────────────────────────────────────────────────
export interface StakerSpec {
  /** CTX amount as a bigint in wei (e.g. ethers.parseEther('1000')). Must fit uint96. */
  amount: bigint
}

/**
 * `from` is the staker index (0-based) doing the delegation.
 * `to` is either another staker index or `'self'` to delegate to themselves.
 * Resolved to addresses internally.
 */
export interface DelegationSpec {
  from: number
  to: number | 'self'
}

export interface Staker {
  wallet: ethers.HDNodeWallet
  amount: bigint
  tokenId: bigint
  /** Lock activation timestamp (snapped to next CHECKPOINT_INTERVAL). */
  startTs: bigint
  /** Address this staker has delegated to (set after delegation pass). undefined = no delegation yet. */
  delegate?: string
}

export interface VoteSpec {
  /** Staker index of the voter (must hold non-zero VP at the snapshot, i.e. be a delegate). */
  from: number
  choice: VoteOption
}

export interface ProposalSpec {
  /** Optional metadata bytes; defaults to '0x'. */
  metadata?: string
  /** Votes to cast on this proposal after creation. */
  votes: VoteSpec[]
  /**
   * Delegations applied AFTER this proposal is created and voted on. Each delegation has
   * `blockTimestamp > proposal.blockTimestamp`, so it does NOT appear in this proposal's snapshot
   * but WILL appear in any later proposal's snapshot. Used to test:
   *   - late delegation (delegator not eligible for the proposal that came before)
   *   - delegate switching (eligible under different delegate for proposals before vs after)
   */
  delegationsAfter?: DelegationSpec[]
}

export interface GaugesActivityConfig {
  stakers: StakerSpec[]
  /** Optional. Each entry is one `adapter.delegate(target)` call from `stakers[from].wallet`. */
  delegations?: DelegationSpec[]
  /** Optional. Each entry is one TokenVoting proposal created by the deployer + a list of votes. */
  proposals?: ProposalSpec[]
}

export interface ResolvedDelegation {
  from: string
  to: string
  tokenId: bigint
  /** Block where this delegation tx was mined. Used by the expected calculator to resolve
   *  the delegation state at any historical timestamp. */
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

// ── Main entry point ──────────────────────────────────────────────────────────

/**
 * Generates on-chain activity against a deployed gauges DAO so the indexer
 * has lock / delegation / proposal / vote events to consume.
 *
 * Base round: stakers + locks only. Delegations, proposals, votes added in
 * subsequent rounds — keep this function additive so each spec can opt in.
 */
export async function runGaugesActivity(
  dep: GaugesDaoDeployment,
  config: GaugesActivityConfig,
): Promise<GaugesActivityResult> {
  const provider = getAnvilProvider()

  // 1. Mint CTX + create wallets
  const stakers: Staker[] = []
  for (let i = 0; i < config.stakers.length; i++) {
    const spec = config.stakers[i]
    const wallet = ethers.Wallet.createRandom().connect(provider)
    await setBalance(wallet.address, 10n ** 18n) // 1 ETH for gas
    await mintCtx(wallet.address, spec.amount)
    stakers.push({ wallet, amount: spec.amount, tokenId: 0n, startTs: 0n })
  }
  logger.info(`runGaugesActivity: minted CTX to ${stakers.length} stakers`)

  // 2. Approve + createLock per staker, capture tokenId from Deposit event
  const escrowReader = new ethers.Contract(dep.votingEscrow, VOTING_ESCROW_ABI, provider)
  const depositTopic = escrowReader.interface.getEvent('Deposit')!.topicHash

  for (const staker of stakers) {
    const ctx = ctxAs(staker.wallet)
    await (await ctx.approve(dep.votingEscrow, staker.amount)).wait()

    const escrow = new ethers.Contract(dep.votingEscrow, VOTING_ESCROW_ABI, staker.wallet)
    const tx = await escrow.createLock(staker.amount)
    const receipt = await tx.wait()

    // Find the Deposit log emitted by the escrow contract.
    const depositLog = receipt!.logs.find(
      (l: ethers.Log) => l.address.toLowerCase() === dep.votingEscrow.toLowerCase() && l.topics[0] === depositTopic,
    )
    if (!depositLog) throw new Error(`createLock: no Deposit event for staker ${staker.wallet.address}`)
    const parsed = escrowReader.interface.parseLog(depositLog)!
    staker.tokenId = parsed.args.tokenId as bigint
    staker.startTs = parsed.args.startTs as bigint
  }

  const maxStartTs = stakers.reduce((m, s) => (s.startTs > m ? s.startTs : m), 0n)
  logger.info(
    `runGaugesActivity: created ${stakers.length} locks (tokenIds=[${stakers.map(s => s.tokenId).join(',')}], maxStartTs=${maxStartTs})`,
  )

  // 3. Warp past the latest lock's activation timestamp so VP becomes non-zero
  //    for every lock. CHECKPOINT_INTERVAL is 1 week per Clock.sol, so worst case
  //    we jump ~1 week. Cheap on anvil.
  const nowTs = (await provider.getBlock('latest'))!.timestamp
  if (maxStartTs > BigInt(nowTs)) {
    await setNextBlockTimestamp(maxStartTs + 1n)
    await mine(1)
    logger.info(`runGaugesActivity: warped past startTs=${maxStartTs}`)
  } else {
    await mine(1)
  }

  // 4. Delegations — each entry is one wallet-level `adapter.delegate(target)` call.
  //    Per ve-governance, this re-syncs all NFTs owned by `from` to point at `target`,
  //    and emits TokensDelegated(sender=from, delegatee=target, tokenIds=[...]) on the adapter.
  //    The indexer's GovernanceVeHandler.delegateTokens reads these into Models.TokenDelegation.
  const delegations: ResolvedDelegation[] = []
  if (config.delegations && config.delegations.length > 0) {
    await applyDelegationBatch(provider, dep, stakers, config.delegations, delegations)
    logger.info(`runGaugesActivity: applied ${delegations.length} initial delegations`)
    // Mine one extra block so any downstream snapshot read sees the delegation
    // checkpoints in the past, not in the same block.
    await mine(1)
  }

  // 5. Proposals + votes on TokenVoting plugin.
  //    Deployer creates each proposal (has ROOT on the DAO + minProposerVotingPower=0
  //    in install data, so no VP gating). Each configured staker then casts a vote.
  //    A staker only has non-zero VP if they hold a lock AND have been delegated to —
  //    so the spec config should pick voters that are delegates in the delegationMap.
  const proposals: ResolvedProposal[] = []
  if (config.proposals && config.proposals.length > 0) {
    const tokenVotingReader = new ethers.Contract(dep.tokenVoting, TOKEN_VOTING_ABI, provider)
    const proposalCreatedTopic = tokenVotingReader.interface.getEvent('ProposalCreated')!.topicHash
    const tokenVoting = new ethers.Contract(dep.tokenVoting, TOKEN_VOTING_ABI, dep.deployerWallet)

    for (const spec of config.proposals) {
      const proposalNow = (await provider.getBlock('latest'))!.timestamp
      const endDate = BigInt(proposalNow) + 5n * 86_400n // +5 days, well past minDuration=3600

      const tx = await tokenVoting.createProposal(
        spec.metadata ?? '0x',
        [], // no actions
        0, // allowFailureMap
        0, // startDate=0 → uses block.timestamp
        endDate,
        VoteOption.None, // proposer doesn't auto-vote
        false, // tryEarlyExecution
      )
      const receipt = await tx.wait()

      const log = receipt!.logs.find(
        (l: ethers.Log) =>
          l.address.toLowerCase() === dep.tokenVoting.toLowerCase() && l.topics[0] === proposalCreatedTopic,
      )
      if (!log) throw new Error('createProposal: no ProposalCreated event')
      const parsed = tokenVotingReader.interface.parseLog(log)!
      const proposalId = parsed.args.proposalId as bigint
      logger.info(`runGaugesActivity: created proposal ${proposalId}`)

      // Mine one block so the snapshot is in the past for the votes that follow.
      await mine(1)

      const castVotes: Array<{ voter: string; choice: VoteOption }> = []
      for (const v of spec.votes) {
        const voter = stakers[v.from]
        if (!voter) throw new Error(`vote: staker index ${v.from} out of range`)
        const voting = new ethers.Contract(dep.tokenVoting, TOKEN_VOTING_ABI, voter.wallet)
        await (await voting.vote(proposalId, v.choice, false)).wait()
        castVotes.push({ voter: voter.wallet.address, choice: v.choice })
      }

      // Late delegations — applied AFTER this proposal is created and voted on. These
      // events have blockTimestamp > proposal.blockTimestamp, so they're invisible to
      // this proposal's snapshot but visible to any subsequent proposal.
      if (spec.delegationsAfter && spec.delegationsAfter.length > 0) {
        await applyDelegationBatch(provider, dep, stakers, spec.delegationsAfter, delegations)
        await mine(1)
        logger.info(
          `runGaugesActivity: applied ${spec.delegationsAfter.length} late delegations after proposal ${proposalId}`,
        )
      }

      proposals.push({ proposalId, endDate, votes: castVotes })
    }

    // Warp past the latest proposal's endDate so it counts as "ended" for the reward calc.
    const maxEnd = proposals.reduce((m, p) => (p.endDate > m ? p.endDate : m), 0n)
    const tsAfter = (await provider.getBlock('latest'))!.timestamp
    if (maxEnd > BigInt(tsAfter)) {
      await setNextBlockTimestamp(maxEnd + 1n)
      await mine(1)
    } else {
      await increaseTime(60)
      await mine(1)
    }
    logger.info(`runGaugesActivity: ${proposals.length} proposals finalized (warped past endDate)`)
  }

  return { stakers, delegations, proposals }
}

/**
 * Apply a batch of `adapter.delegate(target)` calls and append each one to `out` with
 * its on-chain block info. Used by both initial delegations and per-proposal `delegationsAfter`.
 */
async function applyDelegationBatch(
  provider: ethers.JsonRpcProvider,
  dep: GaugesDaoDeployment,
  stakers: Staker[],
  specs: DelegationSpec[],
  out: ResolvedDelegation[],
): Promise<void> {
  for (const spec of specs) {
    const fromStaker = stakers[spec.from]
    if (!fromStaker) throw new Error(`delegations: staker index ${spec.from} out of range`)
    const target = spec.to === 'self' ? fromStaker.wallet.address : stakers[spec.to]?.wallet.address
    if (!target) throw new Error(`delegations: target index ${spec.to} out of range`)

    const adapter = new ethers.Contract(dep.adapter, ADAPTER_ABI, fromStaker.wallet)
    const tx = await adapter.delegate(target)
    const receipt = await tx.wait()
    const block = await provider.getBlock(receipt!.blockNumber)
    fromStaker.delegate = target
    out.push({
      from: fromStaker.wallet.address,
      to: target,
      tokenId: fromStaker.tokenId,
      blockNumber: receipt!.blockNumber,
      blockTimestamp: Number(block!.timestamp),
    })
  }
}
