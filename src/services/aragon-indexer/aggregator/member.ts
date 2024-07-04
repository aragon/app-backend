import DBCrawler from '@models/utils/crawler'
import { Models } from '@dbModels'
import logger from '@logger'
import DbTx from '@modules/dbTx'
import type Member from '@models/schema/member'
import { type Metrics } from '@models/schema/member'
import { NetworkHelper } from '@helpers/network'
import { NetworksEnum } from '@types'
import Web3Helper from '@helpers/web3'

const llo = logger.logMeta.bind(null, { service: 'indexer:aggregator:AggregatorMembers' })

export const AggregatorMembers = {
  start: async () => {
    logger.verbose('Start AggregatorMembers', llo({}))

    const supportedNetworks = NetworkHelper.supportedNetworks().map(network => network.networkName)
    const crawler = new DBCrawler({
      model: Models.LogMember,
      onDocument: AggregatorMembers.onDocument,
      onError: (error: any, document: any) => {
        logger.error('Error AggregatorMembers', llo({ error, document }))
      },
      useAggregate: true,
      aggregate: AggregatorMembers.query(
        AggregatorMembers.queryVotingPowerMembers(supportedNetworks),
        AggregatorMembers.queryMultisigMembers(supportedNetworks),
      ),
      batchSize: 1000,
      concurrency: 1,
    })

    await crawler.crawl()
    logger.verbose('End AggregatorMembers', llo({ lastTimeSync: crawler.crawlResult.lastCreatedAt }))
  },

  onDocument: async function (document: Partial<Member>) {
    const existingLog = await Models.Member.findExistingLog({ address: document.address! })
    document = await AggregatorMembers._getMemberData(document)

    await DbTx.executeTxFn(async ({ session }) => {
      let logDb: any

      if (!existingLog) {
        logDb = await Models.Member.create(document, { session } as any)
      } else {
        logDb = await existingLog.update(document, { session })
      }
      await session.commitTransaction()
      await session.endSession()
      logger.verbose(existingLog ? 'Update Aggregate Member' : 'New Aggregate Member', llo({ logId: logDb?.id }))
    })
  },

  query(votingPowerMembers: any, multisigMembers: any) {
    return [
      {
        $facet: {
          votingPowerMembers: [...votingPowerMembers],
          multisigMembers: [...multisigMembers],
        },
      },
      {
        $project: {
          allMembers: { $concatArrays: ['$votingPowerMembers', '$multisigMembers'] },
        },
      },
      { $unwind: '$allMembers' },
      { $replaceRoot: { newRoot: '$allMembers' } },
      {
        $group: {
          _id: '$address',
          history: { $push: '$history' },
          ens: { $first: '$ens' },
        },
      },
      {
        $project: {
          _id: 0,
          address: '$_id',
          ens: 1,
          history: {
            $reduce: {
              input: '$history',
              initialValue: [],
              in: { $concatArrays: ['$$value', '$$this'] },
            },
          },
        },
      },
    ]
  },

  queryVotingPowerMembers(networks: NetworksEnum[]) {
    return [
      {
        $match: {
          ...(networks?.length > 0 && { network: { $in: networks } }),
          event: 'DelegateChanged',
        },
      },
      { $sort: { blockNumber: 1, transactionHash: 1 } },
      {
        $group: {
          _id: { address: '$address' },
          events: { $push: '$$ROOT' },
        },
      },
      {
        $project: {
          _id: 0,
          address: '$_id.address',
          events: 1,
        },
      },
      {
        $lookup: {
          from: 'plugin',
          let: { pluginAddress: '$events.pluginAddress' },
          pipeline: [
            { $match: { $expr: { $in: ['$address', '$$pluginAddress'] } } },
            { $project: { subdomain: 1, daoAddress: 1, pluginAddress: '$address' } },
            { $limit: 1 },
          ],
          as: 'pluginDetails',
        },
      },
      { $unwind: '$pluginDetails' },

      {
        $addFields: {
          history: {
            $map: {
              input: { $range: [0, { $size: '$events' }] },
              as: 'idx',
              in: {
                network: { $arrayElemAt: ['$events.network', '$$idx'] },
                fromBlockNumber: { $arrayElemAt: ['$events.blockNumber', '$$idx'] },
                fromTxHash: { $arrayElemAt: ['$events.transactionHash', '$$idx'] },
                toBlockNumber: {
                  $cond: {
                    if: { $lt: ['$$idx', { $subtract: [{ $size: '$events' }, 1] }] },
                    then: { $arrayElemAt: ['$events.blockNumber', { $add: ['$$idx', 1] }] },
                    else: null,
                  },
                },
                toTxHash: {
                  $cond: {
                    if: { $lt: ['$$idx', { $subtract: [{ $size: '$events' }, 1] }] },
                    then: { $arrayElemAt: ['$events.transactionHash', { $add: ['$$idx', 1] }] },
                    else: null,
                  },
                },
                pluginAddress: '$pluginDetails.pluginAddress',
                pluginSubdomain: '$pluginDetails.subdomain',
                tokenAddress: { $arrayElemAt: ['$events.tokenAddress', '$$idx'] },
                daoAddress: '$pluginDetails.daoAddress',
                votingPower: { $arrayElemAt: ['$events.newVotingPower', '$$idx'] },
                delegateFromAddress: { $arrayElemAt: ['$events.fromDelegate', '$$idx'] },
                delegateToAddress: { $arrayElemAt: ['$events.toDelegate', '$$idx'] },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: '$address',
          history: { $push: '$history' },
        },
      },
      {
        $addFields: {
          history: {
            $reduce: {
              input: '$history',
              initialValue: [],
              in: { $concatArrays: ['$$value', '$$this'] },
            },
          },
        },
      },
      {
        $project: {
          _id: 0,
          address: '$_id',
          history: 1,
        },
      },
    ]
  },

  queryMultisigMembers(networks: NetworksEnum[]) {
    return [
      {
        $match: {
          ...(networks?.length > 0 && { network: { $in: networks } }),
          event: { $in: ['MembersAdded', 'MembersRemoved'] },
        },
      },
      {
        $sort: { blockNumber: 1, transactionHash: 1 },
      },
      {
        $group: {
          _id: {
            address: '$address',
            pluginAddress: '$pluginAddress',
            network: '$network',
          },
          events: { $push: '$$ROOT' },
        },
      },
      {
        $lookup: {
          from: 'logPluginSetupProcessor',
          localField: '_id.pluginAddress',
          foreignField: 'pluginAddress',
          pipeline: [
            { $match: { event: 'InstallationPrepared' } },
            { $project: { daoAddress: 1, pluginAddress: 1, pluginSetupRepo: 1 } },
          ],
          as: 'pluginInfo',
        },
      },
      {
        $lookup: {
          from: 'logPluginRepo',
          localField: 'pluginInfo.pluginSetupRepo',
          foreignField: 'pluginRepo',
          pipeline: [{ $project: { subdomain: 1 } }],
          as: 'pluginRepoInfo',
        },
      },
      {
        $project: {
          _id: 0,
          address: '$_id.address',
          pluginAddress: '$_id.pluginAddress',
          network: '$_id.network',
          events: 1,
          daoAddress: { $arrayElemAt: ['$pluginInfo.daoAddress', 0] },
          pluginSubdomain: { $arrayElemAt: ['$pluginRepoInfo.subdomain', 0] },
        },
      },
      {
        $addFields: {
          history: {
            $reduce: {
              input: '$events',
              initialValue: { isAdded: false, entries: [] },
              in: {
                $cond: {
                  if: { $eq: ['$$this.event', 'MembersAdded'] },
                  then: {
                    isAdded: true,
                    entries: {
                      $concatArrays: [
                        '$$value.entries',
                        [
                          {
                            network: '$network',
                            fromBlockNumber: '$$this.blockNumber',
                            fromTxHash: '$$this.transactionHash',
                            toBlockNumber: null,
                            toTxHash: null,
                            pluginAddress: '$$this.pluginAddress',
                            daoAddress: '$daoAddress',
                            pluginSubdomain: '$pluginSubdomain',
                          },
                        ],
                      ],
                    },
                  },
                  else: {
                    isAdded: false,
                    entries: {
                      $map: {
                        input: '$$value.entries',
                        as: 'entry',
                        in: {
                          $cond: {
                            if: {
                              $and: [
                                { $eq: ['$$entry.pluginAddress', '$$this.pluginAddress'] },
                                { $eq: ['$$entry.toBlockNumber', null] },
                              ],
                            },
                            then: {
                              network: '$$entry.network',
                              fromBlockNumber: '$$entry.fromBlockNumber',
                              fromTxHash: '$$entry.fromTxHash',
                              toBlockNumber: '$$this.blockNumber',
                              toTxHash: '$$this.transactionHash',
                              pluginAddress: '$$entry.pluginAddress',
                              daoAddress: '$$entry.daoAddress',
                              pluginSubdomain: '$$entry.pluginSubdomain',
                            },
                            else: '$$entry',
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      {
        $group: {
          _id: '$address',
          history: { $push: '$history.entries' },
        },
      },
      {
        $addFields: {
          history: {
            $reduce: {
              input: '$history',
              initialValue: [],
              in: { $concatArrays: ['$$value', '$$this'] },
            },
          },
        },
      },
      {
        $unwind: '$history',
      },
      {
        $sort: {
          'history.toTxHash': -1, // Sort by toTxHash, with non-null values coming first
          'history.fromBlockNumber': 1, // Then sort by fromBlockNumber
        },
      },
      {
        $group: {
          _id: '$_id',
          history: { $push: '$history' },
        },
      },
      {
        $project: {
          _id: 0,
          address: '$_id',
          history: 1,
        },
      },
    ]
  },

  async _getMemberData(member: Partial<Member>) {
    /**
     * Trying to get the ENS from the Ethereum network.
     */
    const userEns = await Web3Helper.getEnsFromAddress(member.address!, NetworksEnum.ethereumMainnet)

    const metrics: Metrics = {
      tokenBalance: '0',
      delegateCount: 0,
      proposalCount: 0,
      voteCount: 0,
    }

    for (const activity of member.history!) {
      if (activity.toBlockNumber === null && activity.tokenAddress) {
        const balance = await Web3Helper.getERC20Balance(member.address!, activity.tokenAddress, activity.network)
        metrics.tokenBalance = balance.toString()

        metrics.delegateCount = await Models.Delegate.countDocuments({
          toDelegate: member.address,
          tokenAddress: activity.tokenAddress,
        })

        const proposalMetrics = await AggregatorMembers._getUserProposalMetrics(member.address!, activity.pluginAddress)
        metrics.proposalCount = proposalMetrics[0].proposalsCreated
        metrics.voteCount = proposalMetrics[0].votesMade

        activity.metrics = metrics
      }
    }

    const memberActivityDates = await AggregatorMembers._getMemberActivityDates(member.address!)

    member.ens = userEns!
    member.firstActivity = memberActivityDates?.firstActivity
    member.lastActivity = memberActivityDates?.lastActivity

    return member
  },

  async _getMemberActivityDates(address: string) {
    const aggregationPipeline = [
      {
        $facet: {
          votes: [
            {
              $match: {
                memberAddress: address,
              },
            },
            {
              $group: {
                _id: { memberAddress: '$memberAddress', network: '$network' },
                firstActivity: { $min: '$blockNumber' },
                lastActivity: { $max: '$blockNumber' },
              },
            },
            {
              $project: {
                address: '$_id.memberAddress',
                network: '$_id.network',
                firstActivity: 1,
                lastActivity: 1,
              },
            },
          ],
          proposals: [
            {
              $match: {
                creatorAddress: address,
              },
            },
            {
              $group: {
                _id: { creatorAddress: '$creatorAddress', network: '$network' },
                firstActivity: { $min: '$blockNumber' },
                lastActivity: { $max: '$blockNumber' },
              },
            },
            {
              $project: {
                address: '$_id.creatorAddress',
                network: '$_id.network',
                firstActivity: 1,
                lastActivity: 1,
              },
            },
          ],
        },
      },
      {
        $project: {
          activities: {
            $concatArrays: ['$votes', '$proposals'],
          },
        },
      },
      {
        $unwind: '$activities',
      },
      {
        $group: {
          _id: { address: '$activities.address', network: '$activities.network' },
          firstActivity: { $min: '$activities.firstActivity' },
          lastActivity: { $max: '$activities.lastActivity' },
        },
      },
      {
        $project: {
          _id: 0,
          address: '$_id.address',
          network: '$_id.network',
          firstActivity: 1,
          lastActivity: 1,
        },
      },
    ]

    const activityResults = await Models.Vote.aggregate(aggregationPipeline)
    let firstActivityTimestamp = 0
    let lastActivityTimestamp = 0

    if (activityResults.length > 0) {
      const firstActivityBlock = activityResults[0].firstActivity
      const lastActivityBlock = activityResults[0].lastActivity
      const network = activityResults[0].network

      firstActivityTimestamp = await Web3Helper.getBlockTimestamp(firstActivityBlock, network)
      lastActivityTimestamp = await Web3Helper.getBlockTimestamp(lastActivityBlock, network)
    }

    return {
      firstActivity: firstActivityTimestamp,
      lastActivity: lastActivityTimestamp,
    }
  },

  async _getUserProposalMetrics(userAddress: string, pluginAddress: string) {
    const query = [
      {
        $match: {
          pluginAddress,
        },
      },
      {
        $facet: {
          proposalsCreated: [
            {
              $match: {
                creatorAddress: userAddress,
              },
            },
            {
              $count: 'count',
            },
          ],
          votesMade: [
            {
              $unwind: '$voteEvents',
            },
            {
              $match: {
                'voteEvents.memberAddress': userAddress,
              },
            },
            {
              $count: 'count',
            },
          ],
        },
      },
      {
        $project: {
          proposalsCreated: { $ifNull: [{ $arrayElemAt: ['$proposalsCreated.count', 0] }, 0] },
          votesMade: { $ifNull: [{ $arrayElemAt: ['$votesMade.count', 0] }, 0] },
        },
      },
    ]

    return Models.LogProposal.aggregate(query)
  },
}
