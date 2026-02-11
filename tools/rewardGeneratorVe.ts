import { Models } from '@dbModels'
import { GaugeVoter } from '@artifacts/GaugeVoter'
import { VotingEscrow } from '@artifacts/VotingEscrow'
import { LockERC721 } from '@artifacts/LockERC721'
import { retryRequest } from '@helpers/retryRequest'
import Web3BatchHelper from '@helpers/web3BatchHelper'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import { BlockchainLogCrawler } from '@modules/crawlers'
import ProviderModule from '@modules/provider'
import {
  EnumConnection,
  type HexAddress,
  type IFormattedLog,
  type IService,
  IVotingEscrowAdapterLogs,
  NetworksEnum,
} from '@types'
import { Contract, Interface } from 'ethers'
import ProxyProvider from '@modules/proxyProvider'

const llo = logger.logMeta.bind(null, { service: 'tool:rewardGeneratorVe' })

const PLUGIN_ADDRESS: HexAddress =
  (process.env.PLUGIN_ADDRESS as HexAddress) || '0x19513f8bFE5dC3AEAF12280C9C8DA25204c334b9'

function resolveNetwork(env?: string): NetworksEnum {
  if (!env) return NetworksEnum.katanaMainnet
  if (env in NetworksEnum) return NetworksEnum[env as keyof typeof NetworksEnum]
  return env as NetworksEnum
}

const NETWORK = resolveNetwork(process.env.NETWORK)
const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000'

const CLOCK_ABI = [
  {
    inputs: [],
    name: 'epochDuration',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'voteDuration',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'currentEpoch',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  {
    inputs: [],
    name: 'voteWindowBuffer',
    outputs: [{ name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
]

// ── On-chain helpers ────────────────────────────────────────────────────────

async function getClockAddress(pluginAddress: HexAddress, network: NetworksEnum): Promise<HexAddress> {
  const provider = ProviderModule.getAnyRpcProvider(network)
  const contract = new Contract(pluginAddress, GaugeVoter.abi, provider)
  return await retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => contract.clock()))
}

async function getEscrowAddress(pluginAddress: HexAddress, network: NetworksEnum): Promise<HexAddress> {
  const provider = ProviderModule.getAnyRpcProvider(network)
  const contract = new Contract(pluginAddress, GaugeVoter.abi, provider)
  return await retryRequest(async () =>
    BottleneckModule.getNodeLimiter(network).schedule(async () => contract.escrow()),
  )
}

async function getLockNFTAddress(escrowAddress: HexAddress, network: NetworksEnum): Promise<HexAddress> {
  const provider = ProviderModule.getAnyRpcProvider(network)
  const contract = new Contract(escrowAddress, VotingEscrow.abi, provider)
  return await retryRequest(async () =>
    BottleneckModule.getNodeLimiter(network).schedule(async () => contract.lockNFT()),
  )
}

async function getIVotesAdapterAddress(escrowAddress: HexAddress, network: NetworksEnum): Promise<HexAddress> {
  const abi = ['function ivotesAdapter() view returns (address)']
  const provider = ProviderModule.getAnyRpcProvider(network)
  const contract = new Contract(escrowAddress, abi, provider)
  return await retryRequest(async () =>
    BottleneckModule.getNodeLimiter(network).schedule(async () => contract.ivotesAdapter()),
  )
}

async function getEpochTiming(clockAddress: HexAddress, network: NetworksEnum) {
  const provider = ProviderModule.getAnyRpcProvider(network)
  const clock = new Contract(clockAddress, CLOCK_ABI, provider)

  const [epochDuration, voteDuration, currentEpoch, voteWindowBuffer] = await Promise.all([
    retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => clock.epochDuration())),
    retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => clock.voteDuration())),
    retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => clock.currentEpoch())),
    retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => clock.voteWindowBuffer())),
  ])

  return {
    epochDuration: Number(epochDuration),
    voteDuration: Number(voteDuration),
    currentEpoch: Number(currentEpoch),
    voteWindowBuffer: Number(voteWindowBuffer),
  }
}

function computeVoteEnd(epochId: number, epochDuration: number, voteDuration: number, buffer: number): number {
  return epochId * epochDuration + voteDuration - buffer
}

