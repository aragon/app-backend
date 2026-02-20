import { GaugeVoter } from '@artifacts/GaugeVoter'
import { Models } from '@dbModels'
import GovernanceVeHelper from '@helpers/governanceVe'
import GaugeHelper from '@helpers/gauge'
import Web3Helper from '@helpers/web3'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import { GaugeGovernance } from '@governance/gaugeGovernance'
import logger from '@logger'
import {
  type ActiveVoter,
  type DelegationDetail,
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
import { Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'modules:veRewardDistribution' })

class VeRewardDistribution {
  private readonly pluginAddress: HexAddress
  private readonly network: NetworksEnum
  private readonly epochId: number

  private clockAddress!: HexAddress
  private escrowAddress!: HexAddress
  private adapterAddress!: HexAddress
  private lockNFTAddress!: HexAddress
  private hookEnabled!: boolean
  private votingPeriod!: { epochStart: number; voteEnd: number }

  constructor(params: RewardDistributionParams) {
    this.pluginAddress = params.pluginAddress
    this.network = params.network
    this.epochId = params.epochId
  }

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

  async getActiveVoters(): Promise<ActiveVoter[]> {
    return GaugeGovernance.getActiveVoters(this.pluginAddress, this.network, this.votingPeriod.voteEnd)
  }

  async resolveOnChainTotal(latestTxHash: string): Promise<bigint | null> {
    const receipt = await Web3Helper.getTransactionReceipt(latestTxHash, this.network)
    if (!receipt) return null

    const iFace = new Interface(GaugeVoter.abi)
    const topicHashes = new Set([
      iFace.getEvent(GaugeLogs.Voted)!.topicHash,
      iFace.getEvent(GaugeLogs.Reset)!.topicHash,
    ])

    const voteLogs = receipt.logs
      .filter((log: any) => log.address === this.pluginAddress && topicHashes.has(log.topics[0]))
      .map((log: any) => iFace.parseLog({ topics: log.topics as string[], data: log.data }))

    if (voteLogs.length === 0) return 0n

    return voteLogs[voteLogs.length - 1]!.args.totalVotingPowerInContract
  }

