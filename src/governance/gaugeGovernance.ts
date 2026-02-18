import { Models } from '@dbModels'
import { BaseGovernance } from '@governance/baseGovernance'
import GaugeHelper from '@helpers/gauge'
import logger from '@logger'
import type Gauge from '@models/schema/gauge'
import { type ActiveVoter, type HexAddress, type NetworksEnum } from '@types'
import { GaugeMetrics } from '@services/aragon-dao/gaugeMetrics'

export class GaugeGovernance extends BaseGovernance {
  async getOrCreate(): Promise<any> {
    logger.warn('Gauge governance does not implement getOrCreate member', this.llo({}))
    return null
  }

  async create(): Promise<any> {
    logger.warn('Gauge governance does not implement create member', this.llo({}))
    return null
  }

  async update(): Promise<any> {
    logger.warn('Gauge governance does not implement update member', this.llo({}))
    return null
  }

  async delete(): Promise<boolean> {
    logger.warn('Gauge governance does not implement delete member', this.llo({}))
    return false
  }

  async findOne(): Promise<any> {
    logger.warn('Gauge governance does not implement findOne member', this.llo({}))
    return null
  }

  async findAndPaginateMembers(): Promise<any> {
    logger.warn('Gauge governance does not implement findAndPaginateMembers members', this.llo({}))
    return null
  }

  async updateDaoMetrics(): Promise<any> {
    logger.warn('Gauge governance does not implement updateDaoMetrics', this.llo({}))
    return null
  }

  static async getActiveVoters(
    pluginAddress: HexAddress,
    network: NetworksEnum,
    voteEnd: number,
  ): Promise<ActiveVoter[]> {
    const pipeline = [
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
          latestLogIndex: { $first: '$logIndex' },
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
          latestLogIndex: { $first: '$latestLogIndex' },
          latestTxHash: { $first: '$latestTxHash' },
          latestBlockTimestamp: { $first: '$latestBlockTimestamp' },
        },
      },
      { $match: { totalVotingPower: { $gt: 0 } } },
      {
        $addFields: {
          totalVotingPower: {
            $cond: {
              if: { $eq: ['$totalVotingPower', { $toDecimal: '0' }] },
              then: '0',
              else: {
                $convert: {
                  input: { $round: ['$totalVotingPower', 0] },
                  to: 'string',
                  onError: {
                    $toString: { $round: ['$totalVotingPower', 0] },
                  },
                },
              },
            },
          },
        },
      },
      { $sort: { latestBlock: -1 } },
    ]

    const memberVotes = await Models.VoteGauge.aggregate(pipeline)

    return memberVotes.map((vote: any) => ({
      voter: vote._id,
      usedVP: BigInt(vote.totalVotingPower),
      latestTxHash: vote.latestTxHash,
      latestBlock: vote.latestBlock,
      latestLogIndex: vote.latestLogIndex,
      latestBlockTimestamp: vote.latestBlockTimestamp,
    }))
  }

  /**
   * Returns per-gauge VP sums from active voters.
   * For each gauge, sums votingPowerCastForGauge across all active voters.
   * Used for INVARIANT 1b verification.
   */
  static async getPerGaugeVP(
    pluginAddress: HexAddress,
    network: NetworksEnum,
    voteEnd: number,
  ): Promise<Map<string, bigint>> {
    const pipeline = [
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
          totalVP: { $sum: { $toDecimal: '$votes.votingPower' } },
          votes: { $push: '$votes' },
        },
      },
      { $match: { totalVP: { $gt: 0 } } },
      { $unwind: '$votes' },
      {
        $group: {
          _id: '$votes._id',
          totalGaugeVP: { $sum: { $toDecimal: '$votes.votingPower' } },
        },
      },
    ]

    const result = await Models.VoteGauge.aggregate(pipeline)

    const gaugeVPMap = new Map<string, bigint>()
    for (const entry of result) {
      const vpStr = String(entry.totalGaugeVP).split('.')[0]
      gaugeVPMap.set(entry._id, BigInt(vpStr))
    }
    return gaugeVPMap
  }

  async createGauge(rawGauge: Partial<Gauge>): Promise<Gauge[]> {
    const gauge = await Models.Gauge.create(rawGauge)
    await GaugeMetrics.epochGaugeMetrics({
      epochId: await GaugeHelper.getGaugeEpochId(gauge.pluginAddress, gauge.network),
      gaugeAddress: gauge.address,
      pluginAddress: gauge.pluginAddress,
      network: gauge.network,
    })
    return gauge
  }
}
