import { GaugeVoter } from '@artifacts/GaugeVoter'
import { LockERC721 } from '@artifacts/LockERC721'
import { VotingEscrow } from '@artifacts/VotingEscrow'
import GovernanceVeHelper from '@helpers/governanceVe'
import GaugeHelper from '@helpers/gauge'
import Web3Helper from '@helpers/web3'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import { GaugeGovernance } from '@governance/gaugeGovernance'
import logger from '@logger'
import {
  type ActiveVoter,
  type ActiveVotersResult,
  type AttributionResult,
  type DelegationDetail,
  type GaugeVP,
  type HexAddress,
  type IFormattedLog,
  type InvariantCheck,
  type OwnerReward,
  type RewardDistributionParams,
  type RewardDistributionResult,
  type VoterDetail,
  GaugeLogs,
  IVotingEscrowAdapterLogs,
  NetworksEnum,
  TokenTransfer,
} from '@types'
import ProxyWeb3Provider from '@modules/proxyProvider'
import { ZeroAddress } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'modules:veRewardDistribution' })

const VeRewardDistribution = {
  async buildVoterCheckpoints(
    activeVoters: ActiveVoter[],
    hookEnabled: boolean,
    epochStart: number,
    network: NetworksEnum,
  ): Promise<Map<number, ActiveVoter[]>> {
    const votersByBlock = new Map<number, ActiveVoter[]>()

    if (!hookEnabled) {
      const epochBlock = await Web3Helper.findBlockAtTimestamp(epochStart, network)
      votersByBlock.set(epochBlock, activeVoters)
    } else {
      for (const voter of activeVoters) {
        if (!votersByBlock.has(voter.latestBlock)) votersByBlock.set(voter.latestBlock, [])
        votersByBlock.get(voter.latestBlock)!.push(voter)
      }
    }

    return votersByBlock
  },

  replayEvents(
    logs: IFormattedLog[],
    upToBlock: number,
    startIdx: number,
    ownershipMap: Map<string, string>,
    tokenDelegation: Map<string, string>,
  ): number {
    let idx = startIdx
    while (idx < logs.length && logs[idx].info.blockNumber <= upToBlock) {
      const { event } = logs[idx]

      if (event.name === TokenTransfer.Transfer) {
        const from = event.args.from
        const to = event.args.to
        const tokenId = event.args.tokenId.toString()

        if (to === ZeroAddress) {
          ownershipMap.delete(tokenId)
          tokenDelegation.delete(tokenId)
        } else {
          ownershipMap.set(tokenId, to)
          if (from !== ZeroAddress && to !== from) {
            tokenDelegation.delete(tokenId)
          }
        }
      } else if (event.name === IVotingEscrowAdapterLogs.TokensDelegated) {
        const delegatee = event.args.delegatee
        const tokenIds: bigint[] = event.args.tokenIds
        for (const tid of tokenIds) {
          tokenDelegation.set(tid.toString(), delegatee)
        }
      } else if (event.name === IVotingEscrowAdapterLogs.TokensUndelegated) {
        const tokenIds: bigint[] = event.args.tokenIds
        for (const tid of tokenIds) {
          tokenDelegation.delete(tid.toString())
        }
      }

      idx++
    }
    return idx
  },

  getVoterDelegations(
    voterAddress: string,
    ownershipMap: Map<string, string>,
    tokenDelegation: Map<string, string>,
  ): Map<string, string[]> {
    const ownerTokensMap = new Map<string, string[]>()

    for (const [tokenId, delegatee] of tokenDelegation) {
      if (delegatee === voterAddress) {
        const owner = ownershipMap.get(tokenId)
        if (owner) {
          if (!ownerTokensMap.has(owner)) ownerTokensMap.set(owner, [])
          ownerTokensMap.get(owner)!.push(tokenId)
        }
      }
    }

    return ownerTokensMap
  },

  resolveDelegationSources(
    sortedLogs: IFormattedLog[],
    votersByBlock: Map<number, ActiveVoter[]>,
  ): Map<string, Map<string, string[]>> {
    const checkpointBlocks = [...votersByBlock.keys()].sort((a, b) => a - b)

    const ownershipMap = new Map<string, string>()
    const tokenDelegation = new Map<string, string>()
    const delegationMap = new Map<string, Map<string, string[]>>()

    let logIdx = 0

    for (const block of checkpointBlocks) {
      logIdx = VeRewardDistribution.replayEvents(sortedLogs, block, logIdx, ownershipMap, tokenDelegation)

      for (const voter of votersByBlock.get(block)!) {
        delegationMap.set(
          voter.voter,
          VeRewardDistribution.getVoterDelegations(voter.voter, ownershipMap, tokenDelegation),
        )
      }
    }

    return delegationMap
  },

  async attributeVPToOwners(
    activeVoters: ActiveVoter[],
    delegationMap: Map<string, Map<string, string[]>>,
    escrowAddress: HexAddress,
    hookEnabled: boolean,
    epochStart: number,
    network: NetworksEnum,
  ): Promise<AttributionResult> {
    const voterTimestamp = new Map(activeVoters.map(v => [v.voter, v.latestBlockTimestamp]))

    const flatEntries: Array<{ tokenId: string; voter: string; owner: string }> = []
    for (const [voter, ownerMap] of delegationMap) {
      for (const [owner, tokenIds] of ownerMap) {
        for (const tokenId of tokenIds) {
          flatEntries.push({ tokenId, voter, owner })
        }
      }
    }

    const batchParams = flatEntries.map(({ tokenId, voter }) => ({
      escrowAddress,
      tokenId,
      ts: hookEnabled ? voterTimestamp.get(voter)! : epochStart,
    }))

    const vpResults = await Web3BatchHelper.getLockVotingPowerAtInBatch(batchParams, network)

    const voterVPSums = new Map<string, bigint>()
    for (let i = 0; i < flatEntries.length; i++) {
      const { voter } = flatEntries[i]
      voterVPSums.set(voter, (voterVPSums.get(voter) ?? 0n) + vpResults[i].votingPower)
    }

    const ownerCredits = new Map<string, { tokenIds: string[]; votingPower: bigint }>()
    for (let i = 0; i < flatEntries.length; i++) {
      const { owner, tokenId } = flatEntries[i]
      if (!ownerCredits.has(owner)) ownerCredits.set(owner, { tokenIds: [], votingPower: 0n })
      const entry = ownerCredits.get(owner)!
      entry.tokenIds.push(tokenId)
      entry.votingPower += vpResults[i].votingPower
    }

    const ownerRewards: OwnerReward[] = []
    for (const [owner, { tokenIds, votingPower }] of ownerCredits) {
      ownerRewards.push({ owner, tokenIds, votingPower })
    }

    return { ownerRewards, voterVPSums }
  },

  async crawlActiveVoters(
    pluginAddress: HexAddress,
    network: NetworksEnum,
    voteEnd: number,
  ): Promise<ActiveVotersResult | null> {
    const deployData = await ProxyWeb3Provider.fetchContractCreation({ address: pluginAddress, network })
    const voteEndBlock = await Web3Helper.findBlockAtTimestamp(voteEnd, network)

    logger.info(
      'crawlActiveVoters: block range',
      llo({ fromBlock: deployData.blockNumber, toBlock: voteEndBlock, voteEnd }),
    )

    const logs = await Web3Helper.crawlEvents(
      pluginAddress,
      network,
      [GaugeLogs.Voted, GaugeLogs.Reset],
      GaugeVoter.abi,
      deployData.blockNumber,
      voteEndBlock,
    )

    logger.info('crawlActiveVoters: crawled logs', llo({ count: logs?.length ?? 0 }))

    if (!logs || logs.length === 0) {
      return { voters: [], onChainTotal: 0n, maxBlock: 0 }
    }

    const sortedLogs = Web3Helper.sortLogs(logs)

    // For each voter, find their latest tx (by block desc, logIndex desc)
    const voterLatestTx = new Map<string, { txHash: string; block: number; timestamp: number }>()
    for (const log of sortedLogs) {
      const voter = log.event.args.voter as string
      const existing = voterLatestTx.get(voter)
      if (
        !existing ||
        log.info.blockNumber > existing.block ||
        (log.info.blockNumber === existing.block && log.info.logIndex > (existing as any).logIndex)
      ) {
        voterLatestTx.set(voter, {
          txHash: log.info.transactionHash,
          block: log.info.blockNumber,
          timestamp: Number(log.event.args.timestamp),
        })
      }
    }

    // For each voter's latest tx, sum per-gauge VP (latest logIndex per gauge)
    const voters: ActiveVoter[] = []
    for (const [voter, { txHash, block, timestamp }] of voterLatestTx) {
      const txLogs = sortedLogs.filter(l => l.event.args.voter === voter && l.info.transactionHash === txHash)

      // Group by gauge, last event per gauge wins (logs sorted ascending)
      const gaugeVP = new Map<string, bigint>()
      for (const log of txLogs) {
        const gauge = log.event.args.gauge as string
        if (log.event.name === GaugeLogs.Voted) {
          gaugeVP.set(gauge, BigInt(log.event.args.votingPowerCastForGauge))
        } else {
          gaugeVP.set(gauge, 0n)
        }
      }

      let totalVP = 0n
      for (const vp of gaugeVP.values()) totalVP += vp

      if (totalVP > 0n) {
        voters.push({
          voter,
          usedVP: totalVP,
          latestTxHash: txHash,
          latestBlock: block,
          latestBlockTimestamp: timestamp,
        })
      }
    }

    // onChainTotal: from the chronologically last event
    const lastLog = sortedLogs[sortedLogs.length - 1]
    const onChainTotal = BigInt(lastLog.event.args.totalVotingPowerInContract)
    const maxBlock = voters.length > 0 ? Math.max(...voters.map(v => v.latestBlock)) : 0

    voters.sort((a, b) => b.latestBlock - a.latestBlock)

    return { voters, onChainTotal, maxBlock }
  },

  async computeRewardDistribution(params: RewardDistributionParams): Promise<RewardDistributionResult | null> {
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
    const votersData = await VeRewardDistribution.crawlActiveVoters(pluginAddress, network, votingPeriod.voteEnd)

    if (!votersData) {
      logger.error('Failed to fetch active voters data', llo({ epochId }))
      return null
    }

    const { voters: activeVoters, onChainTotal, maxBlock } = votersData
    const totalUsedVP = activeVoters.reduce((sum, v) => sum + v.usedVP, 0n)

    const inv1a: InvariantCheck = {
      name: '1a',
      pass: onChainTotal > 0n && totalUsedVP === onChainTotal,
      detail: `indexed=${totalUsedVP.toString()} event=${onChainTotal.toString()}`,
    }

    const perGaugeVP = await GaugeGovernance.getPerGaugeVP(pluginAddress, network, votingPeriod.voteEnd, targetEpochId)
    const gaugeVPTotal = [...perGaugeVP.values()].reduce((sum, vp) => sum + vp, 0n)

    const gauges: GaugeVP[] = []
    for (const [gauge, votingPower] of perGaugeVP) {
      gauges.push({
        gauge,
        votingPower,
      })
    }

    const inv1b: InvariantCheck = {
      name: '1b',
      pass: gaugeVPTotal === onChainTotal,
      detail: `${perGaugeVP.size} gauges sum=${gaugeVPTotal.toString()} event=${onChainTotal.toString()}`,
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

    const votersByBlock = await VeRewardDistribution.buildVoterCheckpoints(
      activeVoters,
      hookEnabled,
      votingPeriod.epochStart,
      network,
    )

    const delegationMap = VeRewardDistribution.resolveDelegationSources(sortedLogs, votersByBlock)

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

    const { ownerRewards, voterVPSums } = await VeRewardDistribution.attributeVPToOwners(
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

      voterDetails.push({
        voter: v.voter,
        usedVP: v.usedVP,
        tokenVPSum,
        latestBlock: v.latestBlock,
      })

      if (tokenVPSum !== v.usedVP) {
        inv2aFailures.push(`voter=${v.voter} eventUsedVP=${v.usedVP.toString()} tokenVPSum=${tokenVPSum.toString()}`)
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
      pass: totalOwnerVP === onChainTotal,
      detail: `owners=${totalOwnerVP.toString()} event=${onChainTotal.toString()}`,
    }

    const delegations: DelegationDetail[] = []
    for (const [voter, ownerMap] of delegationMap) {
      for (const [owner, tokenIds] of ownerMap) {
        delegations.push({ voter, owner, tokenIds })
      }
    }

    return {
      epoch: epochId,
      writeEpochId: hookEnabled ? 0 : epochId,
      hookEnabled,
      pluginAddress,
      network,
      contractTotal: onChainTotal,
      votingPeriod,
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
  },
}

export default VeRewardDistribution
