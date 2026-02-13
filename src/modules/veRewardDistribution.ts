import { LockERC721 } from '@artifacts/LockERC721'
import { VotingEscrow } from '@artifacts/VotingEscrow'
import GovernanceVeHelper from '@helpers/governanceVe'
import GaugeHelper from '@helpers/gauge'
import Web3Helper from '@helpers/web3'
import { GaugeGovernance } from '@governance/gaugeGovernance'
import logger from '@logger'
import {
  type DelegationDetail,
  type GaugeVP,
  type HexAddress,
  type InvariantCheck,
  type RewardDistributionParams,
  type RewardDistributionResult,
  type VoterDetail,
  IVotingEscrowAdapterLogs,
  TokenTransfer,
} from '@types'
import ProxyWeb3Provider from '@modules/proxyProvider'

const llo = logger.logMeta.bind(null, { service: 'modules:veRewardDistribution' })

/**
 * Computes reward distribution for a given epoch following the EXIT_FEE_DISTRIBUTION_SPEC.
 *
 * Steps:
 *   1. Determine active voters from indexed Voted/Reset events
 *   2. Resolve delegation sources per voter at vp_ts[V]
 *   3. Attribute VP to original token owners via votingPowerAt(tokenId, vp_ts[V])
 *
 * Invariants verified (all against on-chain contract state):
 *   1a. SUM(usedVP) == epochTotalVotingPowerCast(writeEpochId)
 *   1b. Per-gauge indexed VP == epochGaugeVotes(writeEpochId, gauge)
 *   2a. Per-voter SUM(tokenVP) == usedVP, cross-checked with adapter getVotes/getPastVotes
 *   2b. No token appears in multiple voters' delegation sets
 *   3.  SUM(owner credit) == epochTotalVotingPowerCast(writeEpochId)
 */