async function getEnableUpdateVotingPowerHook(pluginAddress: HexAddress, network: NetworksEnum): Promise<boolean> {
  const abi = ['function enableUpdateVotingPowerHook() view returns (bool)']
  const provider = ProviderModule.getAnyRpcProvider(network)
  const contract = new Contract(pluginAddress, abi, provider)
  try {
    return await retryRequest(async () =>
      BottleneckModule.getNodeLimiter(network).schedule(async () => contract.enableUpdateVotingPowerHook()),
    )
  } catch {
    return false
  }
}

// ── Step 1: Determine Active Voters from DB ─────────────────────────────────

interface ActiveVoter {
  voter: string
  usedVP: bigint
  latestTxHash: string
  latestBlock: number
  latestBlockTimestamp: number
}

interface Step1Result {
  voters: ActiveVoter[]
  onChainTotal: bigint
  maxBlock: number
}

async function getActiveVoters(
  pluginAddress: HexAddress,
  network: NetworksEnum,
  voteEnd: number,
): Promise<Step1Result> {
  const memberVotes = await Models.VoteGauge.aggregate([
    {
      $match: {
        pluginAddress,
        network,
        blockTimestamp: { $lte: voteEnd },
      },
    },
    { $sort: { blockNumber: -1, logIndex: -1 } },
    {
      $group: {
        _id: '$memberAddress',
        latestTxHash: { $first: '$transactionHash' },
        latestBlock: { $first: '$blockNumber' },
        latestBlockTimestamp: { $first: '$blockTimestamp' },
      },
    },
    {
      $lookup: {
        from: 'VoteGauge',
        let: { member: '$_id', txHash: '$latestTxHash' },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ['$memberAddress', '$$member'] },
                  { $eq: ['$transactionHash', '$$txHash'] },
                  { $eq: ['$pluginAddress', pluginAddress] },
                  { $eq: ['$network', network] },
                ],
              },
            },
          },
          { $sort: { logIndex: -1 } },
          {
            $group: {
              _id: '$gaugeAddress',
              votingPower: { $first: '$votingPower' },
              logIndex: { $first: '$logIndex' },
            },
          },
        ],
        as: 'votes',
      },
    },
    { $unwind: '$votes' },
    {
      $group: {
        _id: '$_id',
        totalVotingPower: {
          $sum: { $toDecimal: '$votes.votingPower' },
        },
        latestBlock: { $first: '$latestBlock' },
        latestTxHash: { $first: '$latestTxHash' },
        latestBlockTimestamp: { $first: '$latestBlockTimestamp' },
        gaugeCount: { $sum: 1 },
      },
    },
  ])

  const voters: ActiveVoter[] = []
  let maxBlock = 0
  for (const vote of memberVotes) {
    const vp = BigInt(vote.totalVotingPower.toString().split('.')[0])
    if (vp === 0n) continue
    if (vote.latestBlock > maxBlock) maxBlock = vote.latestBlock
    voters.push({
      voter: vote._id,
      usedVP: vp,
      latestTxHash: vote.latestTxHash,
      latestBlock: vote.latestBlock,
      latestBlockTimestamp: vote.latestBlockTimestamp,
    })
  }

  // On-chain verification: get totalVotingPowerInContract from the latest event receipt
  const latestVote = await Models.VoteGauge.findOne({
    pluginAddress,
    network,
    blockTimestamp: { $lte: voteEnd },
  }).sort({ blockNumber: -1, logIndex: -1 })

  let onChainTotal = 0n
  if (latestVote) {
    if (latestVote.blockNumber > maxBlock) maxBlock = latestVote.blockNumber

    const provider = ProviderModule.getAnyRpcProvider(network)
    const receipt = await retryRequest(async () =>
      BottleneckModule.getNodeLimiter(network).schedule(async () =>
        provider.getTransactionReceipt(latestVote.transactionHash),
      ),
    )

    if (receipt) {
      const iface = new Interface(GaugeVoter.abi)
      const pluginLogs = receipt.logs.filter((log: any) => log.address.toLowerCase() === pluginAddress.toLowerCase())

      for (const log of pluginLogs) {
        try {
          const parsed = iface.parseLog({ topics: log.topics as string[], data: log.data })
          if (parsed && (parsed.name === 'Voted' || parsed.name === 'Reset')) {
            onChainTotal = parsed.args.totalVotingPowerInContract
          }
        } catch {
          // skip non-matching logs
        }
      }
    }
  }

  return { voters, onChainTotal, maxBlock }
}

