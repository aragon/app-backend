import logger from '@logger'
import { ethers } from 'ethers'
import { impersonate, mine, setBalance, setNextBlockTimestamp, stopImpersonate } from '../helpers/anvilRpc'
import { getAnvilProvider } from '../helpers/constants'
import { ctxAs, mintCtx } from '../helpers/ctxToken'
import type { GaugesDaoDeployment } from '../types/gaugesFixture'

// ─── ABIs ────────────────────────────────────────────────────────────────────

const VOTING_ESCROW_ABI = [
  'function createLock(uint256 _value) returns (uint256)',
  'event Deposit(address indexed depositor, uint256 indexed tokenId, uint256 indexed startTs, uint256 value, uint256 newTotalLocked)',
] as const

const ADAPTER_ABI = ['function delegate(address _delegatee)'] as const

const GAUGE_VOTER_ABI = [
  'function createGauge(address _gauge, string _metadataURI) returns (address)',
  'function vote(tuple(uint256 weight, address gauge)[] _votes)',
  'function reset()',
  'function votingActive() view returns (bool)',
  'function epochId() view returns (uint256)',
  'function GAUGE_ADMIN_ROLE() view returns (bytes32)',
] as const

const DAO_ABI = [
  'function grant(address where, address who, bytes32 permissionId)',
  'function ROOT_PERMISSION_ID() view returns (bytes32)',
] as const

// Clock timing constants (hardcoded in ClockV1_2_0)
const EPOCH_DURATION = 1_209_600 // 2 weeks
const VOTE_WINDOW_BUFFER = 3_600 // 1 hour
const VOTE_DURATION = 604_800 // 1 week

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GaugeVoterStaker {
  wallet: ethers.HDNodeWallet
  amount: bigint
  tokenId: bigint
}

export interface GaugeSpec {
  address: string
  metadataURI: string
}

export interface GaugeDelegationSpec {
  from: number
  to: number | 'self'
}

export interface GaugeVoteSpec {
  from: number
  votes: Array<{ gaugeIndex: number; weight: number }>
}

export interface GaugeVotingConfig {
  stakers: Array<{ amount: bigint }>
  delegations?: GaugeDelegationSpec[]
  gauges: GaugeSpec[]
  votes: GaugeVoteSpec[]
}

export interface GaugeVotingResult {
  stakers: GaugeVoterStaker[]
  gaugeAddresses: string[]
  epochId: number
  voteEnd: number
  epochStart: number
  epochDuration: number
}

/** Compute the next voting window start from a given timestamp. */
function nextVoteWindowStart(ts: number): number {
  const epochStart = Math.floor(ts / EPOCH_DURATION) * EPOCH_DURATION
  const voteStart = epochStart + VOTE_WINDOW_BUFFER
  const voteEnd = epochStart + VOTE_DURATION - VOTE_WINDOW_BUFFER

  // If we're before this epoch's vote start, use it
  if (ts < voteStart) return voteStart

  // If we're within the voting window, return current ts (already in window)
  if (ts >= voteStart && ts < voteEnd) return ts

  // Otherwise, jump to next epoch's vote start
  return epochStart + EPOCH_DURATION + VOTE_WINDOW_BUFFER
}

// ─── Lightweight DAO setup (no TokenVoting) ──────────────────────────────────

const FACTORY = '0x0E1a221A2A58B7A91981DE5551999203C391132F'
const MULTISIG_MEMBER = '0x2c763b8760AA5946DB9602a8DE095000D0E292C4'

const FACTORY_ABI = [
  'function deployOnce()',
  'function getDeployment() view returns (tuple(address dao, address multisigPlugin, tuple(address plugin, address curve, address exitQueue, address votingEscrow, address clock, address nftLock, address delegationAdapter)[] gaugeVoterPluginSets, address gaugeVoterPluginRepo))',
]

const MULTISIG_ABI = [
  'function createProposal(bytes metadata, tuple(address to, uint256 value, bytes data)[] actions, uint256 allowFailureMap, bool approveProposal, bool tryExecution, uint64 startDate, uint64 endDate) returns (uint256)',
]

/**
 * Deploys the gauges DAO via factory and grants ROOT to deployer.
 * Skips TokenVoting installation — only what gauge reward tests need.
 */
