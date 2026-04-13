import { ethers } from 'ethers'
import { getAnvilProvider } from '../helpers/constants'
import { increaseTime, mine, setBalance, setNextBlockTimestamp } from '../helpers/anvilRpc'
import { ctxAs, mintCtx } from '../helpers/ctxToken'
import logger from '@logger'
import {
  type DelegationSpec,
  type GaugesActivityConfig,
  type GaugesActivityResult,
  type GaugesDaoDeployment,
  type ResolvedDelegation,
  type ResolvedProposal,
  type Staker,
  VoteOption,
} from '../types/gaugesFixture'

// Re-export for callers that import from this module.
export {
  type DelegationSpec,
  type GaugesActivityConfig,
  type GaugesActivityResult,
  type ProposalSpec,
  type ResolvedDelegation,
  type ResolvedProposal,
  type Staker,
  type StakerSpec,
  type VoteSpec,
  VoteOption,
} from '../types/gaugesFixture'

const VOTING_ESCROW_ABI = [
  'function createLock(uint256 _value) returns (uint256)',
  'event Deposit(address indexed depositor, uint256 indexed tokenId, uint256 indexed startTs, uint256 value, uint256 newTotalLocked)',
] as const

const ADAPTER_ABI = [
  'function delegate(address _delegatee)',
  'event TokensDelegated(address indexed sender, address indexed delegatee, uint256[] tokenIds)',
] as const

const ESCROW_VP_ABI = ['function votingPower(uint256 _tokenId) view returns (uint256)'] as const

const TOKEN_VOTING_ABI = [
  'function createProposal(bytes _metadata, tuple(address to, uint256 value, bytes data)[] _actions, uint256 _allowFailureMap, uint64 _startDate, uint64 _endDate, uint8 _voteOption, bool _tryEarlyExecution) returns (uint256 proposalId)',
  'function vote(uint256 _proposalId, uint8 _voteOption, bool _tryEarlyExecution)',
  'event ProposalCreated(uint256 indexed proposalId, address indexed creator, uint64 startDate, uint64 endDate, bytes metadata, tuple(address to, uint256 value, bytes data)[] actions, uint256 allowFailureMap)',
] as const

/**
 * Generates on-chain activity (locks, delegations, proposals, votes) against a deployed
 * gauges DAO so the indexer has events to consume. Each section is opt-in via config.
 */
