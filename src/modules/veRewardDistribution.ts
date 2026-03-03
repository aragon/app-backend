import config from '@config'
import { GaugeVoter } from '@artifacts/GaugeVoter'
import { Models } from '@dbModels'
import GovernanceVeHelper from '@helpers/governanceVe'
import GaugeHelper from '@helpers/gauge'
import Web3Helper from '@helpers/web3'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import logger from '@logger'
import {
  type ActiveVoter,
  type GaugeVP,
  type HexAddress,
  type InvariantCheck,
  type OwnerReward,
  type RewardDistributionParams,
  type RewardDistributionResult,
  type RewardEntry,
  type VoterDetail,
  GaugeLogs,
  NetworksEnum,
} from '@types'
import { Interface, LogDescription } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'modules:veRewardDistribution' })

class VeRewardDistribution {
  private readonly pluginAddress: HexAddress
  private readonly network: NetworksEnum
  private readonly epochId: number
  private readonly rewardTotalAmount: bigint

  private clockAddress!: HexAddress
  private escrowAddress!: HexAddress
  private adapterAddress!: HexAddress
  private lockNFTAddress!: HexAddress
  private hookEnabled!: boolean
  private votingPeriod!: { epochStart: number; voteEnd: number; epochDuration: number }

  constructor(params: RewardDistributionParams) {
    this.pluginAddress = params.pluginAddress
    this.network = params.network
    this.epochId = params.epochId
    this.rewardTotalAmount = params.rewardTotalAmount
  }

  /** Resolves on-chain contract addresses, hook flag, and voting period timing */
  async init(): Promise<boolean> {
    const [clockAddress, escrowAddress] = await Promise.all([
      GovernanceVeHelper.getClockAddress(this.pluginAddress, this.network),
      GovernanceVeHelper.getEscrowAddress(this.pluginAddress, this.network),
    ])

    if (!clockAddress || !escrowAddress) {
      logger.error('Failed to resolve clock or escrow address', llo({ clockAddress, escrowAddress }))
      return false
    }

    this.clockAddress = clockAddress
    this.escrowAddress = escrowAddress

    const [lockNFTAddress, adapterAddress] = await Promise.all([
      GovernanceVeHelper.getNftLockAddress(escrowAddress, this.network),
      GaugeHelper.getIVotesAdapterAddress(escrowAddress, this.network),
    ])

    if (!lockNFTAddress || !adapterAddress) {
      logger.error('Failed to resolve lockNFT or adapter address', llo({ lockNFTAddress, adapterAddress }))
      return false
    }

    this.lockNFTAddress = lockNFTAddress
    this.adapterAddress = adapterAddress

    this.hookEnabled = await GaugeHelper.getEnableUpdateVotingPowerHookFlag(this.pluginAddress, this.network)

    const votingPeriod = await GaugeHelper.getVotingPeriodEnd(this.clockAddress, this.epochId, this.network)
    if (!votingPeriod) {
      logger.error('Failed to resolve voting period timing', llo({ epochId: this.epochId }))
      return false
    }

    this.votingPeriod = votingPeriod
    return true
  }

  /**
   * Validates that the current time falls within the reward generation window:
   *   [voteEnd + SNAPSHOT_BUFFER, nextEpochStart)
   *
   * Per spec Section 10 (Operational Runbook):
   *   T+6d23h05m backend_snapshot_ts: earliest safe point after voting closes
   *   T+14d next epoch starts — reward generation for this epoch is no longer valid
   */
  validateEpochWindow(): { errorKey: string; message: string } | null {
    const SNAPSHOT_BUFFER = 300
    const now = Math.floor(Date.now() / 1000)
    const backendSnapshotTs = this.votingPeriod.voteEnd + SNAPSHOT_BUFFER
    const nextEpochStart = this.votingPeriod.epochStart + this.votingPeriod.epochDuration

    if (!config.REWARDS.ALLOW_EARLY_REWARD_GENERATION && now < backendSnapshotTs) {
      return {
        errorKey: 'epochVotingNotClosed',
        message: `Epoch ${this.epochId} voting window has not closed yet. Try again in ${backendSnapshotTs - now}s`,
      }
    }

    if (!config.REWARDS.ALLOW_RETROACTIVE_REWARDS && now >= nextEpochStart) {
      return {
        errorKey: 'epochWindowExpired',
        message: `Epoch ${this.epochId} reward generation window has passed (${now - nextEpochStart}s ago)`,
      }
    }

    return null
  }