// ── Step 2: Crawl Delegation + Ownership events ─────────────────────────────

async function crawlDelegationEvents(
  adapterAddress: HexAddress,
  network: NetworksEnum,
  fromBlock: number,
  toBlock: number,
): Promise<Map<string, { delegator: string; voter: string }>> {
  const escrowIface = new Interface(VotingEscrow.abi)
  const delegatedTopic = escrowIface.getEvent(IVotingEscrowAdapterLogs.TokensDelegated)?.topicHash!
  const undelegatedTopic = escrowIface.getEvent(IVotingEscrowAdapterLogs.TokensUndelegated)?.topicHash!

  logger.info('Crawling delegation events', llo({ adapterAddress, fromBlock, toBlock }))

  const crawler = new BlockchainLogCrawler({
    skipLogProcessing: true,
    fromBlock,
    toBlock,
    logService: null,
    network,
    address: adapterAddress,
    stopOnError: false,
    onError: async (error: any) => logger.error('Error crawling delegation events', llo({ error })),
    events: [
      {
        event: IVotingEscrowAdapterLogs.TokensDelegated,
        topic: delegatedTopic,
        enableHistorical: false,
        config: [{ abi: VotingEscrow.abi, handler: async () => {} }],
      },
      {
        event: IVotingEscrowAdapterLogs.TokensUndelegated,
        topic: undelegatedTopic,
        enableHistorical: false,
        config: [{ abi: VotingEscrow.abi, handler: async () => {} }],
      },
    ],
  })

  const logs = (await crawler.crawl()) as IFormattedLog[] | undefined
  logger.info('Delegation crawl done', llo({ logsCount: logs?.length ?? 0 }))

  const delegationMap = new Map<string, { delegator: string; voter: string }>()

  if (logs) {
    logs.sort((a, b) => a.info.blockNumber - b.info.blockNumber || a.info.logIndex - b.info.logIndex)

    for (const log of logs) {
      const { event } = log
      if (!event) continue
      if (event.name === 'TokensDelegated') {
        const sender = event.args.sender.toLowerCase()
        const delegatee = event.args.delegatee.toLowerCase()
        const tokenIds: bigint[] = event.args.tokenIds
        for (const tokenId of tokenIds) {
          delegationMap.set(tokenId.toString(), { delegator: sender, voter: delegatee })
        }
      } else if (event.name === 'TokensUndelegated') {
        const tokenIds: bigint[] = event.args.tokenIds
        for (const tokenId of tokenIds) {
          delegationMap.delete(tokenId.toString())
        }
      }
    }
  }

  return delegationMap
}

async function crawlTransferEvents(
  lockNFTAddress: HexAddress,
  network: NetworksEnum,
  fromBlock: number,
  toBlock: number,
): Promise<Map<string, string>> {
  const lockIface = new Interface(LockERC721.abi)
  const transferTopic = lockIface.getEvent('Transfer')?.topicHash!

  logger.info('Crawling transfer events', llo({ lockNFTAddress, fromBlock, toBlock }))

  const crawler = new BlockchainLogCrawler({
    skipLogProcessing: true,
    fromBlock,
    toBlock,
    logService: null,
    network,
    address: lockNFTAddress,
    stopOnError: false,
    onError: async (error: any) => logger.error('Error crawling transfer events', llo({ error })),
    events: [
      {
        event: 'Transfer',
        topic: transferTopic,
        enableHistorical: false,
        config: [{ abi: LockERC721.abi, handler: async () => {} }],
      },
    ],
  })

  const logs = (await crawler.crawl()) as IFormattedLog[] | undefined
  logger.info('Transfer crawl done', llo({ logsCount: logs?.length ?? 0 }))

  const ownershipMap = new Map<string, string>()

  if (logs) {
    logs.sort((a, b) => a.info.blockNumber - b.info.blockNumber || a.info.logIndex - b.info.logIndex)

    for (const log of logs) {
      const { event } = log
      if (!event) continue
      if (event.name === 'Transfer') {
        const to = event.args.to.toLowerCase()
        const tokenId = event.args.tokenId.toString()
        if (to === ZERO_ADDRESS) {
          ownershipMap.delete(tokenId)
        } else {
          ownershipMap.set(tokenId, to)
        }
      }
    }
  }

  return ownershipMap
}