export async function runGaugesActivity(
  dep: GaugesDaoDeployment,
  config: GaugesActivityConfig,
): Promise<GaugesActivityResult> {
  const provider = getAnvilProvider()

  const stakers: Staker[] = []
  for (let i = 0; i < config.stakers.length; i++) {
    const spec = config.stakers[i]
    const wallet = ethers.Wallet.createRandom().connect(provider)
    await setBalance(wallet.address, 10n ** 18n)
    await mintCtx(wallet.address, spec.amount)
    stakers.push({ wallet, amount: spec.amount, tokenId: 0n, startTs: 0n })
  }
  logger.info(`runGaugesActivity: minted CTX to ${stakers.length} stakers`)

  const escrowReader = new ethers.Contract(dep.votingEscrow, VOTING_ESCROW_ABI, provider)
  const depositTopic = escrowReader.interface.getEvent('Deposit')!.topicHash

  for (const staker of stakers) {
    const ctx = ctxAs(staker.wallet)
    await (await ctx.approve(dep.votingEscrow, staker.amount)).wait()

    const escrow = new ethers.Contract(dep.votingEscrow, VOTING_ESCROW_ABI, staker.wallet)
    const tx = await escrow.createLock(staker.amount)
    const receipt = await tx.wait()

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

  // Warp past the latest lock's startTs so VP becomes non-zero. Worst case ~1 week
  // (CHECKPOINT_INTERVAL in Clock.sol). Cheap on anvil.
  const nowTs = (await provider.getBlock('latest'))!.timestamp
  if (maxStartTs > BigInt(nowTs)) {
    await setNextBlockTimestamp(maxStartTs + 1n)
    await mine(1)
    logger.info(`runGaugesActivity: warped past startTs=${maxStartTs}`)
  } else {
    await mine(1)
  }

  const delegations: ResolvedDelegation[] = []
  if (config.delegations && config.delegations.length > 0) {
    await applyDelegationBatch(provider, dep, stakers, config.delegations, delegations)
    logger.info(`runGaugesActivity: applied ${delegations.length} initial delegations`)
    await mine(1)
  }

  const proposals: ResolvedProposal[] = []
  if (config.proposals && config.proposals.length > 0) {
    const tokenVotingReader = new ethers.Contract(dep.tokenVoting, TOKEN_VOTING_ABI, provider)
    const proposalCreatedTopic = tokenVotingReader.interface.getEvent('ProposalCreated')!.topicHash
    const tokenVoting = new ethers.Contract(dep.tokenVoting, TOKEN_VOTING_ABI, dep.deployerWallet)

    for (const spec of config.proposals) {
      const proposalNow = (await provider.getBlock('latest'))!.timestamp
      const endDate = BigInt(proposalNow) + 5n * 86_400n

      const tx = await tokenVoting.createProposal(spec.metadata ?? '0x', [], 0, 0, endDate, VoteOption.None, false)
      const receipt = await tx.wait()

      const log = receipt!.logs.find(
        (l: ethers.Log) =>
          l.address.toLowerCase() === dep.tokenVoting.toLowerCase() && l.topics[0] === proposalCreatedTopic,
      )
      if (!log) throw new Error('createProposal: no ProposalCreated event')
      const parsed = tokenVotingReader.interface.parseLog(log)!
      const proposalId = parsed.args.proposalId as bigint
      logger.info(`runGaugesActivity: created proposal ${proposalId}`)

      await mine(1)

      const castVotes: Array<{ voter: string; choice: VoteOption }> = []
      for (const v of spec.votes) {
        const voter = stakers[v.from]
        if (!voter) throw new Error(`vote: staker index ${v.from} out of range`)
        const voting = new ethers.Contract(dep.tokenVoting, TOKEN_VOTING_ABI, voter.wallet)
        await (await voting.vote(proposalId, v.choice, false)).wait()
        castVotes.push({ voter: voter.wallet.address, choice: v.choice })
      }

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

async function applyDelegationBatch(
  provider: ethers.JsonRpcProvider,
  dep: GaugesDaoDeployment,
  stakers: Staker[],
  specs: DelegationSpec[],
  out: ResolvedDelegation[],
): Promise<void> {
  const escrowVp = new ethers.Contract(dep.votingEscrow, ESCROW_VP_ABI, provider)
  for (const spec of specs) {
    const fromStaker = stakers[spec.from]
    if (!fromStaker) throw new Error(`delegations: staker index ${spec.from} out of range`)
    const target = spec.to === 'self' ? fromStaker.wallet.address : stakers[spec.to]?.wallet.address
    if (!target) throw new Error(`delegations: target index ${spec.to} out of range`)

    // EscrowIVotesAdapter._delegate reverts with VotingPowerZero(tokenId) if the lock's
    // current voting power is 0 — log it for diagnostics if the call later fails.
    const vp: bigint = await escrowVp.votingPower(fromStaker.tokenId)
    logger.info(
      `delegate: staker[${spec.from}]=${fromStaker.wallet.address} → ${target} (tokenId=${fromStaker.tokenId}, currentVp=${vp})`,
    )

    const adapter = new ethers.Contract(dep.adapter, ADAPTER_ABI, fromStaker.wallet)
    let receipt: ethers.TransactionReceipt | null
    try {
      const tx = await adapter.delegate(target)
      receipt = await tx.wait()
    } catch (err) {
      let decodedReason = '(staticCall succeeded)'
      try {
        await adapter.delegate.staticCall(target)
      } catch (staticErr) {
        const s = staticErr as { shortMessage?: string; reason?: string; data?: string }
        decodedReason = `shortMessage=${s.shortMessage ?? '(none)'} reason=${s.reason ?? '(none)'} data=${s.data ?? '(none)'}`
      }
      throw new Error(
        `delegate failed for staker[${spec.from}]=${fromStaker.wallet.address} → ${target} ` +
          `(tokenId=${fromStaker.tokenId}, currentVp=${vp}): ${(err as Error).message}\n  decoded: ${decodedReason}`,
      )
    }
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