  /** Extracts Voted/Reset logs from a tx receipt in natural appearance order */
  parseGaugeLogsFromReceipt(receipt: any): Array<{ parsed: LogDescription }> {
    const iFace = new Interface(GaugeVoter.abi)
    const topicHashes = new Set([
      iFace.getEvent(GaugeLogs.Voted)!.topicHash,
      iFace.getEvent(GaugeLogs.Reset)!.topicHash,
    ])

    return receipt.logs
      .filter((log: any) => log.address === this.pluginAddress && topicHashes.has(log.topics[0]))
      .map((log: any) => ({
        parsed: iFace.parseLog({ topics: log.topics as string[], data: log.data }),
      }))
  }

  /** Fetches totalVotingPowerInGauge from the latest tx receipt for each gauge */
  async resolvePerGaugeOnChainTotals(): Promise<Map<string, bigint> | null> {
    const latestDocs = await Models.VoteGauge.getLatestTxPerGauge(
      this.pluginAddress,
      this.network,
      this.votingPeriod.voteEnd,
    )

    const docs = latestDocs as { gaugeAddress: string; transactionHash: string; blockNumber: number }[]
    const gaugeSet = new Set(docs.map(d => d.gaugeAddress))

    const txBlockMap = new Map<string, number>()
    for (const doc of docs) {
      txBlockMap.set(doc.transactionHash, doc.blockNumber)
    }

    const sortedTxHashes = Array.from(txBlockMap.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([txHash]) => txHash)

    const result = new Map<string, bigint>()

    for (const txHash of sortedTxHashes) {
      const receipt = await Web3Helper.getTransactionReceipt(txHash, this.network)
      if (!receipt) return null

      const logs = this.parseGaugeLogsFromReceipt(receipt)
      for (const log of logs) {
        const gauge = log.parsed.args.gauge
        if (gaugeSet.has(gauge)) {
          result.set(gauge, log.parsed.args.totalVotingPowerInGauge)
        }
      }
    }

    return result
  }

  /** Fetches totalVotingPowerInContract from the latest vote tx receipt */
  async resolveOnChainTotal(latestTxHash: string): Promise<bigint | null> {
    const receipt = await Web3Helper.getTransactionReceipt(latestTxHash, this.network)
    if (!receipt) return null

    const logs = this.parseGaugeLogsFromReceipt(receipt)
    if (logs.length === 0) return 0n

    return logs[logs.length - 1].parsed.args.totalVotingPowerInContract
  }

  /** Resolves delegation flat entries and fetches on-chain VP for each token */
  async resolveRewardEntries(activeVoters: ActiveVoter[]): Promise<RewardEntry[]> {
    const voterAddresses = activeVoters.map(v => v.voter)

    const flatEntries = this.hookEnabled
      ? await this.resolveHookDelegations(activeVoters, voterAddresses)
      : await this.resolveLatestDelegations(voterAddresses)

    if (flatEntries.length === 0) return []

    const voterTimestampMap = new Map(activeVoters.map(v => [v.voter, v.latestBlockTimestamp]))
    const batchParams = flatEntries.map(e => ({
      escrowAddress: this.escrowAddress,
      tokenId: e.tokenId,
      ts: this.hookEnabled ? voterTimestampMap.get(e.voter)! : this.votingPeriod.epochStart,
    }))

    const vpResults = await Web3BatchHelper.getLockVotingPowerAtInBatch(batchParams, this.network)

    return flatEntries.map((e, i) => ({
      tokenId: e.tokenId,
      owner: e.owner,
      voter: e.voter,
      votingPower: vpResults[i].votingPower,
    }))
  }

  /** Non-hook path: gets the latest delegation state at epochStart via single aggregation */
  private async resolveLatestDelegations(
    voterAddresses: string[],
  ): Promise<Array<{ tokenId: string; voter: string; owner: string }>> {
    const delegations = await Models.TokenDelegation.getActiveDelegations(
      this.adapterAddress,
      this.network,
      voterAddresses,
      this.votingPeriod.epochStart,
    )

    return delegations.map(d => ({
      tokenId: d.tokenId,
      voter: d.delegate,
      owner: d.delegator,
    }))
  }