// ── Step 3: Attribute VP to Owners ──────────────────────────────────────────

interface OwnerReward {
  owner: string
  tokenIds: string[]
  votingPower: bigint
}

async function attributeVPToOwners(
  activeVoters: ActiveVoter[],
  delegationMap: Map<string, { delegator: string; voter: string }>,
  ownershipMap: Map<string, string>,
  escrowAddress: HexAddress,
  hookEnabled: boolean,
  epochStart: number,
  network: NetworksEnum,
): Promise<{ ownerRewards: OwnerReward[]; invariant2Failures: string[] }> {
  const activeVoterSet = new Set(activeVoters.map(v => v.voter.toLowerCase()))
  const voterUsedVP = new Map(activeVoters.map(v => [v.voter.toLowerCase(), v.usedVP]))
  const voterTimestamp = new Map(activeVoters.map(v => [v.voter.toLowerCase(), v.latestBlockTimestamp]))

  // voter -> (owner -> tokenIds[])
  const voterTokens = new Map<string, Map<string, string[]>>()

  for (const [tokenId, { voter }] of delegationMap) {
    if (!activeVoterSet.has(voter)) continue

    const owner = ownershipMap.get(tokenId)
    if (!owner) continue

    if (!voterTokens.has(voter)) voterTokens.set(voter, new Map())
    const ownerMap = voterTokens.get(voter)!
    if (!ownerMap.has(owner)) ownerMap.set(owner, [])
    ownerMap.get(owner)!.push(tokenId)
  }

  // Collect all relevant token IDs for batch VP fetch with per-voter timestamps
  const batchParams: Array<{ escrowAddress: HexAddress; tokenId: string; ts: number }> = []
  for (const [tokenId, { voter }] of delegationMap) {
    if (activeVoterSet.has(voter) && ownershipMap.has(tokenId)) {
      const ts = hookEnabled ? voterTimestamp.get(voter)! : epochStart
      batchParams.push({ escrowAddress, tokenId, ts })
    }
  }

  logger.info('Fetching VP for tokens', llo({ count: batchParams.length, hookEnabled, epochStart }))

  const vpResults = await Web3BatchHelper.getLockVotingPowerAtInBatch(batchParams, network)

  const tokenVPMap = new Map<string, bigint>()
  for (const result of vpResults) {
    tokenVPMap.set(result.tokenId, result.votingPower)
  }

  // INVARIANT 2: per-voter, SUM(votingPowerAt(tokenId)) == usedVP[voter]
  const invariant2Failures: string[] = []
  for (const voter of activeVoterSet) {
    const expectedVP = voterUsedVP.get(voter)!
    let sumTokenVP = 0n
    const ownerMap = voterTokens.get(voter)
    if (ownerMap) {
      for (const [, tokenIds] of ownerMap) {
        for (const tokenId of tokenIds) {
          sumTokenVP += tokenVPMap.get(tokenId) ?? 0n
        }
      }
    }
    if (sumTokenVP !== expectedVP) {
      invariant2Failures.push(`voter=${voter} expected=${expectedVP.toString()} got=${sumTokenVP.toString()}`)
    }
  }

  // Credit VP to owners
  const ownerCredits = new Map<string, { tokenIds: string[]; votingPower: bigint }>()
  for (const [, ownerMap] of voterTokens) {
    for (const [owner, tokenIds] of ownerMap) {
      if (!ownerCredits.has(owner)) ownerCredits.set(owner, { tokenIds: [], votingPower: 0n })
      const entry = ownerCredits.get(owner)!
      for (const tokenId of tokenIds) {
        entry.tokenIds.push(tokenId)
        entry.votingPower += tokenVPMap.get(tokenId) ?? 0n
      }
    }
  }

  const ownerRewards: OwnerReward[] = []
  for (const [owner, { tokenIds, votingPower }] of ownerCredits) {
    ownerRewards.push({ owner, tokenIds, votingPower })
  }

  return { ownerRewards, invariant2Failures }
}