export async function setupGaugesDaoLight(): Promise<GaugesDaoDeployment> {
  const provider = getAnvilProvider()

  const deployerWallet = ethers.Wallet.createRandom().connect(provider)
  // NonceManager: see tokenVotingDaoSetup.ts for rationale.
  const deployer = new ethers.NonceManager(deployerWallet)
  await setBalance(deployerWallet.address, 10n ** 19n)

  const factory = new ethers.Contract(FACTORY, FACTORY_ABI, deployer)
  logger.info('setupGaugesDaoLight: calling factory.deployOnce()')
  const deployTx = await factory.deployOnce()
  await deployTx.wait()

  const dep = await factory.getDeployment()
  const dao: string = dep.dao
  const multisig: string = dep.multisigPlugin
  const set = dep.gaugeVoterPluginSets[0]
  if (!set.delegationAdapter || set.delegationAdapter === ethers.ZeroAddress) {
    throw new Error('adapter not found')
  }
  logger.info(`setupGaugesDaoLight: dao=${dao} gaugeVoter=${set.plugin} escrow=${set.votingEscrow}`)

  await mine(5, 720)

  // Grant deployer ROOT via multisig proposal
  const daoContract = new ethers.Contract(dao, DAO_ABI, provider)
  const ROOT: string = await daoContract.ROOT_PERMISSION_ID()
  const grantData = daoContract.interface.encodeFunctionData('grant', [dao, deployerWallet.address, ROOT])
  const actions = [{ to: dao, value: 0n, data: grantData }]

  await setBalance(MULTISIG_MEMBER, 10n ** 19n)
  const memberSigner = await impersonate(MULTISIG_MEMBER)
  try {
    const multisigContract = new ethers.Contract(multisig, MULTISIG_ABI, memberSigner)
    const nowTs = (await provider.getBlock('latest'))!.timestamp
    await (await multisigContract.createProposal('0x', actions, 0, true, true, 0, nowTs + 86_400)).wait()
    logger.info('setupGaugesDaoLight: ROOT granted to deployer')
  } finally {
    await stopImpersonate(MULTISIG_MEMBER)
  }

  return {
    dao,
    multisig,
    adapter: set.delegationAdapter,
    deployer: deployerWallet.address,
    deployerWallet,
    deployerSigner: deployer,
    tokenVoting: ethers.ZeroAddress, // not installed
    votingEscrow: set.votingEscrow,
    nftLock: set.nftLock,
    clock: set.clock,
    exitQueue: set.exitQueue,
    curve: set.curve,
    gaugeVoter: set.plugin,
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function runGaugeVotingActivity(
  dep: GaugesDaoDeployment,
  config: GaugeVotingConfig,
): Promise<GaugeVotingResult> {
  const provider = getAnvilProvider()

  // ── 1. Create stakers with locks ─────────────────────────────────────────
  const stakers: GaugeVoterStaker[] = []
  const escrow = new ethers.Contract(dep.votingEscrow, VOTING_ESCROW_ABI, provider)
  const depositTopic = escrow.interface.getEvent('Deposit')!.topicHash

  for (const spec of config.stakers) {
    const wallet = ethers.Wallet.createRandom().connect(provider)
    await setBalance(wallet.address, 10n ** 18n)
    await mintCtx(wallet.address, spec.amount)

    const ctx = ctxAs(wallet)
    await (await ctx.approve(dep.votingEscrow, spec.amount)).wait()

    const escrowWriter = new ethers.Contract(dep.votingEscrow, VOTING_ESCROW_ABI, wallet)
    const tx = await escrowWriter.createLock(spec.amount)
    const receipt = await tx.wait()

    const depositLog = receipt!.logs.find(
      (l: ethers.Log) => l.address.toLowerCase() === dep.votingEscrow.toLowerCase() && l.topics[0] === depositTopic,
    )
    if (!depositLog) throw new Error(`createLock: no Deposit event for staker ${wallet.address}`)
    const parsed = escrow.interface.parseLog(depositLog)!
    stakers.push({ wallet, amount: spec.amount, tokenId: parsed.args.tokenId as bigint })
  }
  logger.info(`gaugeVotingActivity: created ${stakers.length} locks`)

  // ── 2. Warp to next voting window (also ensures VP is non-zero) ──────────
  // Lock VP becomes non-zero after startTs (checkpoint interval = 1 week).
  // Warping to the next voting window start (which is always >= 1 hour into an epoch)
  // guarantees enough time has passed.
  const nowTs = (await provider.getBlock('latest'))!.timestamp
  const targetVoteStart = nextVoteWindowStart(nowTs + 7 * 86_400) // at least 1 week forward
  await setNextBlockTimestamp(targetVoteStart + 1)
  await mine(1)

  const gaugeVoter = new ethers.Contract(dep.gaugeVoter, GAUGE_VOTER_ABI, provider)
  const isActive = await gaugeVoter.votingActive()
  logger.info(`gaugeVotingActivity: warped to ${targetVoteStart + 1}, votingActive=${isActive}`)
  if (!isActive) throw new Error('votingActive() is false after warp — timing bug')

  // ── 3. Apply delegations ─────────────────────────────────────────────────
  const delegationSpecs: GaugeDelegationSpec[] = config.delegations ?? stakers.map((_, i) => ({ from: i, to: 'self' }))

  for (const spec of delegationSpecs) {
    const fromStaker = stakers[spec.from]
    if (!fromStaker) throw new Error(`delegation: staker index ${spec.from} out of range`)
    const target = spec.to === 'self' ? fromStaker.wallet.address : stakers[spec.to]?.wallet.address
    if (!target) throw new Error(`delegation: target index ${spec.to} out of range`)

    const adapter = new ethers.Contract(dep.adapter, ADAPTER_ABI, fromStaker.wallet)
    await (await adapter.delegate(target)).wait()
  }
  await mine(1)
  logger.info(`gaugeVotingActivity: applied ${delegationSpecs.length} delegations`)

  // ── 4. Grant GAUGE_ADMIN_ROLE and register gauges ────────────────────────
  // Use the fixture's NonceManager-wrapped signer so nonces are tracked locally
  // and never collide with stale "pending" reads from anvil's --block-time mempool.
  const admin = dep.deployerSigner

  const GAUGE_ADMIN_ROLE: string = await gaugeVoter.GAUGE_ADMIN_ROLE()
  const daoContract = new ethers.Contract(dep.dao, DAO_ABI, admin)
  await (await daoContract.grant(dep.gaugeVoter, dep.deployer, GAUGE_ADMIN_ROLE)).wait()

  const gaugeAddresses: string[] = []
  const gaugeVoterWriter = new ethers.Contract(dep.gaugeVoter, GAUGE_VOTER_ABI, admin)
  for (const gauge of config.gauges) {
    await (await gaugeVoterWriter.createGauge(gauge.address, gauge.metadataURI)).wait()
    gaugeAddresses.push(gauge.address)
  }
  await mine(1)
  logger.info(`gaugeVotingActivity: registered ${gaugeAddresses.length} gauges`)

  // ── 5. Cast gauge votes (AddressGaugeVoter: voter = msg.sender, VP from ivotesAdapter)
  for (const voteSpec of config.votes) {
    const staker = stakers[voteSpec.from]
    if (!staker) throw new Error(`vote: staker index ${voteSpec.from} out of range`)

    const gaugeVotes = voteSpec.votes.map(v => ({
      weight: BigInt(v.weight),
      gauge: gaugeAddresses[v.gaugeIndex],
    }))

    const voterContract = new ethers.Contract(dep.gaugeVoter, GAUGE_VOTER_ABI, staker.wallet)
    await (await voterContract.vote(gaugeVotes)).wait()
    logger.info(`gaugeVotingActivity: staker[${voteSpec.from}] voted on ${gaugeVotes.length} gauges`)
  }
  await mine(1)

  // ── 6. Record epoch info, then warp past voting end ──────────────────────
  const epochId = Number(await gaugeVoter.epochId())
  const epochStart = epochId * EPOCH_DURATION
  const voteEnd = epochStart + VOTE_DURATION - VOTE_WINDOW_BUFFER

  await setNextBlockTimestamp(voteEnd + 301) // past voteEnd + SNAPSHOT_BUFFER (300s)
  await mine(1)
  logger.info(`gaugeVotingActivity: warped past voteEnd (epoch ${epochId}, voteEnd=${voteEnd})`)

  return {
    stakers,
    gaugeAddresses,
    epochId,
    voteEnd,
    epochStart,
    epochDuration: EPOCH_DURATION,
  }
}