  /** Hook path: walks delegation snapshots per-voter using their specific latestBlock */
  private async resolveHookDelegations(
    activeVoters: ActiveVoter[],
    voterAddresses: string[],
  ): Promise<Array<{ tokenId: string; voter: string; owner: string }>> {
    const maxTimestamp = Math.max(...activeVoters.map(v => v.latestBlockTimestamp))
    const groups = await Models.TokenDelegation.getDelegationSnapshots(
      this.adapterAddress,
      this.network,
      voterAddresses,
      maxTimestamp,
    )

    const groupsByDelegate = new Map<string, typeof groups>()
    for (const group of groups) {
      for (const delegate of group.delegates) {
        if (!groupsByDelegate.has(delegate)) groupsByDelegate.set(delegate, [])
        groupsByDelegate.get(delegate)!.push(group)
      }
    }

    const entries: Array<{ tokenId: string; voter: string; owner: string }> = []
    for (const voter of activeVoters) {
      const voterGroups = groupsByDelegate.get(voter.voter) ?? []
      for (const group of voterGroups) {
        const snap = group.snapshots.find((s: any) => s.blockNumber <= voter.latestBlock)
        if (snap && snap.action === 'delegate' && snap.delegate === voter.voter) {
          entries.push({
            tokenId: group.tokenId,
            voter: voter.voter,
            owner: group.delegator,
          })
        }
      }
    }

    return entries
  }

  /** Aggregates entries by owner, computes total VP and reward amount. Dust goes to largest recipient. */
  computeOwnerRewards(entries: RewardEntry[], onChainTotal: bigint): OwnerReward[] {
    const ownerMap = new Map<string, { tokenIds: string[]; votingPower: bigint }>()
    for (const e of entries) {
      if (!ownerMap.has(e.owner)) ownerMap.set(e.owner, { tokenIds: [], votingPower: 0n })
      ownerMap.get(e.owner)!.tokenIds.push(e.tokenId)
      ownerMap.get(e.owner)!.votingPower += e.votingPower
    }

    const rewards = [...ownerMap.entries()].map(([owner, { tokenIds, votingPower }]) => ({
      owner,
      tokenIds,
      votingPower,
      rewardAmount: onChainTotal > 0n ? (votingPower * this.rewardTotalAmount) / onChainTotal : 0n,
    }))

    if (rewards.length > 0 && onChainTotal > 0n) {
      const distributed = rewards.reduce((sum, r) => sum + r.rewardAmount, 0n)
      const dust = this.rewardTotalAmount - distributed
      if (dust > 0n) {
        const largest = rewards.reduce((max, r) => (r.votingPower > max.votingPower ? r : max))
        largest.rewardAmount += dust
      }
    }

    return rewards
  }