  async resolveRewardEntries(activeVoters: ActiveVoter[], maxBlock: number): Promise<RewardEntry[]> {
    const flatEntries: Array<{ tokenId: string; voter: string; owner: string }> = []

    if (this.hookEnabled) {
      const voterAddresses = activeVoters.map(v => v.voter)
      const globalMaxBlock = Math.max(...activeVoters.map(v => v.latestBlock))
      const groups = await Models.TokenDelegation.getDelegationSnapshots(
        this.adapterAddress,
        this.network,
        voterAddresses,
        globalMaxBlock,
      )

      const groupsByDelegate = new Map<string, typeof groups>()
      for (const group of groups) {
        for (const delegate of group.delegates) {
          if (!groupsByDelegate.has(delegate)) groupsByDelegate.set(delegate, [])
          groupsByDelegate.get(delegate)!.push(group)
        }
      }

      for (const voter of activeVoters) {
        const voterGroups = groupsByDelegate.get(voter.voter) ?? []
        for (const group of voterGroups) {
          const snap = group.snapshots.find((s: any) => s.blockNumber <= voter.latestBlock)
          if (snap && snap.action === 'delegate' && snap.delegate === voter.voter) {
            flatEntries.push({
              tokenId: group.tokenId,
              voter: voter.voter,
              owner: group.delegator,
            })
          }
        }
      }
    } else {
      const voterAddresses = activeVoters.map(v => v.voter)
      const delegations = await Models.TokenDelegation.findActiveDelegationsAtBlock(
        this.adapterAddress,
        this.network,
        voterAddresses,
        maxBlock,
      )

      for (const d of delegations) {
        for (const tokenId of d.tokenIds) {
          flatEntries.push({ tokenId, voter: d.delegate, owner: d.delegator })
        }
      }
    }

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

  computeOwnerRewards(entries: RewardEntry[], onChainTotal: bigint): OwnerReward[] {
    const ownerMap = new Map<string, { tokenIds: string[]; votingPower: bigint }>()
    for (const e of entries) {
      if (!ownerMap.has(e.owner)) ownerMap.set(e.owner, { tokenIds: [], votingPower: 0n })
      ownerMap.get(e.owner)!.tokenIds.push(e.tokenId)
      ownerMap.get(e.owner)!.votingPower += e.votingPower
    }
    return [...ownerMap.entries()].map(([owner, { tokenIds, votingPower }]) => ({
      owner,
      tokenIds,
      votingPower,
      shareBps: onChainTotal > 0n ? (votingPower * 10000n) / onChainTotal : 0n,
    }))
  }

  async compute(): Promise<RewardDistributionResult | null> {
    const ready = await this.init()
    if (!ready) return null

    const activeVoters = await this.getActiveVoters()

    if (activeVoters.length === 0) {
      logger.error('No active voters found', llo({ epochId: this.epochId }))
      return null
    }

    const maxBlock = activeVoters[0].latestBlock
    const onChainTotal = await this.resolveOnChainTotal(activeVoters[0].latestTxHash)
    if (onChainTotal === null) {
      logger.error('Failed to resolve on-chain total VP', llo({ epochId: this.epochId }))
      return null
    }
    const totalUsedVP = activeVoters.reduce((sum, v) => sum + v.usedVP, 0n)

    const inv1a: InvariantCheck = {
      name: '1a',
      pass: onChainTotal > 0n && totalUsedVP === onChainTotal,
      detail: `indexed=${totalUsedVP.toString()} event=${onChainTotal.toString()}`,
    }

    const perGaugeVP = await GaugeGovernance.getPerGaugeVP(this.pluginAddress, this.network, this.votingPeriod.voteEnd)
    const gaugeVPTotal = [...perGaugeVP.values()].reduce((sum, vp) => sum + vp, 0n)

    const gauges: GaugeVP[] = []
    for (const [gauge, votingPower] of perGaugeVP) {
      gauges.push({ gauge, votingPower })
    }

    const inv1b: InvariantCheck = {
      name: '1b',
      pass: gaugeVPTotal === onChainTotal,
      detail: `${perGaugeVP.size} gauges sum=${gaugeVPTotal.toString()} event=${onChainTotal.toString()}`,
    }

    const entries = await this.resolveRewardEntries(activeVoters, maxBlock)

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
    const voterDetails: VoterDetail[] = activeVoters.map(v => {
      const tokenVPSum = voterVPSums.get(v.voter) ?? 0n
      if (tokenVPSum !== v.usedVP) {
        inv2aFailures.push(`voter=${v.voter} eventUsedVP=${v.usedVP.toString()} tokenVPSum=${tokenVPSum.toString()}`)
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
    const inv3: InvariantCheck = {
      name: '3',
      pass: totalOwnerVP === onChainTotal,
      detail: `owners=${totalOwnerVP.toString()} event=${onChainTotal.toString()}`,
    }

    const delegationMap = new Map<string, DelegationDetail>()
    for (const e of entries) {
      const key = `${e.voter}:${e.owner}`
      if (!delegationMap.has(key)) delegationMap.set(key, { voter: e.voter, owner: e.owner, tokenIds: [] })
      delegationMap.get(key)!.tokenIds.push(e.tokenId)
    }

    return {
      epoch: this.epochId,
      writeEpochId: this.hookEnabled ? 0 : this.epochId,
      hookEnabled: this.hookEnabled,
      pluginAddress: this.pluginAddress,
      network: this.network,
      contractTotal: onChainTotal,
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
      delegations: [...delegationMap.values()],
      ownerRewards,
    }
  }
}

export default VeRewardDistribution