// ── Main ────────────────────────────────────────────────────────────────────

export const RewardGeneratorVe: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    logger.info('Starting RewardGeneratorVe', llo({ pluginAddress: PLUGIN_ADDRESS, network: NETWORK }))

    // ── Resolve contract addresses ──
    const [clockAddress, escrowAddress] = await Promise.all([
      getClockAddress(PLUGIN_ADDRESS, NETWORK),
      getEscrowAddress(PLUGIN_ADDRESS, NETWORK),
    ])
    const [lockNFTAddress, adapterAddress] = await Promise.all([
      getLockNFTAddress(escrowAddress, NETWORK),
      getIVotesAdapterAddress(escrowAddress, NETWORK),
    ])
    logger.info('Contract addresses', llo({ clockAddress, escrowAddress, adapterAddress, lockNFTAddress }))

    // ── Epoch timing + hook flag ──
    const [epochTiming, hookEnabled] = await Promise.all([
      getEpochTiming(clockAddress, NETWORK),
      getEnableUpdateVotingPowerHook(PLUGIN_ADDRESS, NETWORK),
    ])
    const { epochDuration, voteDuration, currentEpoch, voteWindowBuffer } = epochTiming
    logger.info('Epoch timing', llo({ epochDuration, voteDuration, currentEpoch, voteWindowBuffer, hookEnabled }))

    const targetEpoch = currentEpoch
    const voteEnd = computeVoteEnd(targetEpoch, epochDuration, voteDuration, voteWindowBuffer)
    const epochStart = targetEpoch * epochDuration
    const now = Math.floor(Date.now() / 1000)

    logger.info(
      'Target epoch',
      llo({
        targetEpoch,
        voteEnd,
        voteEndDate: new Date(voteEnd * 1000).toISOString(),
        epochStart,
        epochStartDate: new Date(epochStart * 1000).toISOString(),
        hookEnabled,
        votingEnded: now > voteEnd,
      }),
    )

    if (now <= voteEnd) {
      logger.error('Voting has not ended yet for this epoch', llo({ targetEpoch, voteEnd }))
      return
    }

    // ── Step 1: Active Voters from DB ──
    logger.info('Step 1: Determining active voters from DB...')
    const { voters: activeVoters, onChainTotal, maxBlock } = await getActiveVoters(PLUGIN_ADDRESS, NETWORK, voteEnd)

    let totalUsedVP = 0n
    for (const v of activeVoters) totalUsedVP += v.usedVP

    logger.info(
      'Step 1 result',
      llo({
        activeVoters: activeVoters.length,
        totalUsedVP: totalUsedVP.toString(),
        onChainTotal: onChainTotal.toString(),
        maxBlock,
      }),
    )

    // INVARIANT 1
    const inv1Pass = onChainTotal > 0n && totalUsedVP === onChainTotal
    logger.info(`INVARIANT 1: ${inv1Pass ? 'PASS' : 'FAIL'}  SUM(usedVP) == on-chain total`)

    if (!inv1Pass) {
      logger.error(
        'INVARIANT 1 FAILED — aborting',
        llo({ totalUsedVP: totalUsedVP.toString(), onChainTotal: onChainTotal.toString() }),
      )
      return
    }

    // ── Step 2: Crawl delegation + ownership from deployment block to maxBlock ──
    logger.info('Step 2: Crawling delegation and transfer events...')
    const crawlTo = maxBlock + 1

    const [adapterDepInfo, lockNFTDepInfo] = await Promise.all([
      ProxyProvider.fetchContractCreation({ address: adapterAddress, network: NETWORK }),
      ProxyProvider.fetchContractCreation({ address: lockNFTAddress, network: NETWORK }),
    ])
    const adapterFromBlock = adapterDepInfo?.blockNumber ?? 0
    const lockNFTFromBlock = lockNFTDepInfo?.blockNumber ?? 0
    logger.info('Deployment blocks', llo({ adapter: adapterFromBlock, lockNFT: lockNFTFromBlock }))

    const [delegationMap, ownershipMap] = await Promise.all([
      crawlDelegationEvents(adapterAddress, NETWORK, adapterFromBlock, crawlTo),
      crawlTransferEvents(lockNFTAddress, NETWORK, lockNFTFromBlock, crawlTo),
    ])

    logger.info('Step 2 result', llo({ delegations: delegationMap.size, ownerships: ownershipMap.size }))

    // ── Step 3: Attribute VP to Owners ──
    logger.info('Step 3: Attributing VP to token owners...')
    const { ownerRewards, invariant2Failures } = await attributeVPToOwners(
      activeVoters,
      delegationMap,
      ownershipMap,
      escrowAddress,
      hookEnabled,
      epochStart,
      NETWORK,
    )

    // INVARIANT 2
    const inv2Pass = invariant2Failures.length === 0
    logger.info(
      `INVARIANT 2: ${inv2Pass ? 'PASS' : 'FAIL'}  Per-voter token VP matches (${activeVoters.length - invariant2Failures.length}/${activeVoters.length} voters)`,
    )
    if (!inv2Pass) {
      for (const f of invariant2Failures) logger.error(`  INVARIANT 2 mismatch: ${f}`)
    }

    // INVARIANT 3
    let totalOwnerVP = 0n
    for (const r of ownerRewards) totalOwnerVP += r.votingPower

    const inv3Pass = totalOwnerVP === onChainTotal
    logger.info(
      `INVARIANT 3: ${inv3Pass ? 'PASS' : 'FAIL'}  SUM(owner credit) == on-chain total`,
      llo({ totalOwnerVP: totalOwnerVP.toString(), onChainTotal: onChainTotal.toString() }),
    )

    // ── Step 4: Report ──
    const reportLines = [
      '',
      '========== REWARD DISTRIBUTION REPORT ==========',
      `Plugin:          ${PLUGIN_ADDRESS}`,
      `Network:         ${NETWORK}`,
      `Epoch:           ${targetEpoch}`,
      `Hook enabled:    ${hookEnabled}`,
      `VP snapshot:     ${hookEnabled ? 'per-voter (at vote time)' : new Date(epochStart * 1000).toISOString()}`,
      `Escrow:          ${escrowAddress}`,
      `Adapter:         ${adapterAddress}`,
      `Lock NFT:        ${lockNFTAddress}`,
      '------------------------------------------------',
      `INVARIANT 1: ${inv1Pass ? 'PASS' : 'FAIL'}  SUM(usedVP) == on-chain total`,
      `INVARIANT 2: ${inv2Pass ? 'PASS' : 'FAIL'}  Per-voter token VP matches (${activeVoters.length - invariant2Failures.length}/${activeVoters.length} voters)`,
      `INVARIANT 3: ${inv3Pass ? 'PASS' : 'FAIL'}  SUM(owner credit) == on-chain total`,
      '------------------------------------------------',
      `Active Voters:   ${activeVoters.length}`,
      `Token Owners:    ${ownerRewards.length}`,
      `Total VP:        ${onChainTotal.toString()}`,
      '------------------------------------------------',
      `${'Owner'.padEnd(44)} | ${'Tokens'.padEnd(8)} | ${'VP'.padStart(22)} | Share`,
      '------------------------------------------------',
      ...ownerRewards
        .sort((a, b) => (b.votingPower > a.votingPower ? 1 : b.votingPower < a.votingPower ? -1 : 0))
        .map(({ owner, tokenIds, votingPower }) => {
          const pct = onChainTotal > 0n ? Number((votingPower * 10000n) / onChainTotal) / 100 : 0
          return `${owner.padEnd(44)} | ${tokenIds.join(', ').padEnd(8)} | ${votingPower.toString().padStart(22)} | ${pct.toFixed(2)}%`
        }),
      '================================================',
      '',
    ]

    for (const line of reportLines) {
      console.log(line)
    }
  },

  stop: async () => {},
}

export default RewardGeneratorVe