  /** Main entry point: resolves active voters, runs invariant checks, and builds reward distribution */
  async compute(): Promise<RewardDistributionResult | { errorKey?: string; error: string } | null> {
    const ready = await this.init()
    if (!ready) return null

    const windowError = this.validateEpochWindow()
    if (windowError) return { errorKey: windowError.errorKey, error: windowError.message }

    const activeVoters = (await Models.VoteGauge.getActiveVoters(
      this.pluginAddress,
      this.network,
      this.votingPeriod.voteEnd,
    )) as ActiveVoter[]

    if (activeVoters.length === 0) {
      return { errorKey: 'epochNoActiveVoters', error: 'No Active Voters' }
    }

    const latestEvent = await Models.VoteGauge.getMostRecentVoteEvent(
      this.pluginAddress,
      this.network,
      this.votingPeriod.voteEnd,
    )

    if (!latestEvent) {
      logger.error('No VoteGauge events found', llo({ epochId: this.epochId }))
      return { error: 'No VoteGauge events found' }
    }

    const onChainTotal = await this.resolveOnChainTotal(latestEvent.transactionHash)
    if (onChainTotal === null) {
      logger.error('Failed to resolve on-chain total VP', llo({ epochId: this.epochId }))
      return { error: 'Failed to resolve on-chain total voting power' }
    }
    const totalUsedVP = activeVoters.reduce((sum, v) => sum + v.usedVP, 0n)

    const inv1a: InvariantCheck = {
      name: '1a',
      pass: onChainTotal > 0n && totalUsedVP === onChainTotal,
      detail: `indexed=${totalUsedVP.toString()} event=${onChainTotal.toString()}`,
    }

    const perGaugeVP = await Models.VoteGauge.getPerGaugeVP(this.pluginAddress, this.network, this.votingPeriod.voteEnd)

    const gauges: GaugeVP[] = []
    for (const [gauge, votingPower] of perGaugeVP) {
      gauges.push({ gauge, votingPower })
    }

    const onChainGaugeTotals = await this.resolvePerGaugeOnChainTotals()
    const inv1bFailures: string[] = []

    if (onChainGaugeTotals) {
      for (const [gauge, indexedVP] of perGaugeVP) {
        const onChainVP = onChainGaugeTotals.get(gauge)
        if (onChainVP === undefined) {
          inv1bFailures.push(`gauge=${gauge} missing on-chain total`)
        } else if (indexedVP !== onChainVP) {
          inv1bFailures.push(`gauge=${gauge} indexed=${indexedVP.toString()} event=${onChainVP.toString()}`)
        }
      }
    } else {
      inv1bFailures.push('failed to fetch per-gauge on-chain totals')
    }

    const inv1b: InvariantCheck = {
      name: '1b',
      pass: inv1bFailures.length === 0,
      detail: `${perGaugeVP.size} gauges checked`,
      failures: inv1bFailures.length > 0 ? inv1bFailures : undefined,
    }

    const entries = await this.resolveRewardEntries(activeVoters)

    const tokenVoters = new Map<string, Set<string>>()
    for (const e of entries) {
      if (!tokenVoters.has(e.tokenId)) tokenVoters.set(e.tokenId, new Set())
      tokenVoters.get(e.tokenId)!.add(e.voter)
    }
    const doubleCountedTokens = [...tokenVoters.entries()].filter(([, v]) => v.size > 1)
    const inv2b: InvariantCheck = {
      name: '2b',
      pass: doubleCountedTokens.length === 0,
      detail: `${tokenVoters.size} tokens`,
      failures:
        doubleCountedTokens.length > 0
          ? doubleCountedTokens.map(([tid, v]) => `token=${tid} voters=${[...v].join(',')}`)
          : undefined,
    }

    const voterVPSums = new Map<string, bigint>()
    for (const e of entries) voterVPSums.set(e.voter, (voterVPSums.get(e.voter) ?? 0n) + e.votingPower)

    const inv2aFailures: string[] = []
    const roundingTolerance = BigInt(perGaugeVP.size)
    const voterDetails: VoterDetail[] = activeVoters.map(v => {
      const tokenVPSum = voterVPSums.get(v.voter) ?? 0n
      const diff = tokenVPSum > v.usedVP ? tokenVPSum - v.usedVP : v.usedVP - tokenVPSum
      if (diff > roundingTolerance) {
        inv2aFailures.push(
          `voter=${v.voter} eventUsedVP=${v.usedVP.toString()} tokenVPSum=${tokenVPSum.toString()} diff=${diff.toString()}`,
        )
      }
      return { voter: v.voter, usedVP: v.usedVP, tokenVPSum, latestBlock: v.latestBlock }
    })

    const inv2a: InvariantCheck = {
      name: '2a',
      pass: inv2aFailures.length === 0,
      detail: `${activeVoters.length - inv2aFailures.length}/${activeVoters.length}`,
      failures: inv2aFailures.length > 0 ? inv2aFailures : undefined,
    }

    const ownerRewards = this.computeOwnerRewards(entries, onChainTotal)

    const totalOwnerVP = ownerRewards.reduce((sum, r) => sum + r.votingPower, 0n)
    const inv3Diff = totalOwnerVP > onChainTotal ? totalOwnerVP - onChainTotal : onChainTotal - totalOwnerVP
    const inv3: InvariantCheck = {
      name: '3a',
      pass: inv3Diff <= roundingTolerance,
      detail: `owners=${totalOwnerVP.toString()} event=${onChainTotal.toString()} diff=${inv3Diff.toString()}`,
    }

    return {
      epoch: this.epochId,
      writeEpochId: this.hookEnabled ? 0 : this.epochId,
      hookEnabled: this.hookEnabled,
      pluginAddress: this.pluginAddress,
      network: this.network,
      contractTotal: onChainTotal,
      rewardTotalAmount: this.rewardTotalAmount,
      votingPeriod: this.votingPeriod,
      addresses: {
        clock: this.clockAddress,
        escrow: this.escrowAddress,
        adapter: this.adapterAddress,
        lockNFT: this.lockNFTAddress,
      },
      invariants: [inv1a, inv1b, inv2a, inv2b, inv3],
      gauges,
      voters: voterDetails,
      ownerRewards,
    }
  }
}

export default VeRewardDistribution
