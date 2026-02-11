import { Models } from '@dbModels'
import { GaugeVoter } from '@artifacts/GaugeVoter'
import { retryRequest } from '@helpers/retryRequest'
import logger from '@logger'
import BottleneckModule from '@modules/bottleneck'
import ProviderModule from '@modules/provider'
import { EnumConnection, type HexAddress, type IService, NetworksEnum } from '@types'
import { Contract, Interface } from 'ethers'

const llo = logger.logMeta.bind(null, { service: 'tool:rewardGeneratorVe' })

const PLUGIN_ADDRESS: HexAddress = '0x19513f8bFE5dC3AEAF12280C9C8DA25204c334b9'
const NETWORK = NetworksEnum.katanaMainnet

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
]

async function getClockAddress(pluginAddress: HexAddress, network: NetworksEnum): Promise<HexAddress> {
  const provider = ProviderModule.getAnyRpcProvider(network)
  const contract = new Contract(pluginAddress, GaugeVoter.abi, provider)
  return await retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => contract.clock()))
}

async function getEpochTiming(clockAddress: HexAddress, network: NetworksEnum) {
  const provider = ProviderModule.getAnyRpcProvider(network)
  const clock = new Contract(clockAddress, CLOCK_ABI, provider)

  const [epochDuration, voteDuration, currentEpoch] = await Promise.all([
    retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => clock.epochDuration())),
    retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => clock.voteDuration())),
    retryRequest(async () => BottleneckModule.getNodeLimiter(network).schedule(async () => clock.currentEpoch())),
  ])

  return {
    epochDuration: Number(epochDuration),
    voteDuration: Number(voteDuration),
    currentEpoch: Number(currentEpoch),
  }
}

function computeVoteEnd(epochId: number, epochDuration: number, voteDuration: number): number {
  const epochStart = epochId * epochDuration
  return epochStart + voteDuration
}

export const RewardGeneratorVe: IService = {
  NEED_CONNECTIONS: [EnumConnection.MONGODB, EnumConnection.BLOCKCHAIN],

  start: async () => {
    logger.info('Starting RewardGeneratorVe', llo({ pluginAddress: PLUGIN_ADDRESS, network: NETWORK }))

    // 1. Get the clock address from the plugin
    const clockAddress = await getClockAddress(PLUGIN_ADDRESS, NETWORK)
    logger.info('Clock address', llo({ clockAddress }))

    // 2. Get epoch timing from the clock
    const { epochDuration, voteDuration, currentEpoch } = await getEpochTiming(clockAddress, NETWORK)
    logger.info('Epoch timing', llo({ epochDuration, voteDuration, currentEpoch }))

    const targetEpoch = currentEpoch
    const voteEnd = computeVoteEnd(targetEpoch, epochDuration, voteDuration)
    const now = Math.floor(Date.now() / 1000)

    logger.info(
      'Target epoch',
      llo({
        targetEpoch,
        voteEnd,
        voteEndDate: new Date(voteEnd * 1000).toISOString(),
        votingEnded: now > voteEnd,
      }),
    )

    if (now <= voteEnd) {
      logger.error('Voting has not ended yet for this epoch', llo({ targetEpoch, voteEnd }))
      return
    }

    // 3. Aggregation: find latest tx per member, sum all VP from that tx
    const memberVotes = await Models.VoteGauge.aggregate([
      {
        $match: {
          pluginAddress: PLUGIN_ADDRESS,
          network: NETWORK,
          blockTimestamp: { $lte: voteEnd },
        },
      },
      { $sort: { blockNumber: -1, logIndex: -1 } },
      {
        $group: {
          _id: '$memberAddress',
          latestTxHash: { $first: '$transactionHash' },
          latestBlock: { $first: '$blockNumber' },
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
                    { $eq: ['$pluginAddress', PLUGIN_ADDRESS] },
                    { $eq: ['$network', NETWORK] },
                  ],
                },
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
          gaugeCount: { $sum: 1 },
        },
      },
    ])

    // 4. Calculate total voting power from DB
    let totalVotingPower = 0n
    const shares: { address: string; votingPower: bigint }[] = []
    for (const vote of memberVotes) {
      const vp = BigInt(vote.totalVotingPower.toString().split('.')[0])
      totalVotingPower += vp
      shares.push({ address: vote._id, votingPower: vp })
    }

    // 5. On-chain verification: get totalVotingPowerInContract from the latest event before voteEnd
    const latestVote = await Models.VoteGauge.findOne({
      pluginAddress: PLUGIN_ADDRESS,
      network: NETWORK,
      blockTimestamp: { $lte: voteEnd },
    }).sort({ blockNumber: -1, logIndex: -1 })

    let onChainTotal: bigint | null = null
    if (latestVote) {
      const provider = ProviderModule.getAnyRpcProvider(NETWORK)
      const receipt = await retryRequest(async () =>
        BottleneckModule.getNodeLimiter(NETWORK).schedule(async () =>
          provider.getTransactionReceipt(latestVote.transactionHash),
        ),
      )

      if (receipt) {
        const iface = new Interface(GaugeVoter.abi)
        const pluginLogs = receipt.logs.filter((log: any) => log.address.toLowerCase() === PLUGIN_ADDRESS.toLowerCase())

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

    const verified = onChainTotal !== null && onChainTotal === totalVotingPower
    if (!verified) {
      logger.error(
        'ON-CHAIN MISMATCH — reward distribution aborted',
        llo({
          onChainTotalVP: onChainTotal?.toString() ?? 'N/A',
          calculatedTotalVP: totalVotingPower.toString(),
        }),
      )
      return
    }

    // 6. Print report
    const _report = [
      '',
      '========== REWARD DISTRIBUTION REPORT ==========',
      `Plugin:          ${PLUGIN_ADDRESS}`,
      `Network:         ${NETWORK}`,
      `Epoch:           ${targetEpoch}`,
      `Vote End:        ${new Date(voteEnd * 1000).toISOString()}`,
      `Total VP:        ${totalVotingPower.toString()}`,
      `On-chain VP:     ${onChainTotal!.toString()}`,
      `Verified:        ${verified}`,
      `Unique Voters:   ${shares.length}`,
      `Verified Tx:     ${latestVote!.transactionHash}`,
      '------------------------------------------------',
      `${'Address'.padEnd(44)} | ${'VP'.padStart(24)} | Share`,
      '------------------------------------------------',
      ...shares
        .sort((a, b) => (b.votingPower > a.votingPower ? 1 : -1))
        .map(({ address, votingPower }) => {
          const pct = totalVotingPower > 0n ? Number((votingPower * 1000000n) / totalVotingPower) / 10000 : 0
          return `${address.padEnd(44)} | ${votingPower.toString().padStart(24)} | ${pct.toFixed(4)}%`
        }),
      '------------------------------------------------',
      '===============================================',
      '',
    ]
  },

  stop: async () => {},
}

export default RewardGeneratorVe