export async function computeRewardDistribution(
  params: RewardDistributionParams,
): Promise<RewardDistributionResult | null> {
  const { epochId, pluginAddress, network } = params

  logger.info('Computing reward distribution', llo({ epochId, pluginAddress, network }))

  const [clockAddress, escrowAddress] = await Promise.all([
    GovernanceVeHelper.getClockAddress(pluginAddress, network),
    GovernanceVeHelper.getEscrowAddress(pluginAddress, network),
  ])

  if (!clockAddress || !escrowAddress) {
    logger.error('Failed to resolve clock or escrow address', llo({ clockAddress, escrowAddress }))
    return null
  }

  const [lockNFTAddress, adapterAddress] = await Promise.all([
    GovernanceVeHelper.getNftLockAddress(escrowAddress, network),
    GaugeHelper.getIVotesAdapterAddress(escrowAddress, network),
  ])

  if (!lockNFTAddress || !adapterAddress) {
    logger.error('Failed to resolve lockNFT or adapter address', llo({ lockNFTAddress, adapterAddress }))
    return null
  }

  const hookEnabled = await GaugeHelper.getEnableUpdateVotingPowerHookFlag(pluginAddress, network)
  const votingPeriod = await GaugeHelper.getVotingPeriodEnd(clockAddress, epochId, network)

  if (!votingPeriod) {
    logger.error('Failed to resolve voting period timing', llo({ epochId }))
    return null
  }

  const targetEpochId = String(epochId)
  const votersData = await GaugeGovernance.getActiveVoters(pluginAddress, network, votingPeriod.voteEnd, targetEpochId)

  if (!votersData) {
    logger.error('Failed to fetch active voters data', llo({ epochId }))
    return null
  }

  const { voters: activeVoters, maxBlock } = votersData
  const totalUsedVP = activeVoters.reduce((sum, v) => sum + v.usedVP, 0n)

  const writeEpochId = hookEnabled ? 0 : epochId
  const contractTotal = await GaugeHelper.epochTotalVotingPowerCast(pluginAddress, writeEpochId, network)

  const inv1a: InvariantCheck = {
    name: '1a',
    pass: contractTotal > 0n && totalUsedVP === contractTotal,
    detail: `indexed=${totalUsedVP.toString()} contract=${contractTotal.toString()}`,
  }

  const perGaugeVP = await GaugeGovernance.getPerGaugeVP(pluginAddress, network, votingPeriod.voteEnd, targetEpochId)
  const gaugeVPTotal = [...perGaugeVP.values()].reduce((sum, vp) => sum + vp, 0n)

  const inv1bFailures: string[] = []
  const gauges: GaugeVP[] = []

  for (const [gauge, indexedVP] of perGaugeVP) {
    const contractGaugeVP = await GaugeHelper.epochGaugeVotes(pluginAddress, writeEpochId, gauge as HexAddress, network)
    if (indexedVP !== contractGaugeVP) {
      inv1bFailures.push(`gauge=${gauge} indexed=${indexedVP.toString()} contract=${contractGaugeVP.toString()}`)
    }
    gauges.push({
      gauge,
      indexedVP,
      contractVP: contractGaugeVP,
      share: contractTotal > 0n ? Number((indexedVP * 10000n) / contractTotal) / 100 : 0,
    })
  }

  const inv1b: InvariantCheck = {
    name: '1b',
    pass: inv1bFailures.length === 0 && gaugeVPTotal === contractTotal,
    detail: `${perGaugeVP.size} gauges`,
    failures: inv1bFailures.length > 0 ? inv1bFailures : undefined,
  }

  const [adapterDeployBlock, nftDeployBlock] = await Promise.all([
    ProxyWeb3Provider.fetchContractCreation({ address: adapterAddress, network }),
    ProxyWeb3Provider.fetchContractCreation({ address: lockNFTAddress, network }),
  ])

  const [delegationLogs, transferLogs] = await Promise.all([
    Web3Helper.crawlEvents(
      adapterAddress,
      network,
      [IVotingEscrowAdapterLogs.TokensDelegated, IVotingEscrowAdapterLogs.TokensUndelegated],
      VotingEscrow.abi,
      adapterDeployBlock.blockNumber,
      maxBlock,
    ),
    Web3Helper.crawlEvents(
      lockNFTAddress,
      network,
      [TokenTransfer.Transfer],
      LockERC721.abi,
      nftDeployBlock.blockNumber,
      maxBlock,
    ),
  ])

  const sortedLogs = Web3Helper.sortLogs([...delegationLogs, ...transferLogs])

  const votersByBlock = await GaugeHelper.buildVoterCheckpoints(
    activeVoters,
    hookEnabled,
    votingPeriod.epochStart,
    network,
  )

  const delegationMap = GaugeHelper.resolveDelegationSources(sortedLogs, votersByBlock)

  const tokenToVoters = new Map<string, string[]>()
  for (const [voter, ownerMap] of delegationMap) {
    for (const [, tokenIds] of ownerMap) {
      for (const tokenId of tokenIds) {
        if (!tokenToVoters.has(tokenId)) tokenToVoters.set(tokenId, [])
        tokenToVoters.get(tokenId)!.push(voter)
      }
    }
  }
  const doubleCountedTokens = [...tokenToVoters.entries()].filter(([, voters]) => voters.length > 1)

  const inv2b: InvariantCheck = {
    name: '2b',
    pass: doubleCountedTokens.length === 0,
    detail: `${tokenToVoters.size} tokens`,
    failures:
      doubleCountedTokens.length > 0
        ? doubleCountedTokens.map(([tid, voters]) => `token=${tid} voters=${voters.join(',')}`)
        : undefined,
  }

  const { ownerRewards, voterVPSums } = await GaugeHelper.attributeVPToOwners(
    activeVoters,
    delegationMap,
    escrowAddress,
    hookEnabled,
    votingPeriod.epochStart,
    network,
  )

  const inv2aFailures: string[] = []
  const voterDetails: VoterDetail[] = []

  for (const v of activeVoters) {
    const tokenVPSum = voterVPSums.get(v.voter) ?? 0n
    const onChainVoterVP = hookEnabled
      ? BigInt(await GaugeHelper.getVotes(v.voter as HexAddress, adapterAddress, network))
      : BigInt(await GaugeHelper.getPastVotes(v.voter as HexAddress, votingPeriod.epochStart, adapterAddress, network))

    voterDetails.push({
      voter: v.voter,
      usedVP: v.usedVP,
      tokenVPSum,
      onChainVP: onChainVoterVP,
      latestBlock: v.latestBlock,
    })

    if (tokenVPSum !== v.usedVP) {
      inv2aFailures.push(
        `voter=${v.voter} dbUsedVP=${v.usedVP.toString()} tokenVPSum=${tokenVPSum.toString()} onChainVP=${onChainVoterVP.toString()}`,
      )
    }
  }

  const inv2a: InvariantCheck = {
    name: '2a',
    pass: inv2aFailures.length === 0,
    detail: `${activeVoters.length - inv2aFailures.length}/${activeVoters.length}`,
    failures: inv2aFailures.length > 0 ? inv2aFailures : undefined,
  }

  let totalOwnerVP = 0n
  for (const r of ownerRewards) totalOwnerVP += r.votingPower

  const inv3: InvariantCheck = {
    name: '3',
    pass: totalOwnerVP === contractTotal,
    detail: `owners=${totalOwnerVP.toString()} contract=${contractTotal.toString()}`,
  }

  const delegations: DelegationDetail[] = []
  for (const [voter, ownerMap] of delegationMap) {
    for (const [owner, tokenIds] of ownerMap) {
      delegations.push({ voter, owner, tokenIds })
    }
  }

  return {
    epoch: epochId,
    writeEpochId,
    hookEnabled,
    pluginAddress,
    network,
    contractTotal,
    addresses: {
      clock: clockAddress,
      escrow: escrowAddress,
      adapter: adapterAddress,
      lockNFT: lockNFTAddress,
    },
    invariants: [inv1a, inv1b, inv2a, inv2b, inv3],
    gauges,
    voters: voterDetails,
    delegations,
    ownerRewards,
  }
}
